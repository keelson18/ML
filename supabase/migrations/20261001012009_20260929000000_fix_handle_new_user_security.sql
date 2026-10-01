/*
# Fix handle_new_user Security Warnings

1. Modified Functions
- `handle_new_user()` — adds `SET search_path = public` to prevent search path injection, and revokes EXECUTE from anon/authenticated to prevent direct invocation via the REST API.
2. Security
- Fixes 3 security advisor warnings:
  a) Function search_path mutable — now explicitly set to public.
  b) anon role could execute SECURITY DEFINER function — EXECUTE revoked from anon.
  c) authenticated role could execute SECURITY DEFINER function — EXECUTE revoked from authenticated.
- The function is only called by the `on_auth_user_created` trigger on auth.users, which runs with superuser privileges. Direct REST invocation is unnecessary and dangerous.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles (id, role, display_name)
  VALUES (
    NEW.id,
    'user',
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
