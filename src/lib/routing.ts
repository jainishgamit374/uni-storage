import type { FolderRule, RoutingMode, TypeRule } from "./providers";

export interface RoutableAccount {
  id: string;
  provider: string;
  label: string;
  priority: number;
  quota_used: number;
  quota_total: number;
  status: string;
}

export interface RoutingPolicy {
  mode: RoutingMode | string;
  type_rules: TypeRule[];
  folder_rules: FolderRule[];
}

export interface RoutingInput {
  name: string;
  size: number;
  mimeType: string;
  folderPath: string;
  /** Number of uploads already made, used by round-robin. */
  uploadCount: number;
}

export interface RoutingDecision {
  account: RoutableAccount;
  reason: string;
}

function free(a: RoutableAccount) {
  return Math.max(a.quota_total - a.quota_used, 0);
}

function matchesType(rule: TypeRule, input: RoutingInput) {
  const m = rule.match.trim().toLowerCase();
  if (!m) return false;
  if (m.startsWith(".")) return input.name.toLowerCase().endsWith(m);
  if (m.endsWith("/*")) return input.mimeType.toLowerCase().startsWith(m.slice(0, -1));
  return input.mimeType.toLowerCase() === m;
}

function normalizeFolder(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return p.endsWith("/") ? p : `${p}/`;
}

export function resolveProvider(
  accounts: RoutableAccount[],
  policy: RoutingPolicy,
  input: RoutingInput,
): RoutingDecision | null {
  const usable = accounts.filter((a) => a.status === "connected" && free(a) >= input.size);
  const pool = usable.length ? usable : accounts.filter((a) => a.status === "connected");
  if (!pool.length) return null;

  const byId = (id: string) => pool.find((a) => a.id === id);

  if (policy.mode === "file-type-rules") {
    for (const rule of policy.type_rules ?? []) {
      if (matchesType(rule, input)) {
        const acct = byId(rule.accountId);
        if (acct) return { account: acct, reason: `file-type rule "${rule.match}"` };
      }
    }
  }

  if (policy.mode === "folder-rules") {
    const folder = normalizeFolder(input.folderPath);
    const rules = [...(policy.folder_rules ?? [])].sort(
      (a, b) => b.prefix.length - a.prefix.length,
    );
    for (const rule of rules) {
      if (folder.startsWith(normalizeFolder(rule.prefix))) {
        const acct = byId(rule.accountId);
        if (acct) return { account: acct, reason: `folder rule "${rule.prefix}"` };
      }
    }
  }

  if (policy.mode === "round-robin") {
    const ordered = [...pool].sort((a, b) => a.id.localeCompare(b.id));
    const acct = ordered[input.uploadCount % ordered.length]!;
    return { account: acct, reason: "round robin" };
  }

  if (policy.mode === "priority-order") {
    const acct = [...pool].sort((a, b) => a.priority - b.priority)[0]!;
    return { account: acct, reason: `priority ${acct.priority}` };
  }

  const acct = [...pool].sort((a, b) => free(b) - free(a))[0]!;
  return {
    account: acct,
    reason:
      policy.mode === "most-available" ? "most available space" : "fallback: most available space",
  };
}
