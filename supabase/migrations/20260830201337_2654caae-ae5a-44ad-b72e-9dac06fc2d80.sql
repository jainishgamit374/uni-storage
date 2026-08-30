ALTER TABLE public.upload_jobs
  ADD COLUMN IF NOT EXISTS mime_type text NOT NULL DEFAULT 'application/octet-stream',
  ADD COLUMN IF NOT EXISTS folder_path text NOT NULL DEFAULT '/',
  ADD COLUMN IF NOT EXISTS storage_key text,
  ADD COLUMN IF NOT EXISTS is_real boolean NOT NULL DEFAULT false;

ALTER TABLE public.stored_files
  ADD COLUMN IF NOT EXISTS upload_job_id uuid REFERENCES public.upload_jobs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stored_files_upload_job_id_key
  ON public.stored_files (upload_job_id) WHERE upload_job_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.recalc_account_quota(_account_id uuid)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(SUM(size), 0) INTO _total
  FROM public.stored_files
  WHERE account_id = _account_id AND user_id = auth.uid();

  UPDATE public.connected_accounts
  SET quota_used = _total
  WHERE id = _account_id AND user_id = auth.uid();

  RETURN _total;
END;
$$;

REVOKE ALL ON FUNCTION public.recalc_account_quota(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_account_quota(uuid) TO authenticated;