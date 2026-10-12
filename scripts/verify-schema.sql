-- Run in the Supabase SQL editor after applying migrations in docs/DB_APPLY.md.
select public.verify_paper_schema() as paper_schema;

-- Required object inventory for operator review.
select required.object_type, required.object_name,
  case when required.object_type = 'table' then to_regclass('public.' || required.object_name) is not null
       else exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname='public' and p.proname=required.object_name) end as present
from (values
  ('table','paper_sim_accounts'), ('table','decision_ledger'), ('table','paper_fills'),
  ('table','shadow_trades'), ('table','paper_autopilot'), ('table','autopilot_settings'),
  ('rpc','record_paper_account_update'), ('rpc','set_paper_autopilot'),
  ('rpc','list_enabled_paper_autopilots'), ('rpc','pause_paper_autopilot'),
  ('rpc','resume_paper_autopilot'), ('rpc','touch_paper_autopilot_run'), ('rpc','get_paper_autopilot_limits'),
  ('rpc','paper_ledger_health'), ('rpc','verify_decision_ledger')
) as required(object_type, object_name)
order by object_type, object_name;
