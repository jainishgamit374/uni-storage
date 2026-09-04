import type { SupabaseClient } from "@supabase/supabase-js";

import type { RoutableAccount, RoutingPolicy } from "@/backend/shared/routing";

export const BUCKET = "nexdrive";

/**
 * Unified storage-provider contract. Every backing store (native object
 * storage, OAuth drives, S3-compatible endpoints) implements this shape, so
 * the upload pipeline never branches on provider type.
 */
export interface StorageFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  path: string;
}

export interface StorageQuota {
  used: number;
  total: number;
}

export abstract class StorageProvider {
  constructor(
    readonly accountId: string,
    readonly provider: string,
  ) {}
  /** True when bytes physically move; false for simulated adapters. */
  abstract readonly real: boolean;
  abstract getQuota(): Promise<StorageQuota>;
  abstract objectKey(userId: string, fileName: string): string;
  abstract getDownloadUrl(storageKey: string): Promise<string | null>;
  abstract deleteObject(storageKey: string): Promise<void>;
}

class NativeProvider extends StorageProvider {
  readonly real = true;
  constructor(
    accountId: string,
    private readonly db: SupabaseClient,
    private readonly quota: StorageQuota,
  ) {
    super(accountId, "nexdrive");
  }
  async getQuota() {
    return this.quota;
  }
  objectKey(userId: string, fileName: string) {
    const safe = fileName.replace(/[^\w.-]+/g, "_");
    return `${userId}/${crypto.randomUUID()}-${safe}`;
  }
  async getDownloadUrl(storageKey: string) {
    const { data } = await this.db.storage.from(BUCKET).createSignedUrl(storageKey, 60 * 10);
    return data?.signedUrl ?? null;
  }
  async deleteObject(storageKey: string) {
    await this.db.storage.from(BUCKET).remove([storageKey]);
  }
}

/** Real Google Drive adapter — bytes move, quota is read from Drive itself. */
class GoogleDriveProvider extends StorageProvider {
  readonly real = true;
  constructor(
    accountId: string,
    private readonly quota: StorageQuota,
  ) {
    super(accountId, "google-drive");
  }
  async getQuota() {
    const { getAccessToken, getDriveQuota } = await import("@/backend/services/google-drive.server");
    const token = await getAccessToken(this.accountId);
    const { used, total } = await getDriveQuota(token);
    return { used, total };
  }
  /** Drive assigns its own ids; the key is filled in after the upload call. */
  objectKey(_userId: string, fileName: string) {
    return `drive://pending/${fileName}`;
  }
  async list(folderPath = "/") {
    const { getAccessToken, ensureRootFolder, ensureFolderPath, listDriveFiles } =
      await import("@/backend/services/google-drive.server");
    const token = await getAccessToken(this.accountId);
    const root = await ensureRootFolder(this.accountId, token);
    const folder = await ensureFolderPath(token, root, folderPath);
    return listDriveFiles(token, folder);
  }
  async upload(params: { name: string; mimeType: string; folderPath: string; body: ArrayBuffer }) {
    const { getAccessToken, ensureRootFolder, ensureFolderPath, uploadDriveFile } =
      await import("@/backend/services/google-drive.server");
    const token = await getAccessToken(this.accountId);
    const root = await ensureRootFolder(this.accountId, token);
    const parent = await ensureFolderPath(token, root, params.folderPath);
    return uploadDriveFile({
      token,
      parentId: parent,
      name: params.name,
      mimeType: params.mimeType,
      body: params.body,
    });
  }
  async getDownloadUrl() {
    // Drive downloads are proxied through a signed, expiring server route.
    return null;
  }
  async rename(fileId: string, name: string) {
    const { getAccessToken, renameDriveFile } = await import("@/backend/services/google-drive.server");
    await renameDriveFile(await getAccessToken(this.accountId), fileId, name);
  }
  async move(fileId: string, folderPath: string) {
    const { getAccessToken, ensureRootFolder, ensureFolderPath, moveDriveFile } =
      await import("@/backend/services/google-drive.server");
    const token = await getAccessToken(this.accountId);
    const root = await ensureRootFolder(this.accountId, token);
    const parent = await ensureFolderPath(token, root, folderPath);
    await moveDriveFile(token, fileId, parent);
  }
  async deleteObject(fileId: string) {
    const { getAccessToken, deleteDriveFile } = await import("@/backend/services/google-drive.server");
    await deleteDriveFile(await getAccessToken(this.accountId), fileId);
  }
  cachedQuota() {
    return this.quota;
  }
}

class MockProvider extends StorageProvider {
  readonly real = false;
  constructor(
    accountId: string,
    provider: string,
    private readonly quota: StorageQuota,
  ) {
    super(accountId, provider);
  }
  async getQuota() {
    return this.quota;
  }
  objectKey(userId: string, fileName: string) {
    return `mock://${this.provider}/${userId}/${fileName}`;
  }
  async getDownloadUrl() {
    return null;
  }
  async deleteObject() {
    /* simulated adapter: nothing to remove */
  }
}

export function getProvider(account: RoutableAccount, db: SupabaseClient): StorageProvider {
  const quota = { used: account.quota_used, total: account.quota_total };
  if (account.provider === "nexdrive") return new NativeProvider(account.id, db, quota);
  if (account.provider === "google-drive" && !isMock(account)) {
    return new GoogleDriveProvider(account.id, quota);
  }
  return new MockProvider(account.id, account.provider, quota);
}

function isMock(account: RoutableAccount & { is_mock?: boolean }) {
  return account.is_mock !== false;
}

export function defaultPolicy(): RoutingPolicy {
  return { mode: "most-available", type_rules: [], folder_rules: [] };
}
