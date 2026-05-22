alter type public.source_type add value if not exists 'tiktok_research';
alter type public.source_type add value if not exists 'instagram_public_profile';

alter type public.usage_event_type add value if not exists 'tiktok_read';
alter type public.usage_event_type add value if not exists 'instagram_read';
alter type public.usage_event_type add value if not exists 'media_hydration';
