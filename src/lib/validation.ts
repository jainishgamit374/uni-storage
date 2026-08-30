/**
 * Pure, dependency-free input validation shared by every upload code path.
 * Kept side-effect free so it can be unit tested and reused on client + server.
 */

/** Hard ceiling for the native (Supabase Storage) bucket. */
export const NATIVE_MAX_BYTES = 50 * 1024 * 1024;
/** Ceiling for any single upload, regardless of destination provider. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;
export const MAX_NAME_LENGTH = 255;
export const MAX_PATH_LENGTH = 512;
export const MAX_PATH_SEGMENTS = 16;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// eslint-disable-next-line no-control-regex -- rejecting control chars is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const MIME_RE = /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/;

/**
 * Normalises a user-supplied folder path into `/a/b` form and rejects
 * traversal, control characters, absolute-URL smuggling and absurd depth.
 */
export function normalizeFolderPath(raw: unknown): string {
  const input = typeof raw === "string" ? raw.trim() : "";
  if (!input || input === "/") return "/";
  if (input.length > MAX_PATH_LENGTH) throw new ValidationError("Folder path is too long.");
  if (CONTROL_CHARS.test(input)) throw new ValidationError("Folder path has invalid characters.");
  if (input.includes("\\")) throw new ValidationError("Folder path has invalid characters.");
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input)) throw new ValidationError("Folder path is invalid.");

  const segments = input.split("/").filter(Boolean);
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new ValidationError("Folder path cannot navigate outside its root.");
    }
    if (segment.length > 100) throw new ValidationError("Folder name is too long.");
  }
  if (segments.length > MAX_PATH_SEGMENTS) throw new ValidationError("Folder path is too deep.");
  return segments.length ? `/${segments.join("/")}` : "/";
}

/** Strips any directory component and rejects unusable file names. */
export function sanitizeFileName(raw: unknown): string {
  const input = typeof raw === "string" ? raw.trim() : "";
  if (!input) throw new ValidationError("File name is required.");
  if (CONTROL_CHARS.test(input)) throw new ValidationError("File name has invalid characters.");
  // Never let a name carry path structure; keep only the final component.
  const base = input.split(/[/\\]/).pop()?.trim() ?? "";
  if (!base || base === "." || base === "..") throw new ValidationError("File name is invalid.");
  if (base.length > MAX_NAME_LENGTH) throw new ValidationError("File name is too long.");
  return base;
}

/** Object keys must stay inside the caller's own user prefix. */
export function assertOwnedStorageKey(key: string, userId: string): string {
  if (!key || CONTROL_CHARS.test(key) || key.includes("..")) {
    throw new ValidationError("Invalid storage key.");
  }
  if (!key.startsWith(`${userId}/`)) throw new ValidationError("Invalid storage key.");
  return key;
}

export function validateMimeType(raw: unknown): string {
  const input = typeof raw === "string" ? raw.trim() : "";
  if (!input) return "application/octet-stream";
  const base = input.split(";")[0]!.trim();
  if (base.length > 190 || !MIME_RE.test(base)) throw new ValidationError("Invalid content type.");
  return base;
}

export function validateSize(raw: unknown, opts: { max?: number } = {}): number {
  const size = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(size) || !Number.isInteger(size) || size < 0) {
    throw new ValidationError("Invalid file size.");
  }
  const max = opts.max ?? MAX_UPLOAD_BYTES;
  if (size > max) {
    throw new ValidationError(`File is too large (limit ${Math.floor(max / (1024 * 1024))} MB).`);
  }
  return size;
}

/** Providers a user may add manually. Live Google Drive must go through OAuth. */
export const MOCKABLE_PROVIDERS = [
  "dropbox",
  "onedrive",
  "s3",
  "r2",
  "b2",
  "wasabi",
  "minio",
  "google-drive",
] as const;

export const ROUTING_MODES = [
  "most-available",
  "round-robin",
  "priority-order",
  "file-type-rules",
  "folder-rules",
] as const;

export function isRoutingMode(value: string): value is (typeof ROUTING_MODES)[number] {
  return (ROUTING_MODES as readonly string[]).includes(value);
}

/** Escapes a literal for a Google Drive `q` query string. */
export function escapeDriveQueryLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
