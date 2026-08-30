ALTER TABLE public.connected_accounts
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS external_email text,
  ADD COLUMN IF NOT EXISTS needs_reauth boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS root_folder_id text;

CREATE UNIQUE INDEX IF NOT EXISTS connected_accounts_user_provider_external_idx
  ON public.connected_accounts (user_id, provider, external_id)
  WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.oauth_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.connected_accounts(id) ON DELETE CASCADE,
  provider text NOT NULL,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  token_expiry timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id)
);

REVOKE ALL ON public.oauth_credentials FROM anon, authenticated;
GRANT ALL ON public.oauth_credentials TO service_role;
ALTER TABLE public.oauth_credentials ENABLE ROW LEVEL SECURITY;