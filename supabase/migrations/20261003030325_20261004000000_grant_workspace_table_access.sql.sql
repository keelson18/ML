/*
# Grant Workspace Table Access

## Purpose
Explicitly grant CRUD privileges on the workspace tables to the authenticated role.
These tables were created with RLS enabled but needed explicit grants for the
authenticated role to perform operations (RLS filters still apply on top of grants).

## Tables Affected
- user_preferences — SELECT, INSERT, UPDATE, DELETE
- user_watchlists — SELECT, INSERT, UPDATE, DELETE
- price_alerts — SELECT, INSERT, UPDATE, DELETE

## Security
- Grants give the authenticated role table-level privileges.
- RLS policies (added in the previous migration) enforce row-level ownership checks.
- Together: authenticated users can only see/modify their own rows.
*/

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_watchlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_alerts TO authenticated;
