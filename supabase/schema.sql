create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'editor', 'viewer');
create type public.source_type as enum (
  'manual_url',
  'rss',
  'web_page',
  'x_oembed',
  'x_recent_search',
  'x_filtered_stream'
);
create type public.source_credibility as enum ('official', 'media', 'influencer', 'public');
create type public.item_state as enum (
  'ingested',
  'normalized',
  'deduped',
  'candidate',
  'needs_review',
  'rejected',
  'approved_pending_capture',
  'capture_pending',
  'capture_failed',
  'report_ready',
  'added_to_report',
  'published',
  'archived'
);
create type public.sentiment as enum ('positive', 'neutral', 'negative');
create type public.capture_kind as enum ('evidence_lite', 'preview', 'report_grade');
create type public.capture_status as enum ('pending', 'success', 'failed', 'retrying');
create type public.report_status as enum ('draft', 'published', 'archived');
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'dead_letter');
create type public.usage_event_type as enum (
  'x_read',
  'ai_tokens',
  'screenshot',
  'storage_mb',
  'pdf_export',
  'report_view'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null default 'pilot',
  entitlements jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  period_start date,
  period_end date,
  status text not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type public.source_type not null,
  url text not null,
  handle text,
  country text,
  credibility public.source_credibility not null default 'public',
  is_verified_source boolean not null default false,
  logo_url text,
  created_at timestamptz not null default now()
);

create table public.source_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  type public.source_type not null,
  query text,
  url text,
  cursor jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.keyword_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  required_terms text[] not null default '{}',
  optional_terms text[] not null default '{}',
  exclude_terms text[] not null default '{}',
  language text not null default 'mixed',
  source_type public.source_type,
  priority integer not null default 0,
  active_from date,
  active_to date,
  version integer not null default 1,
  created_at timestamptz not null default now()
);

create table public.api_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  label text not null,
  encrypted_secret text not null,
  masked_secret text not null,
  rotated_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.usage_limits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete cascade,
  max_x_reads_per_day integer not null default 0,
  max_x_reads_per_month integer not null default 0,
  max_ai_tokens_per_month integer not null default 0,
  max_screenshots_per_month integer not null default 0,
  max_storage_mb integer not null default 0,
  hard_stop_enabled boolean not null default true,
  warning_threshold_percent integer not null default 70,
  created_at timestamptz not null default now()
);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  event_type public.usage_event_type not null,
  units integer not null default 1,
  estimated_cost_usd numeric(12, 6),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.connector_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_rule_id uuid not null references public.source_rules(id) on delete cascade,
  status text not null default 'queued',
  cursor_before jsonb,
  cursor_after jsonb,
  fetched_count integer not null default 0,
  failure_reason text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_type text not null,
  status public.job_status not null default 'queued',
  idempotency_key text not null,
  attempts integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  failure_reason text,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create table public.monitoring_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  external_id text,
  source_type public.source_type not null,
  state public.item_state not null default 'ingested',
  title text,
  original_url text not null,
  original_url_extracted text,
  original_url_status text not null default 'openable'
    check (original_url_status in ('openable', 'missing', 'invalid', 'legacy_evidence')),
  original_url_source text
    check (original_url_source in ('pdf', 'override', 'legacy_evidence')),
  evidence_image_path text,
  canonical_url_hash text,
  source_item_id text,
  normalized_text_hash text,
  author_name text,
  author_handle text,
  published_at timestamptz,
  summary text,
  summary_source_text text,
  sentiment public.sentiment,
  sentiment_confidence integer,
  relevance_score integer not null default 0,
  relevance_reason text,
  matched_terms text[] not null default '{}',
  raw_response jsonb not null default '{}'::jsonb,
  warning text,
  created_at timestamptz not null default now(),
  unique (organization_id, source_type, source_item_id),
  unique (organization_id, canonical_url_hash),
  unique (organization_id, external_id)
);

create table public.legacy_link_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_id text not null,
  original_url text not null,
  status text not null default 'needs_review'
    check (status in ('verified', 'needs_review')),
  note text,
  verified_at timestamptz,
  verified_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_id)
);

create table public.captures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  monitoring_item_id uuid not null references public.monitoring_items(id) on delete cascade,
  kind public.capture_kind not null,
  status public.capture_status not null default 'pending',
  asset_url text,
  html_archive_url text,
  failure_reason text,
  captured_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.report_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  key text not null,
  name text not null,
  sections jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  template_id uuid references public.report_templates(id),
  title text not null,
  version integer not null default 1,
  status public.report_status not null default 'draft',
  period_start date,
  period_end date,
  published_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (topic_id, version)
);

