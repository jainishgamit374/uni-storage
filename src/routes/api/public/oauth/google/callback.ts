import { createFileRoute } from "@tanstack/react-router";

function back(origin: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return new Response(null, {
    status: 302,
    headers: { Location: `${origin}/settings/providers?${qs}` },
  });
}

export const Route = createFileRoute("/api/public/oauth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;

        const [
          { verifyPayload },
          {
            exchangeCode,
            fetchGoogleProfile,
            getDriveQuota,
            saveCredentials,
            ensureRootFolder,
            GOOGLE_PROVIDER_ID,
          },
        ] = await Promise.all([
          import("@/lib/token-crypto.server"),
          import("@/lib/google-drive.server"),
        ]);

        try {
          const error = url.searchParams.get("error");
          if (error) {
            return back(origin, {
              google: "error",
              message:
                error === "access_denied"
                  ? "You cancelled the Google authorisation."
                  : `Google returned "${error}".`,
            });
          }

          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          if (!code) return back(origin, { google: "error", message: "Google sent no code." });
          if (!state)
            return back(origin, { google: "error", message: "Missing security state." });

          const parsed = verifyPayload<{ u: string; n: string }>(state);
          if (!parsed?.u) {
            return back(origin, {
              google: "error",
              message: "This authorisation link is invalid or expired. Try connecting again.",
            });
          }
          const userId = parsed.u;

          const tokens = await exchangeCode(code, origin);
          const profile = await fetchGoogleProfile(tokens.access_token);
          const quota = await getDriveQuota(tokens.access_token).catch(() => ({
            used: 0,
            total: 0,
            email: profile.email,
          }));

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: existing } = await supabaseAdmin
            .from("connected_accounts")
            .select("id")
            .eq("user_id", userId)
            .eq("provider", GOOGLE_PROVIDER_ID)
            .eq("external_id", profile.id)
            .maybeSingle();

          const label = `Google Drive — ${profile.email}`;
          let accountId: string;

          if (existing) {
            accountId = existing.id;
            const { error: upErr } = await supabaseAdmin
              .from("connected_accounts")
              .update({
                label,
                external_email: profile.email,
                is_mock: false,
                status: "connected",
                needs_reauth: false,
                quota_total: quota.total || 0,
                quota_used: quota.used || 0,
              })
              .eq("id", accountId);
            if (upErr) throw upErr;
          } else {
            const { count } = await supabaseAdmin
              .from("connected_accounts")
              .select("id", { count: "exact", head: true })
              .eq("user_id", userId);
            const { data: created, error: insErr } = await supabaseAdmin
              .from("connected_accounts")
              .insert({
                user_id: userId,
                provider: GOOGLE_PROVIDER_ID,
                label,
                is_mock: false,
                status: "connected",
                needs_reauth: false,
                external_id: profile.id,
                external_email: profile.email,
                quota_total: quota.total || 0,
                quota_used: quota.used || 0,
                priority: ((count ?? 0) + 1) * 10,
                config: {},
              })
              .select("id")
              .single();
            if (insErr) throw insErr;
            accountId = created.id;
          }

          await saveCredentials({
            userId,
            accountId,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? null,
            expiresIn: tokens.expires_in,
          });

          // Prepare the managed root folder up front so the first upload is fast.
          await ensureRootFolder(accountId, tokens.access_token).catch(() => null);

          return back(origin, { google: "connected", email: profile.email });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Google connection failed unexpectedly.";
          console.error("[google-oauth-callback]", message);
          return back(origin, { google: "error", message });
        }
      },
    },
  },
});
