revoke execute on function public.notify_on_ingested_news_item() from public, anon, authenticated;
revoke execute on function public.notify_on_published_cms_content() from public, anon, authenticated;
revoke execute on function public.prevent_research_experiment_mutation_after_run() from public, anon, authenticated;
alter function public.prevent_research_evidence_mutation() set search_path = '';
alter function public.prevent_research_collection_mutation() set search_path = '';