create table public.report_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  monitoring_item_id uuid not null references public.monitoring_items(id) on delete restrict,
  display_order integer not null default 0,
  card_data jsonb not null,
  warning text,
  created_at timestamptz not null default now(),
  unique (report_id, monitoring_item_id)
);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  password_hash text,
  max_views integer,
  view_count integer not null default 0,
  noindex boolean not null default true,
  watermark boolean not null default true,
  created_by uuid references auth.users(id),
  last_viewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index on public.memberships (user_id, organization_id);
create index on public.topics (organization_id);
create index on public.sources (organization_id, type);
create index on public.source_rules (organization_id, topic_id, active);
create index on public.keyword_rules (organization_id, topic_id);
create index on public.monitoring_items (organization_id, topic_id, state);
create index on public.monitoring_items (organization_id, relevance_score desc);
create index on public.monitoring_items (organization_id, original_url_status);
create index on public.legacy_link_overrides (organization_id, status);
create index on public.captures (organization_id, monitoring_item_id, kind);
create index on public.reports (organization_id, topic_id, version desc);
create index on public.report_items (organization_id, report_id, display_order);
create index on public.usage_events (organization_id, topic_id, created_at desc);
create index on public.jobs (organization_id, status, available_at);

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.plans enable row level security;
alter table public.topics enable row level security;
alter table public.sources enable row level security;
alter table public.source_rules enable row level security;
alter table public.keyword_rules enable row level security;
alter table public.api_credentials enable row level security;
alter table public.usage_limits enable row level security;
alter table public.usage_events enable row level security;
alter table public.connector_runs enable row level security;
alter table public.jobs enable row level security;
alter table public.monitoring_items enable row level security;
alter table public.legacy_link_overrides enable row level security;
alter table public.captures enable row level security;
alter table public.report_templates enable row level security;
alter table public.reports enable row level security;
alter table public.report_items enable row level security;
alter table public.share_links enable row level security;
alter table public.audit_logs enable row level security;

create policy "members can view their organizations"
on public.organizations for select
using (
  exists (
    select 1 from public.memberships m
    where m.organization_id = id and m.user_id = auth.uid()
  )
);

create policy "users can view own memberships"
on public.memberships for select
using (user_id = auth.uid());

create policy "owners can manage memberships"
on public.memberships for all
using (
  exists (
    select 1 from public.memberships m
    where m.organization_id = memberships.organization_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  )
)
with check (
  exists (
    select 1 from public.memberships m
    where m.organization_id = memberships.organization_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  )
);

create policy "members can read plans"
on public.plans for select
using (
  exists (
    select 1 from public.memberships m
    where m.organization_id = plans.organization_id and m.user_id = auth.uid()
  )
);

create policy "members can read topics"
on public.topics for select
using (
  exists (
    select 1 from public.memberships m
    where m.organization_id = topics.organization_id and m.user_id = auth.uid()
  )
);

create policy "owners and editors can manage topics"
on public.topics for all
using (
  exists (
    select 1 from public.memberships m
    where m.organization_id = topics.organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  )
)
with check (
  exists (
    select 1 from public.memberships m
    where m.organization_id = topics.organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  )
);

create policy "members can read operational tables"
on public.sources for select
using (exists (select 1 from public.memberships m where m.organization_id = sources.organization_id and m.user_id = auth.uid()));

