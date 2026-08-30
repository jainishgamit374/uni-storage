import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getProvider, defaultPolicy } from "./nexdrive.server";
import { resolveProvider, type RoutableAccount, type RoutingPolicy } from "./routing";

const ACCOUNT_COLUMNS =
  "id, provider, label, is_mock, status, priority, quota_used, quota_total, config, created_at";

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
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  folderPath: z.string().default("/"),
});

export const planUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => planSchema.parse(input))
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

    const provider = getProvider(decision.account, supabase);
    const storageKey = provider.objectKey(userId, data.name);

    const { data: job, error } = await supabase
      .from("upload_jobs")
      .insert({
        user_id: userId,
        account_id: decision.account.id,
        file_name: data.name,
        size: data.size,
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
      real: provider.real,
      transport: provider.real
        ? decision.account.provider === "google-drive"
          ? ("drive" as const)
          : ("supabase" as const)
        : ("mock" as const),
      bucket: "nexdrive",
      storageKey,
    };
  });

const commitSchema = z.object({
  jobId: z.string().uuid(),
  accountId: z.string().uuid(),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  folderPath: z.string().default("/"),
  storageKey: z.string().min(1),
  real: z.boolean(),
  error: z.string().nullable().optional(),
});

export const commitUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => commitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.error) {
      await supabase
        .from("upload_jobs")
        .update({ status: "failed", error: data.error, progress: 0 })
        .eq("id", data.jobId)
        .eq("user_id", userId);
      return { ok: false as const };
    }

    const { data: file, error } = await supabase
      .from("stored_files")
      .insert({
        user_id: userId,
        account_id: data.accountId,
        name: data.name,
        size: data.size,
        mime_type: data.mimeType,
        folder_path: data.folderPath,
        storage_key: data.real ? data.storageKey : null,
        is_mock: !data.real,
      })
      .select("id")
      .single();
    if (error) throw error;

    await supabase
      .from("upload_jobs")
      .update({ status: "complete", progress: 100 })
      .eq("id", data.jobId)
      .eq("user_id", userId);

    const { data: account } = await supabase
      .from("connected_accounts")
      .select("quota_used")
      .eq("id", data.accountId)
      .eq("user_id", userId)
      .maybeSingle();

    if (account) {
      await supabase
        .from("connected_accounts")
        .update({ quota_used: Number(account.quota_used) + data.size })
        .eq("id", data.accountId)
        .eq("user_id", userId);
    }

    return { ok: true as const, fileId: file.id };
  });

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
      if (account?.provider === "google-drive") {
        const { getAccessToken, deleteDriveFile } = await import("./google-drive.server");
        const token = await getAccessToken(file.account_id!);
        await deleteDriveFile(token, file.storage_key);
      } else {
        await supabase.storage.from("nexdrive").remove([file.storage_key]);
      }
    }

    await supabase.from("stored_files").delete().eq("id", file.id).eq("user_id", userId);

    if (file.account_id && account) {
      await supabase
        .from("connected_accounts")
        .update({ quota_used: Math.max(Number(account.quota_used) - Number(file.size), 0) })
        .eq("id", file.account_id)
        .eq("user_id", userId);
    }
    return { ok: true };
  });

export const getDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: file } = await supabase
      .from("stored_files")
      .select("id, storage_key, is_mock, account_id")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!file) throw new Error("File not found.");
    if (file.is_mock || !file.storage_key) {
      return { url: null as string | null, mock: true };
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
        const token = signPayload({ a: file.account_id, f: file.storage_key }, 300);
        return {
          url: `${origin}/api/public/drive/download?t=${encodeURIComponent(token)}`,
          mock: false,
        };
      }
    }

    const { data: signed, error } = await supabase.storage
      .from("nexdrive")
      .createSignedUrl(file.storage_key, 600);
    if (error) throw error;
    return { url: signed?.signedUrl ?? null, mock: false };
  });

const connectSchema = z.object({
  provider: z.string().min(1),
  label: z.string().min(1),
  quotaTotal: z.number().int().positive(),
  config: z.record(z.string()).default({}),
  isMock: z.boolean().default(true),
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

    const { data: row, error } = await supabase
      .from("connected_accounts")
      .insert({
        user_id: userId,
        provider: data.provider,
        label: data.label,
        is_mock: data.isMock,
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
  mode: z.string().min(1),
  typeRules: z.array(z.object({ match: z.string(), accountId: z.string() })).default([]),
  folderRules: z.array(z.object({ prefix: z.string(), accountId: z.string() })).default([]),
});

export const updatePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => policySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
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
