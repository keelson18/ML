/*
# Prevent Profile Role Escalation

1. New Functions
- `prevent_profile_role_escalation()` — SECURITY DEFINER trigger function that blocks non-admin users from changing profile roles.
- Sets `search_path = public` to prevent search path injection.
2. New Triggers
- `protect_profile_role_changes` — fires BEFORE UPDATE OF role on profiles table.
3. Security
- Only admin users can change the `role` column on profiles.
- All other users get a permission denied error (42501).
*/

CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
    AND NOT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  THEN
    RAISE EXCEPTION 'Only an admin can change profile roles'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role_changes ON public.profiles;
CREATE TRIGGER protect_profile_role_changes
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_role_escalation();