create policy "editors can manage sources"
on public.sources for all
using (exists (select 1 from public.memberships m where m.organization_id = sources.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')))
with check (exists (select 1 from public.memberships m where m.organization_id = sources.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')));

create policy "members can read source rules"
on public.source_rules for select
using (exists (select 1 from public.memberships m where m.organization_id = source_rules.organization_id and m.user_id = auth.uid()));

create policy "editors can manage source rules"
on public.source_rules for all
using (exists (select 1 from public.memberships m where m.organization_id = source_rules.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')))
with check (exists (select 1 from public.memberships m where m.organization_id = source_rules.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')));

create policy "members can read keyword rules"
on public.keyword_rules for select
using (exists (select 1 from public.memberships m where m.organization_id = keyword_rules.organization_id and m.user_id = auth.uid()));

create policy "editors can manage keyword rules"
on public.keyword_rules for all
using (exists (select 1 from public.memberships m where m.organization_id = keyword_rules.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')))
with check (exists (select 1 from public.memberships m where m.organization_id = keyword_rules.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')));

create policy "owners can manage api credentials"
on public.api_credentials for all
using (exists (select 1 from public.memberships m where m.organization_id = api_credentials.organization_id and m.user_id = auth.uid() and m.role = 'owner'))
with check (exists (select 1 from public.memberships m where m.organization_id = api_credentials.organization_id and m.user_id = auth.uid() and m.role = 'owner'));

create policy "members can read usage limits"
on public.usage_limits for select
using (exists (select 1 from public.memberships m where m.organization_id = usage_limits.organization_id and m.user_id = auth.uid()));

create policy "owners can manage usage limits"
on public.usage_limits for all
using (exists (select 1 from public.memberships m where m.organization_id = usage_limits.organization_id and m.user_id = auth.uid() and m.role = 'owner'))
with check (exists (select 1 from public.memberships m where m.organization_id = usage_limits.organization_id and m.user_id = auth.uid() and m.role = 'owner'));

create policy "members can read usage events"
on public.usage_events for select
using (exists (select 1 from public.memberships m where m.organization_id = usage_events.organization_id and m.user_id = auth.uid()));

create policy "members can read connector runs"
on public.connector_runs for select
using (exists (select 1 from public.memberships m where m.organization_id = connector_runs.organization_id and m.user_id = auth.uid()));

create policy "members can read jobs"
on public.jobs for select
using (exists (select 1 from public.memberships m where m.organization_id = jobs.organization_id and m.user_id = auth.uid()));

create policy "members can read monitoring items"
on public.monitoring_items for select
using (exists (select 1 from public.memberships m where m.organization_id = monitoring_items.organization_id and m.user_id = auth.uid()));

create policy "editors can manage monitoring items"
on public.monitoring_items for all
using (exists (select 1 from public.memberships m where m.organization_id = monitoring_items.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')))
with check (exists (select 1 from public.memberships m where m.organization_id = monitoring_items.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')));

create policy "members can read legacy link overrides"
on public.legacy_link_overrides for select
using (exists (select 1 from public.memberships m where m.organization_id = legacy_link_overrides.organization_id and m.user_id = auth.uid()));

create policy "editors can manage legacy link overrides"
on public.legacy_link_overrides for all
using (exists (select 1 from public.memberships m where m.organization_id = legacy_link_overrides.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')))
with check (exists (select 1 from public.memberships m where m.organization_id = legacy_link_overrides.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')));

create policy "members can read captures"
on public.captures for select
using (exists (select 1 from public.memberships m where m.organization_id = captures.organization_id and m.user_id = auth.uid()));

create policy "editors can manage captures"
on public.captures for all
using (exists (select 1 from public.memberships m where m.organization_id = captures.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')))
with check (exists (select 1 from public.memberships m where m.organization_id = captures.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')));

create policy "members can read report templates"
on public.report_templates for select
using (
  organization_id is null
  or exists (
    select 1 from public.memberships m
    where m.organization_id = report_templates.organization_id
      and m.user_id = auth.uid()
  )
);

create policy "members can read reports"
on public.reports for select
using (exists (select 1 from public.memberships m where m.organization_id = reports.organization_id and m.user_id = auth.uid()));

create policy "editors can manage draft reports"
on public.reports for all
using (exists (select 1 from public.memberships m where m.organization_id = reports.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')))
with check (exists (select 1 from public.memberships m where m.organization_id = reports.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')));

create policy "members can read report items"
on public.report_items for select
using (exists (select 1 from public.memberships m where m.organization_id = report_items.organization_id and m.user_id = auth.uid()));

create policy "editors can manage report items"
on public.report_items for all
using (exists (select 1 from public.memberships m where m.organization_id = report_items.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')))
with check (exists (select 1 from public.memberships m where m.organization_id = report_items.organization_id and m.user_id = auth.uid() and m.role in ('owner', 'editor')));

create policy "owners can manage share links"
on public.share_links for all
using (exists (select 1 from public.memberships m where m.organization_id = share_links.organization_id and m.user_id = auth.uid() and m.role = 'owner'))
with check (exists (select 1 from public.memberships m where m.organization_id = share_links.organization_id and m.user_id = auth.uid() and m.role = 'owner'));

create policy "members can read audit logs"
on public.audit_logs for select
using (exists (select 1 from public.memberships m where m.organization_id = audit_logs.organization_id and m.user_id = auth.uid()));

insert into public.report_templates (key, name, sections)
values (
  'HidayathonMediaMonitoringTemplate',
  'قالب تقرير رصد هاكاثون هداية',
  '[
    "cover_page",
    "time_range_page",
    "stats_page",
    "daily_distribution_page",
    "platform_distribution_page",
    "top_publishers_page",
    "item_card_pages",
    "thank_you_page"
  ]'::jsonb
)
on conflict do nothing;
