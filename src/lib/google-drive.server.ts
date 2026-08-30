import { decryptToken, encryptToken } from "./token-crypto.server";

/** Server-only Google Drive adapter + OAuth plumbing. */

export const GOOGLE_PROVIDER_ID = "google-drive";
/** Root folder created inside each connected Drive, matching the native bucket name. */
export const DRIVE_ROOT_FOLDER = "nexdrive";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export class ReauthRequiredError extends Error {
  constructor(message = "This Google account needs to be reconnected.") {
    super(message);
    this.name = "ReauthRequiredError";
  }
}

export function googleCredentials() {
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Project Settings → Secrets.",
    );
  }
  return { clientId, clientSecret };
}

export function googleConfigured() {
  return Boolean(process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]);
}

export function redirectUri(origin: string) {
  return process.env["GOOGLE_REDIRECT_URI"] || `${origin}/api/public/oauth/google/callback`;
}

export function buildAuthUrl(origin: string, state: string) {
  const { clientId } = googleCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent select_account",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    if (text.includes("invalid_grant")) throw new ReauthRequiredError();
    throw new Error(`Google token exchange failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as TokenResponse;
}

export async function exchangeCode(code: string, origin: string) {
  const { clientId, clientSecret } = googleCredentials();
  return tokenRequest({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(origin),
    grant_type: "authorization_code",
  });
}

export async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = googleCredentials();
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
}

export async function revokeToken(token: string) {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch {
    /* best effort: revocation failure must not block disconnect */
  }
}

export async function fetchGoogleProfile(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Could not read the Google profile [${res.status}]`);
  }
  return (await res.json()) as { id: string; email: string; name?: string; picture?: string };
}

/* -------------------------------------------------------------------------- */
/* Credential store (service-role only)                                        */
/* -------------------------------------------------------------------------- */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function saveCredentials(params: {
  userId: string;
  accountId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresIn: number;
}) {
  const db = await admin();
  const base = {
    user_id: params.userId,
    account_id: params.accountId,
    provider: GOOGLE_PROVIDER_ID,
    access_token_ciphertext: encryptToken(params.accessToken),
    token_expiry: new Date(Date.now() + params.expiresIn * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  const patch = params.refreshToken
    ? { ...base, refresh_token_ciphertext: encryptToken(params.refreshToken) }
    : base;
  const { error } = await db.from("oauth_credentials").upsert(patch, { onConflict: "account_id" });
  if (error) throw error;
}

export async function deleteCredentials(accountId: string) {
  const db = await admin();
  const { data } = await db
    .from("oauth_credentials")
    .select("access_token_ciphertext, refresh_token_ciphertext")
    .eq("account_id", accountId)
    .maybeSingle();
  if (data) {
    const secret = data.refresh_token_ciphertext ?? data.access_token_ciphertext;
    if (secret) {
      try {
        await revokeToken(decryptToken(secret));
      } catch {
        /* token may already be revoked */
      }
    }
  }
  await db.from("oauth_credentials").delete().eq("account_id", accountId);
}

async function markNeedsReauth(accountId: string) {
  const db = await admin();
  await db
    .from("connected_accounts")
    .update({ needs_reauth: true, status: "needs_reauth" })
    .eq("id", accountId);
}

/**
 * Returns a valid access token for the account, refreshing silently when the
 * stored one is expired. Throws ReauthRequiredError (after flagging the row)
 * when the refresh token is revoked or missing.
 */
export async function getAccessToken(accountId: string): Promise<string> {
  const db = await admin();
  const { data, error } = await db
    .from("oauth_credentials")
    .select("access_token_ciphertext, refresh_token_ciphertext, token_expiry, user_id")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    await markNeedsReauth(accountId);
    throw new ReauthRequiredError("No stored credentials for this Google account.");
  }

  const expiry = data.token_expiry ? new Date(data.token_expiry).getTime() : 0;
  const stillValid = data.access_token_ciphertext && expiry - Date.now() > 60_000;
  if (stillValid) return decryptToken(data.access_token_ciphertext!);

  if (!data.refresh_token_ciphertext) {
    await markNeedsReauth(accountId);
    throw new ReauthRequiredError();
  }

  try {
    const refreshed = await refreshAccessToken(decryptToken(data.refresh_token_ciphertext));
    await saveCredentials({
      userId: data.user_id,
      accountId,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? null,
      expiresIn: refreshed.expires_in,
    });
    await db
      .from("connected_accounts")
      .update({ needs_reauth: false, status: "connected" })
      .eq("id", accountId);
    return refreshed.access_token;
  } catch (err) {
    await markNeedsReauth(accountId);
    if (err instanceof ReauthRequiredError) throw err;
    throw new ReauthRequiredError();
  }
}

/* -------------------------------------------------------------------------- */
/* Drive v3 API                                                                */
/* -------------------------------------------------------------------------- */

async function driveFetch(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) throw new ReauthRequiredError();
    throw new Error(`Google Drive request failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  return res;
}

export async function getDriveQuota(token: string) {
  const res = await driveFetch(token, `${DRIVE_API}/about?fields=storageQuota,user`);
  const json = (await res.json()) as {
    storageQuota: { limit?: string; usage?: string; usageInDrive?: string };
    user?: { emailAddress?: string };
  };
  const total = Number(json.storageQuota.limit ?? 0);
  const used = Number(json.storageQuota.usage ?? json.storageQuota.usageInDrive ?? 0);
  return { used, total, email: json.user?.emailAddress ?? null };
}

async function findFolder(token: string, name: string, parent: string) {
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    `'${parent}' in parents`,
    "trashed = false",
  ].join(" and ");
  const res = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`,
  );
  const json = (await res.json()) as { files: { id: string }[] };
  return json.files[0]?.id ?? null;
}

