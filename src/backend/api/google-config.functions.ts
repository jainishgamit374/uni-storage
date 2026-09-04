import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GOOGLE_PROVIDER_ID = "google-drive";

function originFromRequest() {
  return new URL(getRequest().url).origin;
}

type RoleChecker = {
  rpc: (
    fn: "has_role",
    args: { _user_id: string; _role: "admin" | "user" },
  ) => PromiseLike<{ data: boolean | null }>;
};

async function assertAdmin(context: { supabase: RoleChecker; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Only an administrator can change the Google OAuth configuration.");
}

/**
 * Admin view of the global Google OAuth app. Secrets are never returned —
 * only a masked client id and the redirect URI to register with Google.
 */
export const getGoogleOauthConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { googleConfig, defaultRedirectUri } = await import("@/backend/services/google-drive.server");
    const config = await googleConfig();
    const origin = originFromRequest();
    return {
      configured: Boolean(config),
      source: config?.source ?? null,
      clientIdMasked: config
        ? `${config.clientId.slice(0, 12)}…${config.clientId.slice(-14)}`
        : null,
      redirectUri: config?.redirectUri || defaultRedirectUri(origin),
      defaultRedirectUri: defaultRedirectUri(origin),
    };
  });

const saveSchema = z.object({
  clientId: z.string().trim().min(10).max(400),
  clientSecret: z.string().trim().min(6).max(400),
  redirectUri: z.string().trim().url().max(500).optional().or(z.literal("")),
});

/** Stores the workspace-wide OAuth app credentials, encrypted at rest. */
export const saveGoogleOauthConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const [{ encryptToken }, { defaultRedirectUri }, { supabaseAdmin }] = await Promise.all([
      import("@/backend/services/token-crypto.server"),
      import("@/backend/services/google-drive.server"),
      import("@/integrations/supabase/client.server"),
    ]);
    const redirect = data.redirectUri || defaultRedirectUri(originFromRequest());
    const { error } = await supabaseAdmin.from("oauth_provider_config").upsert(
      {
        provider: GOOGLE_PROVIDER_ID,
        client_id_ciphertext: encryptToken(data.clientId),
        client_secret_ciphertext: encryptToken(data.clientSecret),
        redirect_uri: redirect,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );
    if (error) throw error;
    return { ok: true as const, redirectUri: redirect };
  });

/** Removes the stored OAuth app. Connected accounts keep their own tokens. */
export const clearGoogleOauthConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("oauth_provider_config")
      .delete()
      .eq("provider", GOOGLE_PROVIDER_ID);
    if (error) throw error;
    return { ok: true as const };
  });
