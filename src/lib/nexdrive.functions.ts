import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getProvider, defaultPolicy } from "./nexdrive.server";
import { resolveProvider, type RoutableAccount, type RoutingPolicy } from "./routing";
import {
  NATIVE_MAX_BYTES,
  isRoutingMode,
  MOCKABLE_PROVIDERS,
  normalizeFolderPath,
  sanitizeFileName,
  validateMimeType,
  validateSize,
} from "./validation";

const ACCOUNT_COLUMNS =
  "id, provider, label, is_mock, status, priority, quota_used, quota_total, config, created_at, external_email, needs_reauth";

export const getOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [accountsRes, policyRes, filesRes, jobsRes] = await Promise.all([
      supabase
        .from("connected_accounts")
        .select(ACCOUNT_COLUMNS)
        .eq("user_id", userId)
        .order("priority", { ascending: true }),
      supabase.from("routing_policies").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("stored_files")
        .select("id, name, size, mime_type, folder_path, account_id, is_mock, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("upload_jobs")
        .select("id, file_name, size, status, progress, routed_by, error, account_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (accountsRes.error) throw accountsRes.error;

    const policyRow = policyRes.data;
    const policy: RoutingPolicy = policyRow
      ? {
          mode: policyRow.mode,
          type_rules: (policyRow.type_rules as unknown as RoutingPolicy["type_rules"]) ?? [],
          folder_rules: (policyRow.folder_rules as unknown as RoutingPolicy["folder_rules"]) ?? [],
        }
      : defaultPolicy();

    return {
      accounts: accountsRes.data ?? [],
      policy,
      files: filesRes.data ?? [],
      jobs: jobsRes.data ?? [],
    };
  });

const planSchema = z.object({
  name: z.string().min(1).max(1024),
  size: z.number(),
  mimeType: z.string().max(300).optional(),
  folderPath: z.string().max(1024).optional(),
});

export const planUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const raw = planSchema.parse(input);
    return {
      name: sanitizeFileName(raw.name),
      size: validateSize(raw.size),
      mimeType: validateMimeType(raw.mimeType),
      folderPath: normalizeFolderPath(raw.folderPath ?? "/"),
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: accounts }, { data: policyRow }, { count }] = await Promise.all([
      supabase.from("connected_accounts").select(ACCOUNT_COLUMNS).eq("user_id", userId),
      supabase.from("routing_policies").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("upload_jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);

    const pool = (accounts ?? []) as unknown as RoutableAccount[];
    const policy: RoutingPolicy = policyRow
      ? {
          mode: policyRow.mode,
          type_rules: (policyRow.type_rules as unknown as RoutingPolicy["type_rules"]) ?? [],
          folder_rules: (policyRow.folder_rules as unknown as RoutingPolicy["folder_rules"]) ?? [],
        }
      : defaultPolicy();

    const decision = resolveProvider(pool, policy, {
      name: data.name,
      size: data.size,
      mimeType: data.mimeType,
      folderPath: data.folderPath,
      uploadCount: count ?? 0,
    });

    if (!decision) throw new Error("No connected account can accept this upload.");

    // The native bucket has a hard per-object ceiling; fail before bytes move.
    if (decision.account.provider === "nexdrive") {
      validateSize(data.size, { max: NATIVE_MAX_BYTES });
    }

    const provider = getProvider(decision.account, supabase);
    const real = provider.real;
    const transport = real
      ? decision.account.provider === "google-drive"
        ? ("drive" as const)
        : ("supabase" as const)
      : ("mock" as const);
    // Server-generated key; the browser never gets to choose where bytes land.
    const storageKey = provider.objectKey(userId, data.name);

    const { data: job, error } = await supabase
      .from("upload_jobs")
      .insert({
        user_id: userId,
        account_id: decision.account.id,
        file_name: data.name,
        size: data.size,
        mime_type: data.mimeType,
        folder_path: data.folderPath,
        storage_key: transport === "supabase" ? storageKey : null,
        is_real: real,
        status: "uploading",
        progress: 0,
        routed_by: decision.reason,
      })
      .select("id")
      .single();
    if (error) throw error;

    return {
      jobId: job.id,
      accountId: decision.account.id,
      provider: decision.account.provider,
      accountLabel: decision.account.label,
      reason: decision.reason,
      real,
      transport,
      bucket: "nexdrive",
      storageKey,
      folderPath: data.folderPath,
      name: data.name,
    };
  });

const commitSchema = z.object({
  jobId: z.string().uuid(),
  error: z.string().max(500).nullable().optional(),
});

/**
 * Finalises an upload strictly from the server-owned job row: name, size,
 * account, folder, storage key and "real" flag all come from the database, so
 * a tampered client cannot retarget another account, forge a storage key or
 * inflate quota. Idempotent — a repeated commit returns the same file id.
 */
export const commitUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => commitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: job } = await supabase
      .from("upload_jobs")
      .select(
        "id, account_id, file_name, size, mime_type, folder_path, storage_key, is_real, status",
      )
      .eq("id", data.jobId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!job) throw new Error("Upload job not found.");

    if (data.error) {
      await supabase
        .from("upload_jobs")
        .update({ status: "failed", error: data.error.slice(0, 500), progress: 0 })
        .eq("id", job.id)
        .eq("user_id", userId);
      return { ok: false as const, fileId: null as string | null };
    }

    // Idempotency: the unique index on upload_job_id makes a retry a no-op.
    const { data: already } = await supabase
      .from("stored_files")
      .select("id")
      .eq("upload_job_id", job.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (already) return { ok: true as const, fileId: already.id };

    if (job.status === "failed") throw new Error("This upload already failed.");

    // The account must still exist and belong to the caller (disconnect race).
    const { data: account } = await supabase
      .from("connected_accounts")
      .select("id")
      .eq("id", job.account_id ?? "")
      .eq("user_id", userId)
      .maybeSingle();
    if (!account) {
      await supabase
        .from("upload_jobs")
        .update({ status: "failed", error: "Destination account was disconnected.", progress: 0 })
        .eq("id", job.id)
        .eq("user_id", userId);
      throw new Error("The destination account was disconnected during the upload.");
    }

    const { data: file, error } = await supabase
      .from("stored_files")
      .insert({
        user_id: userId,
        account_id: account.id,
        upload_job_id: job.id,
        name: job.file_name,
        size: job.size,
        mime_type: job.mime_type,
        folder_path: job.folder_path,
        storage_key: job.is_real ? job.storage_key : null,
        is_mock: !job.is_real,
      })
      .select("id")
      .single();
    if (error) {
      // A concurrent commit won the unique index — return its row.
      const { data: raced } = await supabase
        .from("stored_files")
        .select("id")
        .eq("upload_job_id", job.id)
        .eq("user_id", userId)
        .maybeSingle();
      if (raced) return { ok: true as const, fileId: raced.id };
      throw error;
    }

    await supabase
      .from("upload_jobs")
      .update({ status: "complete", progress: 100, error: null })
      .eq("id", job.id)
      .eq("user_id", userId);

    await recalcQuota(supabase, account.id);

    return { ok: true as const, fileId: file.id };
  });

