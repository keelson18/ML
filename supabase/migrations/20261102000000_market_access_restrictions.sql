-- Replace coverage tiers with explicit, administrator-managed access restrictions.
CREATE TABLE IF NOT EXISTS public.market_access_restrictions (
  symbol text PRIMARY KEY,
  blocked boolean NOT NULL DEFAULT true,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.market_access_restrictions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_access_restrictions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.market_access_restrictions TO service_role;

DO $$
BEGIN
  IF to_regclass('public.market_coverage_overrides') IS NOT NULL THEN
    INSERT INTO public.market_access_restrictions (symbol, blocked, reason, updated_by, updated_at)
    SELECT symbol, true, reason, updated_by, updated_at
    FROM public.market_coverage_overrides
    WHERE tier = 'blocked'
    ON CONFLICT (symbol) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_market_access_restriction(
  p_symbol text,
  p_blocked boolean,
  p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.is_current_user_admin()
    OR coalesce(auth.jwt()->'aal', '"aal1"'::jsonb) <> '"aal2"'::jsonb THEN
    RAISE EXCEPTION 'Administrator MFA required.' USING errcode = '42501';
  END IF;
  IF p_symbol IS NULL OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid market restriction.' USING errcode = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.market_universe WHERE symbol = p_symbol AND is_active) THEN
    RAISE EXCEPTION 'Unknown instrument.' USING errcode = '22023';
  END IF;
  IF p_blocked THEN
    INSERT INTO public.market_access_restrictions (symbol, blocked, reason, updated_by, updated_at)
    VALUES (p_symbol, true, trim(p_reason), v_actor, now())
    ON CONFLICT (symbol) DO UPDATE SET blocked = true, reason = excluded.reason,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  ELSE
    DELETE FROM public.market_access_restrictions WHERE symbol = p_symbol;
  END IF;
  INSERT INTO public.admin_audit_events(actor_id, action, details)
    VALUES (v_actor, 'market.access_restriction.updated',
      jsonb_build_object('symbol', p_symbol, 'blocked', p_blocked, 'reason', trim(p_reason)));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_market_access_restriction(text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_market_access_restriction(text, boolean, text) TO authenticated;

-- The legacy trigger must not continue to turn market access into trading eligibility.
DROP TRIGGER IF EXISTS paper_autopilot_coverage_tier_guard ON public.paper_autopilot;
DROP FUNCTION IF EXISTS public.enforce_paper_autopilot_coverage_tier();

-- Retire the tier RPC without dropping its table yet: existing rows are the migration source
-- above, and a later cleanup migration may remove both after the rollout is verified.
DO $$
BEGIN
  IF to_regprocedure('public.admin_set_market_coverage_tier(text,text,text,boolean,boolean,boolean)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.admin_set_market_coverage_tier(text,text,text,boolean,boolean,boolean) FROM authenticated;
  END IF;
END;
$$;
