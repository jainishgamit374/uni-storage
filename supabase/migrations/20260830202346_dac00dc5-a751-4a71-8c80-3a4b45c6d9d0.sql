REVOKE ALL ON public.oauth_provider_config FROM anon, authenticated;
REVOKE ALL ON public.oauth_credentials FROM anon, authenticated;
GRANT ALL ON public.oauth_provider_config TO service_role;
GRANT ALL ON public.oauth_credentials TO service_role;