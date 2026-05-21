alter table public.sources
  add column if not exists feed_url text,
  add column if not exists is_active boolean not null default true,
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_error text,
  add column if not exists poll_interval_minutes integer not null default 1440;

do $$
begin
  alter table public.sources
    add constraint sources_feed_url_public_http_check
    check (feed_url is null or feed_url ~* '^https?://');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.sources
    add constraint sources_poll_interval_minutes_range_check
    check (poll_interval_minutes between 15 and 10080);
exception
  when duplicate_object then null;
end $$;

create index if not exists sources_organization_active_type_idx
on public.sources (organization_id, is_active, type);