async function createFolder(token: string, name: string, parent: string) {
  const res = await driveFetch(token, `${DRIVE_API}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parent],
    }),
  });
  const json = (await res.json()) as { id: string };
  return json.id;
}

async function ensureFolder(token: string, name: string, parent: string) {
  return (await findFolder(token, name, parent)) ?? (await createFolder(token, name, parent));
}

/** Find-or-create the "nexdrive" root folder for an account, caching its id. */
export async function ensureRootFolder(accountId: string, token: string): Promise<string> {
  const db = await admin();
  const { data: account } = await db
    .from("connected_accounts")
    .select("root_folder_id")
    .eq("id", accountId)
    .maybeSingle();

  if (account?.root_folder_id) {
    try {
      await driveFetch(token, `${DRIVE_API}/files/${account.root_folder_id}?fields=id,trashed`);
      return account.root_folder_id;
    } catch {
      /* folder was deleted in Drive — recreate below */
    }
  }
  const id = await ensureFolder(token, DRIVE_ROOT_FOLDER, "root");
  await db.from("connected_accounts").update({ root_folder_id: id }).eq("id", accountId);
  return id;
}

/** Resolve "/clients/acme" into a nested folder chain under the nexdrive root. */
export async function ensureFolderPath(token: string, rootId: string, folderPath: string) {
  const segments = folderPath.split("/").filter(Boolean);
  let parent = rootId;
  for (const segment of segments) {
    parent = await ensureFolder(token, segment, parent);
  }
  return parent;
}

export async function listDriveFiles(token: string, folderId: string) {
  const q = `'${folderId}' in parents and trashed = false`;
  const res = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,mimeType,modifiedTime)&pageSize=200`,
  );
  const json = (await res.json()) as {
    files: { id: string; name: string; size?: string; mimeType: string; modifiedTime: string }[];
  };
  return json.files.map((f) => ({
    id: f.id,
    name: f.name,
    size: Number(f.size ?? 0),
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
  }));
}

/** Streams bytes straight through to Drive — nothing is persisted on our server. */
export async function uploadDriveFile(params: {
  token: string;
  parentId: string;
  name: string;
  mimeType: string;
  body: ArrayBuffer | Uint8Array;
}) {
  const boundary = `nexdrive${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: params.name, parents: [params.parentId] });
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${params.mimeType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--`);
  const payload = Buffer.concat([head, Buffer.from(params.body as ArrayBuffer), tail]);

  const res = await driveFetch(
    params.token,
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name,size,mimeType`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: payload,
    },
  );
  return (await res.json()) as { id: string; name: string; size?: string; mimeType: string };
}

export async function downloadDriveFile(token: string, fileId: string) {
  const meta = await driveFetch(token, `${DRIVE_API}/files/${fileId}?fields=name,mimeType,size`);
  const info = (await meta.json()) as { name: string; mimeType: string };
  const res = await driveFetch(token, `${DRIVE_API}/files/${fileId}?alt=media`);
  return { stream: res.body, name: info.name, mimeType: info.mimeType };
}

export async function renameDriveFile(token: string, fileId: string, name: string) {
  await driveFetch(token, `${DRIVE_API}/files/${fileId}?fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function moveDriveFile(token: string, fileId: string, newParentId: string) {
  const res = await driveFetch(token, `${DRIVE_API}/files/${fileId}?fields=parents`);
  const json = (await res.json()) as { parents?: string[] };
  const remove = (json.parents ?? []).join(",");
  const qs = new URLSearchParams({ addParents: newParentId, fields: "id" });
  if (remove) qs.set("removeParents", remove);
  await driveFetch(token, `${DRIVE_API}/files/${fileId}?${qs.toString()}`, { method: "PATCH" });
}

export async function deleteDriveFile(token: string, fileId: string) {
  try {
    await driveFetch(token, `${DRIVE_API}/files/${fileId}`, { method: "DELETE" });
  } catch (err) {
    // A file already gone from Drive should not block removing our metadata row.
    if (err instanceof ReauthRequiredError) throw err;
  }
}
