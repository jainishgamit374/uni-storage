export type ProviderId =
  "nexdrive" | "google-drive" | "dropbox" | "onedrive" | "r2" | "b2" | "wasabi" | "minio" | "s3";

export type ProviderKind = "native" | "oauth" | "s3-compatible";

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  kind: ProviderKind;
  blurb: string;
  /** Real adapter implemented (writes actual bytes) vs. mock adapter. */
  real: boolean;
  defaultQuota: number;
}

const GB = 1024 ** 3;

export const PROVIDERS: ProviderMeta[] = [
  {
    id: "nexdrive",
    name: "NexDrive Storage",
    kind: "native",
    blurb: "Built-in object storage. Real uploads, signed downloads, no setup.",
    real: true,
    defaultQuota: 5 * GB,
  },
  {
    id: "google-drive",
    name: "Google Drive",
    kind: "oauth",
    blurb: "OAuth 2.0 · real Drive v3 uploads, downloads and live quota.",
    real: true,
    defaultQuota: 15 * GB,
  },
  {
    id: "dropbox",
    name: "Dropbox",
    kind: "oauth",
    blurb: "OAuth 2.0 · content API with chunked upload sessions.",
    real: false,
    defaultQuota: 2 * GB,
  },
  {
    id: "onedrive",
    name: "OneDrive",
    kind: "oauth",
    blurb: "Microsoft Graph · drive items and upload sessions.",
    real: false,
    defaultQuota: 5 * GB,
  },
  {
    id: "r2",
    name: "Cloudflare R2",
    kind: "s3-compatible",
    blurb: "S3 API, zero egress fees. Great for media.",
    real: false,
    defaultQuota: 100 * GB,
  },
  {
    id: "b2",
    name: "Backblaze B2",
    kind: "s3-compatible",
    blurb: "S3-compatible endpoint, cold-tier pricing.",
    real: false,
    defaultQuota: 100 * GB,
  },
  {
    id: "wasabi",
    name: "Wasabi",
    kind: "s3-compatible",
    blurb: "Flat-rate hot storage over the S3 API.",
    real: false,
    defaultQuota: 100 * GB,
  },
  {
    id: "minio",
    name: "MinIO",
    kind: "s3-compatible",
    blurb: "Self-hosted S3. Point it at your own endpoint.",
    real: false,
    defaultQuota: 50 * GB,
  },
  {
    id: "s3",
    name: "Custom S3",
    kind: "s3-compatible",
    blurb: "Any S3-compatible endpoint with access key + secret.",
    real: false,
    defaultQuota: 100 * GB,
  },
];

export function providerMeta(id: string): ProviderMeta {
  return (
    PROVIDERS.find((p) => p.id === id) ?? {
      id: "s3",
      name: id,
      kind: "s3-compatible",
      blurb: "Custom endpoint.",
      real: false,
      defaultQuota: 10 * GB,
    }
  );
}

export const ROUTING_MODES = [
  {
    id: "most-available",
    name: "Most available space",
    blurb: "Every upload lands on the connection with the most free bytes.",
  },
  {
    id: "round-robin",
    name: "Round robin",
    blurb: "Spread uploads evenly across all connected accounts.",
  },
  {
    id: "priority-order",
    name: "Priority order",
    blurb: "Fill the highest-priority connection first, then spill over.",
  },
  {
    id: "file-type-rules",
    name: "File-type rules",
    blurb: "Route by extension or MIME type, e.g. .mp4 → R2.",
  },
  {
    id: "folder-rules",
    name: "Folder rules",
    blurb: "Route by destination folder, e.g. /clients/ → Dropbox.",
  },
] as const;

export type RoutingMode = (typeof ROUTING_MODES)[number]["id"];

export interface TypeRule {
  match: string;
  accountId: string;
}
export interface FolderRule {
  prefix: string;
  accountId: string;
}
