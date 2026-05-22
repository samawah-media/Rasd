alter table public.source_rules
  add column if not exists poll_interval_minutes integer not null default 1440;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'source_rules_poll_interval_minutes_check'
      and conrelid = 'public.source_rules'::regclass
  ) then
    alter table public.source_rules
      add constraint source_rules_poll_interval_minutes_check
      check (poll_interval_minutes between 15 and 10080);
  end if;
end $$;
