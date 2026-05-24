alter table public.monitoring_items
  add column if not exists discovery_method text;
