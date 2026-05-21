drop policy if exists "owners can manage share links" on public.share_links;
drop policy if exists "owners and editors can manage share links" on public.share_links;

create policy "owners and editors can manage share links"
on public.share_links for all
using (
  exists (
    select 1
    from public.memberships m
    where m.organization_id = share_links.organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  )
)
with check (
  exists (
    select 1
    from public.memberships m
    where m.organization_id = share_links.organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  )
);
