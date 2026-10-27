-- Persist owner-reviewed instrument coverage assignments with a guarded admin workflow.
CREATE TABLE IF NOT EXISTS public.market_coverage_overrides (
  symbol text PRIMARY KEY,
  tier text NOT NULL CHECK (tier IN ('A', 'B', 'C', 'blocked')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  provider_mapping_verified boolean NOT NULL DEFAULT false,
  provider_available boolean NOT NULL DEFAULT false,
  session_calendar_verified boolean NOT NULL DEFAULT false,
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.market_coverage_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_coverage_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.market_coverage_overrides TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_market_coverage_tier(
  p_symbol text,
  p_tier text,
  p_reason text,
  p_provider_mapping_verified boolean,
  p_provider_available boolean,
  p_session_calendar_verified boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_market public.market_universe%ROWTYPE;
  v_global_cap integer;
  v_tier_a_count integer;
BEGIN
  IF v_actor IS NULL OR NOT public.is_current_user_admin()
    OR coalesce(auth.jwt()->'aal', '"aal1"'::jsonb) <> '"aal2"'::jsonb THEN
    RAISE EXCEPTION 'Administrator MFA required.' USING errcode = '42501';
  END IF;
  IF p_tier NOT IN ('A', 'B', 'C', 'blocked') OR p_symbol IS NULL
    OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid coverage assignment.' USING errcode = '22023';
  END IF;
  SELECT * INTO v_market FROM public.market_universe WHERE symbol = p_symbol AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown instrument.' USING errcode = '22023'; END IF;
  IF p_tier <> 'blocked' AND NOT p_provider_mapping_verified THEN
    RAISE EXCEPTION 'Provider mapping must be verified before assignment.' USING errcode = '23514';
  END IF;
  IF p_tier <> 'blocked' AND v_market.provider NOT IN ('massive', 'twelvedata') THEN
    RAISE EXCEPTION 'No supported market-data adapter is configured.' USING errcode = '23514';
  END IF;
  IF p_tier = 'A' AND (NOT p_provider_available OR (v_market.market_type <> 'crypto' AND NOT p_session_calendar_verified)) THEN
    RAISE EXCEPTION 'Tier A requires verified availability and session rules.' USING errcode = '23514';
  END IF;
  IF p_tier = 'C' AND NOT p_provider_available THEN
    RAISE EXCEPTION 'Tier C requires provider availability to be verified.' USING errcode = '23514';
  END IF;
  IF p_tier IN ('B', 'C') AND v_market.market_type <> 'crypto' AND NOT p_session_calendar_verified THEN
    RAISE EXCEPTION 'Non-crypto instruments require verified session rules.' USING errcode = '23514';
  END IF;
  IF p_tier = 'B' AND v_market.market_type <> 'crypto' THEN
    RAISE EXCEPTION 'Tier B scanning is currently limited to crypto instruments.' USING errcode = '23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('public.market_coverage_tier_a_cap'));
  SELECT max_symbols_global INTO v_global_cap FROM public.autopilot_settings WHERE singleton;
  IF v_global_cap IS NULL OR v_global_cap < 1 THEN
    RAISE EXCEPTION 'Tier A global cap is unavailable.' USING errcode = '23514';
  END IF;
  SELECT count(*) INTO v_tier_a_count FROM public.market_coverage_overrides WHERE tier = 'A' AND symbol <> p_symbol;
  v_tier_a_count := v_tier_a_count + (
    SELECT count(*) FROM (VALUES ('BTCUSD'), ('ETHUSD'), ('SOLUSD')) AS starter(symbol)
    WHERE starter.symbol <> p_symbol
      AND NOT EXISTS (SELECT 1 FROM public.market_coverage_overrides o WHERE o.symbol = starter.symbol)
  );
  IF p_tier = 'A' AND v_tier_a_count >= v_global_cap THEN
    RAISE EXCEPTION 'Tier A global cap reached.' USING errcode = '23514';
  END IF;
  INSERT INTO public.market_coverage_overrides
    (symbol, tier, reason, provider_mapping_verified, provider_available, session_calendar_verified, updated_by, updated_at)
  VALUES (p_symbol, p_tier, trim(p_reason), p_provider_mapping_verified, p_provider_available, p_session_calendar_verified, v_actor, now())
  ON CONFLICT (symbol) DO UPDATE SET tier = excluded.tier, reason = excluded.reason,
    provider_mapping_verified = excluded.provider_mapping_verified,
    provider_available = excluded.provider_available,
    session_calendar_verified = excluded.session_calendar_verified,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  INSERT INTO public.admin_audit_events(actor_id, action, details)
    VALUES (v_actor, 'market.coverage.updated', jsonb_build_object(
      'symbol', p_symbol, 'tier', p_tier, 'reason', trim(p_reason),
      'providerMappingVerified', p_provider_mapping_verified,
      'providerAvailable', p_provider_available,
      'sessionCalendarVerified', p_session_calendar_verified));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_market_coverage_tier(text, text, text, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_market_coverage_tier(text, text, text, boolean, boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_paper_autopilot_coverage_tier()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.enabled AND EXISTS (
    SELECT 1 FROM unnest(NEW.symbols) AS selected(symbol)
    WHERE coalesce((SELECT o.tier FROM public.market_coverage_overrides o WHERE o.symbol = selected.symbol),
      CASE WHEN selected.symbol IN ('BTCUSD', 'ETHUSD', 'SOLUSD') THEN 'A' ELSE 'blocked' END) <> 'A'
  ) THEN
    RAISE EXCEPTION 'Only Tier A instruments may enter paper autopilot.' USING errcode = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_paper_autopilot_coverage_tier() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS paper_autopilot_coverage_tier_guard ON public.paper_autopilot;
CREATE TRIGGER paper_autopilot_coverage_tier_guard
  BEFORE INSERT OR UPDATE OF enabled, symbols ON public.paper_autopilot
  FOR EACH ROW EXECUTE FUNCTION public.enforce_paper_autopilot_coverage_tier();
