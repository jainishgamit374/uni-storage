import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Minimal structural shape of the request-scoped Supabase client. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (table: string) => any };

const GOOGLE_PROVIDER_ID = "google-drive";

function originFromRequest() {
  return new URL(getRequest().url).origin;
}

/** Reports whether Google OAuth is configured, without leaking any values. */
export const googleOauthStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { googleConfigured, redirectUri } = await import("@/backend/services/google-drive.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return {
      configured: await googleConfigured(),
      redirectUri: await redirectUri(originFromRequest()),
      isAdmin: Boolean(isAdmin),
    };
  });

/** Builds the real Google consent URL with a CSRF-safe, expiring signed state. */
export const startGoogleConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ buildAuthUrl }, { signPayload, randomNonce }] = await Promise.all([
      import("@/backend/services/google-drive.server"),
      import("@/backend/services/token-crypto.server"),
    ]);
    const origin = originFromRequest();
    const state = signPayload({ u: context.userId, n: randomNonce() }, 600);
    return { url: await buildAuthUrl(origin, state) };
  });

async function ownedGoogleAccount(supabase: SupabaseLike, userId: string, accountId: string) {
  const { data } = await supabase
    .from("connected_accounts")
    .select("id, provider, is_mock, root_folder_id, quota_used, quota_total, label")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Account not found.");
  if (data.provider !== GOOGLE_PROVIDER_ID || data.is_mock) {
    throw new Error("This action only applies to a live Google Drive connection.");
  }
  return data as {
    id: string;
    provider: string;
    is_mock: boolean;
    root_folder_id: string | null;
    quota_used: number;
    quota_total: number;
    label: string;
  };
}

/** Pulls real Drive storage numbers into the account row. */
export const syncGoogleQuota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ accountId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ownedGoogleAccount(supabase as never, userId, data.accountId);
    const { getAccessToken, getDriveQuota, ReauthRequiredError } =
      await import("@/backend/services/google-drive.server");
    try {
      const token = await getAccessToken(data.accountId);
      const quota = await getDriveQuota(token);
      const { error } = await supabase
        .from("connected_accounts")
        .update({
          quota_total: quota.total,
          quota_used: quota.used,
          needs_reauth: false,
          status: "connected",
        })
        .eq("id", data.accountId)
        .eq("user_id", userId);
      if (error) throw error;
      return { ok: true as const, used: quota.used, total: quota.total };
    } catch (err) {
      if (err instanceof ReauthRequiredError) {
        return { ok: false as const, reauth: true, used: 0, total: 0 };
      }
      throw err;
    }
  });

/** Lists what actually lives in the managed nexdrive folder of a Drive account. */
export const listGoogleDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ accountId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ownedGoogleAccount(supabase as never, userId, data.accountId);
    const { getAccessToken, ensureRootFolder, listDriveFiles } =
      await import("@/backend/services/google-drive.server");
    const token = await getAccessToken(data.accountId);
    const root = await ensureRootFolder(data.accountId, token);
    return { files: await listDriveFiles(token, root) };
  });

const uploadSchema = z.object({
  jobId: z.string().uuid(),
  accountId: z.string().uuid(),
});

/** Streams the uploaded bytes through the server straight into Drive. */
export const uploadToGoogleDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("Expected multipart form data.");
    const file = input.get("file");
    if (!(file instanceof File)) throw new Error("No file supplied.");
    const meta = uploadSchema.parse({
      jobId: input.get("jobId"),
      accountId: input.get("accountId"),
    });
    return { ...meta, file };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // The job is the authority: it decides the account, name and folder that
    // planUpload approved, so a tampered form cannot retarget the upload.
    const { data: job } = await supabase
      .from("upload_jobs")
      .select("id, account_id, file_name, folder_path, mime_type, status")
      .eq("id", data.jobId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!job) throw new Error("Upload job not found.");
    if (job.status !== "uploading") throw new Error("This upload is no longer in progress.");
    if (job.account_id !== data.accountId) throw new Error("Upload job does not match account.");

    await ownedGoogleAccount(supabase as never, userId, data.accountId);
    const { getAccessToken, ensureRootFolder, ensureFolderPath, uploadDriveFile } =
      await import("@/backend/services/google-drive.server");

    try {
      const token = await getAccessToken(data.accountId);
      const root = await ensureRootFolder(data.accountId, token);
      const parent = await ensureFolderPath(token, root, job.folder_path ?? "/");
      const bytes = await data.file.arrayBuffer();
      const uploaded = await uploadDriveFile({
        token,
        parentId: parent,
        name: job.file_name,
        mimeType: job.mime_type || "application/octet-stream",
        body: bytes,
      });
      // Record the real key + byte count on the job so commitUpload never has
      // to trust anything the browser sends back.
      await supabase
        .from("upload_jobs")
        .update({ storage_key: uploaded.id, size: data.file.size, progress: 95 })
        .eq("id", job.id)
        .eq("user_id", userId);
      return { ok: true as const, fileId: uploaded.id, size: data.file.size };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Drive upload failed.";
      await supabase
        .from("upload_jobs")
        .update({ status: "failed", error: message, progress: 0 })
        .eq("id", data.jobId)
        .eq("user_id", userId);
      throw new Error(message);
    }
  });

/** Renames a stored file, on Drive as well when it lives on a live Google account. */
export const renameStoredFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), name: z.string().min(1).max(255) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: file } = await supabase
      .from("stored_files")
      .select("id, storage_key, is_mock, account_id")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!file) throw new Error("File not found.");

    if (file.account_id && file.storage_key && !file.is_mock) {
      const { data: account } = await supabase
        .from("connected_accounts")
        .select("provider")
        .eq("id", file.account_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (account?.provider === GOOGLE_PROVIDER_ID) {
        const { getAccessToken, renameDriveFile } = await import("@/backend/services/google-drive.server");
        const token = await getAccessToken(file.account_id);
        await renameDriveFile(token, file.storage_key, data.name);
      }
    }

    const { error } = await supabase
      .from("stored_files")
      .update({ name: data.name })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

/** Moves a stored file to another folder path, mirrored into Drive when live. */
export const moveStoredFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), folderPath: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const folderPath = data.folderPath.startsWith("/") ? data.folderPath : `/${data.folderPath}`;
    const { data: file } = await supabase
      .from("stored_files")
      .select("id, storage_key, is_mock, account_id")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!file) throw new Error("File not found.");

    if (file.account_id && file.storage_key && !file.is_mock) {
      const { data: account } = await supabase
        .from("connected_accounts")
        .select("provider")
        .eq("id", file.account_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (account?.provider === GOOGLE_PROVIDER_ID) {
        const { getAccessToken, ensureRootFolder, ensureFolderPath, moveDriveFile } =
          await import("@/backend/services/google-drive.server");
        const token = await getAccessToken(file.account_id);
        const root = await ensureRootFolder(file.account_id, token);
        const parent = await ensureFolderPath(token, root, folderPath);
        await moveDriveFile(token, file.storage_key, parent);
      }
    }

    const { error } = await supabase
      .from("stored_files")
      .update({ folder_path: folderPath })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });
