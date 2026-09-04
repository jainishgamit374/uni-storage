import { createFileRoute } from "@tanstack/react-router";

/**
 * Short-lived, HMAC-signed proxy for Google Drive downloads. The link carries
 * no credentials — the token only names the file and expires in minutes.
 */
export const Route = createFileRoute("/api/public/drive/download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("t");
        if (!token) return new Response("Missing token", { status: 400 });

        const { verifyPayload } = await import("@/lib/token-crypto.server");
        const payload = verifyPayload<{ a: string; f: string; u: string; i: string; d?: string }>(token);
        if (!payload?.a || !payload?.f || !payload?.u || !payload?.i) {
          return new Response("This download link is invalid or has expired.", { status: 403 });
        }

        // Re-verify ownership at redeem time: the file must still exist, still
        // belong to the user the link was minted for, and still point at the
        // same object on the same account.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: file } = await supabaseAdmin
          .from("stored_files")
          .select("id")
          .eq("id", payload.i)
          .eq("user_id", payload.u)
          .eq("account_id", payload.a)
          .eq("storage_key", payload.f)
          .maybeSingle();
        if (!file) {
          return new Response("This download link is no longer valid.", { status: 403 });
        }

        try {
          const { getAccessToken, downloadDriveFile } = await import("@/lib/google-drive.server");
          const accessToken = await getAccessToken(payload.a);
          const file = await downloadDriveFile(accessToken, payload.f);
          return new Response(file.stream, {
            headers: {
              "Content-Type": file.mimeType || "application/octet-stream",
              "Content-Disposition": `${payload.d === "i" ? "inline" : "attachment"}; filename="${file.name.replace(/"/g, "")}"`,
              "Cache-Control": "no-store",
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Download failed";
          console.error("[drive-download]", message);
          return new Response(message, { status: 502 });
        }
      },
    },
  },
});
