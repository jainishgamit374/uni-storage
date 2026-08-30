import type { SupabaseClient } from "@supabase/supabase-js";

import type { RoutableAccount, RoutingPolicy } from "./routing";

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
    const safe = fileName.replace(/[^\w.\-]+/g, "_");
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
  return new MockProvider(account.id, account.provider, quota);
}

export function defaultPolicy(): RoutingPolicy {
  return { mode: "most-available", type_rules: [], folder_rules: [] };
}
