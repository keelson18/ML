-- Run in the Supabase SQL editor after applying migrations in docs/DB_APPLY.md.
select public.verify_paper_schema() as paper_schema;

-- Required object inventory for operator review.
select required.object_type, required.object_name,
  case when required.object_type = 'table' then to_regclass('public.' || required.object_name) is not null
       when required.object_type = 'rpc' then exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname='public' and p.proname=required.object_name)
       else exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
                    where n.nspname='public'
                      and c.relname=case
                        when required.object_name='research_holdout_no_overlap' then 'research_holdout_claims'
                        when required.object_name='research_experiment_holdout_registration' then 'research_experiments'
                        else 'research_collection_candles'
                      end
                      and t.tgname=required.object_name and not t.tgisinternal) end as present
from (values
  ('table','paper_sim_accounts'), ('table','decision_ledger'), ('table','paper_fills'),
  ('table','shadow_trades'), ('table','paper_autopilot'), ('table','autopilot_settings'),
  ('table','paper_ledger_verification_checkpoints'), ('table','research_experiments'),
  ('table','research_runs'), ('table','research_results'), ('table','research_approvals'),
  ('table','research_holdout_claims'), ('table','strategy_promotions'),
  ('table','research_collection_state'), ('table','research_collection_candles'), ('table','paper_autopilot_leases'),
  ('rpc','record_paper_account_update'), ('rpc','set_paper_autopilot'),
  ('rpc','list_enabled_paper_autopilots'), ('rpc','pause_paper_autopilot'),
  ('rpc','resume_paper_autopilot'), ('rpc','touch_paper_autopilot_run'), ('rpc','get_paper_autopilot_limits'),
  ('rpc','paper_ledger_health'), ('rpc','paper_accounting_health'), ('rpc','admin_reverify_paper_ledger'),
  ('rpc','admin_record_access_denial'), ('rpc','admin_record_health_audit'), ('rpc','verify_decision_ledger'),
  ('rpc','record_research_run'), ('rpc','approve_research_strategy'),
  ('rpc','reject_overlapping_research_holdout'), ('rpc','validate_research_holdout_registration'),
  ('rpc','append_research_collection_batch'), ('rpc','claim_paper_autopilot_lease'),
  ('rpc','renew_paper_autopilot_lease'), ('rpc','release_paper_autopilot_lease'),
  ('trigger','research_holdout_no_overlap'), ('trigger','research_experiment_holdout_registration'),
  ('trigger','research_collection_candles_immutable'), ('trigger','research_collection_candles_no_truncate')
) as required(object_type, object_name)
order by object_type, object_name;
