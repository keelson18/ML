BEGIN;
SELECT plan(8);
SELECT set_config('request.jwt.claim.role', 'service_role', true);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
VALUES ('d47b5be5-ec9e-483a-a6f3-22161af47c21', 'authenticated', 'authenticated', 'paper-lease@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.paper_autopilot(account_id, enabled, symbols, paused_reason)
VALUES ('d47b5be5-ec9e-483a-a6f3-22161af47c21', true, ARRAY['BTCUSD'], NULL)
ON CONFLICT (account_id) DO UPDATE SET enabled = true, paused_reason = NULL;

SELECT is((SELECT fencing_token FROM public.claim_paper_autopilot_lease(
  'd47b5be5-ec9e-483a-a6f3-22161af47c21', 'd47b5be5-ec9e-483a-a6f3-22161af47c31', 90000)), 1::bigint,
  'first worker receives fencing token one');
SELECT is((SELECT count(*) FROM public.claim_paper_autopilot_lease(
  'd47b5be5-ec9e-483a-a6f3-22161af47c21', 'd47b5be5-ec9e-483a-a6f3-22161af47c32', 90000)), 0::bigint,
  'a second worker cannot claim an unexpired lease');
SELECT is(public.renew_paper_autopilot_lease(
  'd47b5be5-ec9e-483a-a6f3-22161af47c21', 'd47b5be5-ec9e-483a-a6f3-22161af47c32', 1, 90000), false,
  'another worker cannot renew the lease');
SELECT is(public.renew_paper_autopilot_lease(
  'd47b5be5-ec9e-483a-a6f3-22161af47c21', 'd47b5be5-ec9e-483a-a6f3-22161af47c31', 1, 90000), true,
  'current lease owner can renew');

UPDATE public.paper_autopilot_leases SET expires_at = clock_timestamp() - interval '1 second'
WHERE account_id = 'd47b5be5-ec9e-483a-a6f3-22161af47c21';
SELECT is((SELECT fencing_token FROM public.claim_paper_autopilot_lease(
  'd47b5be5-ec9e-483a-a6f3-22161af47c21', 'd47b5be5-ec9e-483a-a6f3-22161af47c32', 90000)), 2::bigint,
  'expired lease is reclaimed with a higher fencing token');
SELECT throws_ok(
  $$SELECT public.record_paper_account_update(
    'd47b5be5-ec9e-483a-a6f3-22161af47c21', -1,
    '{"cash":1000,"positions":[],"trades":[]}'::jsonb, '[]'::jsonb,
    'd47b5be5-ec9e-483a-a6f3-22161af47c31', 1
  )$$,
  '55000', 'paper-autopilot lease lost; stale worker write rejected',
  'an expired worker cannot mutate paper account state');
SELECT is(public.record_paper_account_update(
  'd47b5be5-ec9e-483a-a6f3-22161af47c21', -1,
  '{"cash":1000,"positions":[],"trades":[]}'::jsonb, '[]'::jsonb,
  'd47b5be5-ec9e-483a-a6f3-22161af47c32', 2
), 0::bigint, 'current fenced worker can perform its account mutation');
SELECT ok(NOT has_function_privilege('authenticated', 'public.claim_paper_autopilot_lease(uuid,uuid,integer)', 'EXECUTE'),
  'lease claims are restricted to the backend service role');

SELECT * FROM finish();
ROLLBACK;