/**
 * Recomputes an account's used bytes from the files that actually exist, so a
 * failed or duplicated upload can never leave the quota drifting.
 */
async function recalcQuota(
  supabase: {
    rpc: (fn: "recalc_account_quota", args: { _account_id: string }) => PromiseLike<unknown>;
  },
  accountId: string,
) {
  try {
    await supabase.rpc("recalc_account_quota", { _account_id: accountId });
  } catch {
    /* quota is derived data; never fail the user's operation over it */
  }
}

export const deleteFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: file } = await supabase
      .from("stored_files")
      .select("id, size, storage_key, account_id, is_mock")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!file) throw new Error("File not found.");

    type AccountRow = { provider: string; quota_used: number };
    let account: AccountRow | null = null;
    if (file.account_id) {
      const { data: row } = await supabase
        .from("connected_accounts")
        .select("provider, quota_used")
        .eq("id", file.account_id)
        .eq("user_id", userId)
        .maybeSingle();
      account = (row as AccountRow | null) ?? null;
    }

    if (file.storage_key && !file.is_mock) {
      try {
        if (account?.provider === "google-drive") {
          const { getAccessToken, deleteDriveFile } = await import("./google-drive.server");
          const token = await getAccessToken(file.account_id!);
          await deleteDriveFile(token, file.storage_key);
        } else {
          await supabase.storage.from("nexdrive").remove([file.storage_key]);
        }
      } catch (err) {
        // Already gone remotely, or the provider is down: drop our row anyway
        // rather than leaving an undeletable ghost in the file manager.
        console.error("[deleteFile] remote delete failed", err);
      }
    }

    await supabase.from("stored_files").delete().eq("id", file.id).eq("user_id", userId);

    if (file.account_id && account) {
      await recalcQuota(supabase, file.account_id);
    }
    return { ok: true };
  });

