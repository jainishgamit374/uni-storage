import { beforeAll, describe, expect, it } from "vitest";

import {
  MOCKABLE_PROVIDERS,
  NATIVE_MAX_BYTES,
  ValidationError,
  assertOwnedStorageKey,
  escapeDriveQueryLiteral,
  isRoutingMode,
  normalizeFolderPath,
  sanitizeFileName,
  validateMimeType,
  validateSize,
} from "@/backend/shared/validation";

describe("folder path validation", () => {
  it("normalises ordinary paths", () => {
    expect(normalizeFolderPath("/")).toBe("/");
    expect(normalizeFolderPath("")).toBe("/");
    expect(normalizeFolderPath("clients/acme/")).toBe("/clients/acme");
    expect(normalizeFolderPath("//clients///acme")).toBe("/clients/acme");
  });

  it.each([
    "../etc/passwd",
    "/clients/../../root",
    "/clients/./secret",
    "..",
    "C:\\Windows",
    "/a\u0000/b",
    "file:///etc",
    "https://evil.test/x",
  ])("rejects traversal or smuggling: %s", (input: string) => {
    expect(() => normalizeFolderPath(input)).toThrow(ValidationError);
  });

  it("rejects absurd depth and length", () => {
    expect(() => normalizeFolderPath("/" + "a/".repeat(40))).toThrow(ValidationError);
    expect(() => normalizeFolderPath("/" + "a".repeat(600))).toThrow(ValidationError);
  });
});

describe("file name sanitisation", () => {
  it("keeps only the final component", () => {
    expect(sanitizeFileName("report.pdf")).toBe("report.pdf");
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\temp\\a.txt")).toBe("a.txt");
  });

  it.each(["", "   ", ".", "..", "bad\u0000name", "x".repeat(300)])(
    "rejects %s",
    (input: string) => {
      expect(() => sanitizeFileName(input)).toThrow(ValidationError);
    },
  );
});

describe("storage key ownership", () => {
  const me = "11111111-1111-1111-1111-111111111111";
  const other = "22222222-2222-2222-2222-222222222222";

  it("accepts a key under the caller's prefix", () => {
    expect(assertOwnedStorageKey(`${me}/abc/file.txt`, me)).toContain(me);
  });

  it("rejects another user's prefix (IDOR)", () => {
    expect(() => assertOwnedStorageKey(`${other}/file.txt`, me)).toThrow(ValidationError);
  });

  it("rejects traversal inside the key", () => {
    expect(() => assertOwnedStorageKey(`${me}/../${other}/file.txt`, me)).toThrow(ValidationError);
  });
});

describe("mime + size validation", () => {
  it("normalises and defaults mime types", () => {
    expect(validateMimeType(undefined)).toBe("application/octet-stream");
    expect(validateMimeType("text/plain; charset=utf-8")).toBe("text/plain");
  });

  it.each(["not-a-mime", "text/<script>", "a".repeat(200) + "/x"])(
    "rejects %s",
    (input: string) => {
      expect(() => validateMimeType(input)).toThrow(ValidationError);
    },
  );

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects size %s", (size: number) => {
    expect(() => validateSize(size)).toThrow(ValidationError);
  });

  it("enforces the native bucket ceiling", () => {
    expect(validateSize(NATIVE_MAX_BYTES, { max: NATIVE_MAX_BYTES })).toBe(NATIVE_MAX_BYTES);
    expect(() => validateSize(NATIVE_MAX_BYTES + 1, { max: NATIVE_MAX_BYTES })).toThrow(
      ValidationError,
    );
  });
});

describe("allow-lists", () => {
  it("does not allow arbitrary provider ids", () => {
    expect(MOCKABLE_PROVIDERS).not.toContain("nexdrive");
    expect((MOCKABLE_PROVIDERS as readonly string[]).includes("../evil")).toBe(false);
  });

  it("only accepts known routing modes", () => {
    expect(isRoutingMode("most-available")).toBe(true);
    expect(isRoutingMode("drop-tables")).toBe(false);
  });
});

describe("drive query escaping", () => {
  it("escapes quotes and backslashes so the q clause cannot be broken out of", () => {
    expect(escapeDriveQueryLiteral("o'brien")).toBe("o\\'brien");
    expect(escapeDriveQueryLiteral("a\\'b")).toBe("a\\\\\\'b");
  });
});

describe("signed payloads (state + download links)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let crypto: any;

  beforeAll(async () => {
    process.env["GOOGLE_OAUTH_STATE_SECRET"] = "unit-test-state-secret";
    process.env["GOOGLE_TOKEN_ENC_KEY"] = "unit-test-encryption-key";
    crypto = await import("@/backend/services/token-crypto.server");
  });

  it("round-trips a payload", () => {
    const token = crypto.signPayload({ u: "user-1", n: "nonce" }, 60);
    expect(crypto.verifyPayload(token)).toMatchObject({ u: "user-1", n: "nonce" });
  });

  it("rejects a tampered body", () => {
    const token: string = crypto.signPayload({ u: "user-1" }, 60);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "user-2", exp: Date.now() + 60000 }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(body).not.toBe(forged);
    expect(crypto.verifyPayload(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects a tampered signature and garbage", () => {
    const token: string = crypto.signPayload({ u: "user-1" }, 60);
    expect(crypto.verifyPayload(token.slice(0, -2) + "xy")).toBeNull();
    expect(crypto.verifyPayload("garbage")).toBeNull();
    expect(crypto.verifyPayload("")).toBeNull();
  });

  it("rejects an expired payload", () => {
    const token = crypto.signPayload({ u: "user-1" }, -1);
    expect(crypto.verifyPayload(token)).toBeNull();
  });

  it("encrypts tokens to opaque ciphertext and detects corruption", () => {
    const secret = "ya29.super-secret-refresh-token";
    const ct: string = crypto.encryptToken(secret);
    expect(ct).not.toContain(secret);
    expect(crypto.decryptToken(ct)).toBe(secret);
    const corrupted = ct.slice(0, -4) + "AAAA";
    expect(() => crypto.decryptToken(corrupted)).toThrow();
  });

  it("produces a different ciphertext each time (fresh IV)", () => {
    expect(crypto.encryptToken("same")).not.toBe(crypto.encryptToken("same"));
  });
});
