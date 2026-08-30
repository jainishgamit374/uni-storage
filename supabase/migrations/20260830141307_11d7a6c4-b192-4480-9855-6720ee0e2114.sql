CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.connected_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  is_mock BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'connected',
  priority INTEGER NOT NULL DEFAULT 100,
  quota_used BIGINT NOT NULL DEFAULT 0,
  quota_total BIGINT NOT NULL DEFAULT 16106127360,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX connected_accounts_user_idx ON public.connected_accounts (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connected_accounts TO authenticated;
GRANT ALL ON public.connected_accounts TO service_role;
ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own accounts" ON public.connected_accounts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.routing_policies (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'most-available',
  type_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  folder_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routing_policies TO authenticated;
GRANT ALL ON public.routing_policies TO service_role;
ALTER TABLE public.routing_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own policy" ON public.routing_policies FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.stored_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  account_id UUID REFERENCES public.connected_accounts ON DELETE SET NULL,
  name TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  folder_path TEXT NOT NULL DEFAULT '/',
  storage_key TEXT,
  is_mock BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stored_files_user_idx ON public.stored_files (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stored_files TO authenticated;
GRANT ALL ON public.stored_files TO service_role;
ALTER TABLE public.stored_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own files" ON public.stored_files FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.upload_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  account_id UUID REFERENCES public.connected_accounts ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  routed_by TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX upload_jobs_user_idx ON public.upload_jobs (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.upload_jobs TO authenticated;
GRANT ALL ON public.upload_jobs TO service_role;
ALTER TABLE public.upload_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jobs" ON public.upload_jobs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.routing_policies (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.connected_accounts (user_id, provider, label, is_mock, priority, quota_used, quota_total)
  VALUES
    (NEW.id, 'nexdrive', 'NexDrive Storage', false, 10, 0, 5368709120),
    (NEW.id, 'google-drive', 'Google Drive — personal', true, 20, 9126805504, 16106127360),
    (NEW.id, 'dropbox', 'Dropbox — work', true, 30, 1503238553, 2147483648),
    (NEW.id, 'r2', 'Cloudflare R2 — media', true, 40, 21474836480, 107374182400);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();