export const getDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), inline: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: file } = await supabase
      .from("stored_files")
      .select("id, storage_key, is_mock, account_id, mime_type, name")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!file) throw new Error("File not found.");
    if (file.is_mock || !file.storage_key) {
      return { url: null as string | null, mock: true, mimeType: file.mime_type ?? null };
    }

    if (file.account_id) {
      const { data: account } = await supabase
        .from("connected_accounts")
        .select("provider")
        .eq("id", file.account_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (account?.provider === "google-drive") {
        const [{ signPayload }, { getRequest }] = await Promise.all([
          import("./token-crypto.server"),
          import("@tanstack/react-start/server"),
        ]);
        const origin = new URL(getRequest().url).origin;
        // Bind the link to the owner + file so a tampered token cannot be
        // pointed at another account's object.
        const token = signPayload(
          {
            a: file.account_id,
            f: file.storage_key,
            u: userId,
            i: file.id,
            d: data.inline ? "i" : "a",
          },
          300,
        );
        return {
          url: `${origin}/api/public/drive/download?t=${encodeURIComponent(token)}`,
          mock: false,
          mimeType: file.mime_type ?? null,
        };
      }
    }

    const { data: signed, error } = await supabase.storage
      .from("nexdrive")
      .createSignedUrl(file.storage_key, 600);
    if (error) throw error;
    return { url: signed?.signedUrl ?? null, mock: false, mimeType: file.mime_type ?? null };
  });

const MAX_ACCOUNTS_PER_USER = 25;

const connectSchema = z.object({
  provider: z.enum(MOCKABLE_PROVIDERS),
  label: z.string().trim().min(1).max(80),
  quotaTotal: z
    .number()
    .int()
    .positive()
    .max(1024 * 1024 * 1024 * 1024 * 100),
  config: z.record(z.string().max(200)).default({}),
});

export const connectAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => connectSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { count } = await supabase
      .from("connected_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((count ?? 0) >= MAX_ACCOUNTS_PER_USER) {
      throw new Error("Account limit reached.");
    }

    const { data: row, error } = await supabase
      .from("connected_accounts")
      .insert({
        user_id: userId,
        provider: data.provider,
        label: data.label,
        // Manual connections are always simulated; a live account can only be
        // created by a verified OAuth callback.
        is_mock: true,
        quota_total: data.quotaTotal,
        quota_used: 0,
        priority: ((count ?? 0) + 1) * 10,
        config: data.config,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const disconnectAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Ownership check first: RLS scopes the row, and we only touch this one id.
    const { data: account } = await supabase
      .from("connected_accounts")
      .select("id, provider")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!account) throw new Error("Account not found.");

    if (account.provider === "google-drive") {
      const { deleteCredentials } = await import("./google-drive.server");
      await deleteCredentials(account.id);
    }

    const { error } = await supabase
      .from("connected_accounts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

const policySchema = z.object({
  mode: z.string().refine(isRoutingMode, "Unknown routing mode."),
  typeRules: z
    .array(z.object({ match: z.string().trim().min(1).max(60), accountId: z.string().uuid() }))
    .max(50)
    .default([]),
  folderRules: z
    .array(z.object({ prefix: z.string().trim().min(1).max(200), accountId: z.string().uuid() }))
    .max(50)
    .default([]),
});

export const updatePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => policySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Rules may only reference accounts the caller actually owns.
    const referenced = [
      ...data.typeRules.map((r) => r.accountId),
      ...data.folderRules.map((r) => r.accountId),
    ];
    if (referenced.length) {
      const { data: owned } = await supabase
        .from("connected_accounts")
        .select("id")
        .eq("user_id", userId)
        .in("id", Array.from(new Set(referenced)));
      const ownedIds = new Set((owned ?? []).map((a) => a.id));
      if (referenced.some((id) => !ownedIds.has(id))) {
        throw new Error("A routing rule references an unknown account.");
      }
    }

    const { error } = await supabase.from("routing_policies").upsert(
      {
        user_id: userId,
        mode: data.mode,
        type_rules: data.typeRules,
        folder_rules: data.folderRules,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;
    return { ok: true };
  });
