CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.routing_policies (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.connected_accounts (user_id, provider, label, is_mock, priority, quota_used, quota_total)
  VALUES
    (NEW.id, 'nexdrive', 'NexDrive Storage', false, 10, 0, 5368709120),
    (NEW.id, 'dropbox', 'Dropbox — work', true, 30, 1503238553, 2147483648),
    (NEW.id, 'r2', 'Cloudflare R2 — media', true, 40, 21474836480, 107374182400);

  RETURN NEW;
END;
$function$;

DELETE FROM public.stored_files
WHERE account_id IN (
  SELECT id FROM public.connected_accounts
  WHERE provider = 'google-drive' AND external_id IS NULL
);

DELETE FROM public.connected_accounts
WHERE provider = 'google-drive' AND external_id IS NULL;