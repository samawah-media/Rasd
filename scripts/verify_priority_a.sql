with legacy_org as (
  select id
  from public.organizations
  where slug = 'hidayathon-legacy'
),
default_org as (
  select id
  from public.organizations
  where slug = 'rasd-hidayathon'
),
checks as (
  select 'legacy_monitoring_items' as metric, count(*)::int as value
  from public.monitoring_items
  where organization_id in (select id from legacy_org)

  union all
  select 'legacy_captures', count(*)::int
  from public.captures
  where organization_id in (select id from legacy_org)

  union all
  select 'legacy_report_items', count(*)::int
  from public.report_items
  where organization_id in (select id from legacy_org)

  union all
  select 'legacy_link_overrides', count(*)::int
  from public.legacy_link_overrides
  where organization_id in (select id from legacy_org)

  union all
  select 'legacy_reports', count(*)::int
  from public.reports
  where organization_id in (select id from legacy_org)

  union all
  select 'legacy_openable_links', count(*)::int
  from public.monitoring_items
  where organization_id in (select id from legacy_org)
    and original_url_status = 'openable'

  union all
  select 'legacy_missing_links', count(*)::int
  from public.monitoring_items
  where organization_id in (select id from legacy_org)
    and original_url_status = 'missing'

  union all
  select 'legacy_invalid_links', count(*)::int
  from public.monitoring_items
  where organization_id in (select id from legacy_org)
    and original_url_status = 'invalid'

  union all
  select 'default_manual_items', count(*)::int
  from public.monitoring_items
  where organization_id in (select id from default_org)
    and source_type = 'manual_url'

  union all
  select 'rls_disabled_public_tables', count(*)::int
  from pg_tables
  where schemaname = 'public'
    and rowsecurity = false
)
select *
from checks
order by metric;
