# RASD QA Checklist

Last updated: 2026-05-21

This checklist is the short production smoke test for RASD. Use it after each production deploy and before starting large UI work.

## Production Persistence

Status: passed on 2026-05-20.

Owner-confirmed endpoint:

```text
https://rasd-gamma.vercel.app/api/admin/persistence
```

Expected authenticated result:

- `mode` is `supabase`.
- `ok` is `true`.
- `publicConfigured` is `true`.
- `serverConfigured` is `true`.
- `projectRef` is `ewunxfttbpqisspqthiz`.
- `missing.serviceRoleKey` is `false`.

Expected unauthenticated result:

- `/api/admin/persistence` returns `401 auth_required`.
- `/api/client-report/hidayathon` returns `401 auth_required`.
- `/client-report` redirects to `/login?next=%2Fclient-report`.

Live DB sanity target:

- 124 legacy monitoring items.
- 124 legacy captures.
- 124 legacy report-item links.
- 124 openable legacy original links from PDF link annotations.
- 4 legacy reports.
- 3 legacy link overrides.
- 2 default manual items.
- 0 public tables with RLS disabled.

## Manual Owner Smoke Test

Run these in production while logged in as `samawah.pod@gmail.com`:

1. Open `https://rasd-gamma.vercel.app/api/admin/persistence`.
2. Confirm the JSON matches the Production Persistence expectations above.
3. Open `https://rasd-gamma.vercel.app/client-report`.
4. Confirm the Hidayathon report loads real items, not an empty state.
5. Use filters for date, platform, source, link status, and screenshot status.
6. Open an item detail and confirm it shows the original link or historical evidence image.
7. For X items, confirm original links open `x.com/.../status/...` post permalinks extracted from the PDF link icon.
8. Open `https://rasd-gamma.vercel.app/imports/backfill`.
9. Confirm missing-link items appear and evidence/search helpers are visible.
10. Open `https://rasd-gamma.vercel.app/ops`.
11. Confirm admin tools are visible only while logged in as owner/editor.

## Automated Local Checks

Run before pushing production-impacting work:

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
npm run supabase:db:dry-run
```

For live row-count sanity:

```powershell
npx --yes supabase db query --db-url $env:SUPABASE_DB_URL --file scripts/verify_priority_a.sql -o json
```

## Current Residual Risks

- Viewer-role behavior still needs a real viewer account or invite flow test.
- End-to-end manual intake through `/ops` should be repeated with a fresh URL after each workflow change.
- Share links need a browser-level production test after the report/share UI is polished.
- X/RSS/source automation is not connected yet; current real monitoring is manual/legacy.
- Link backfill still matters for future corrections, but the current legacy PDF archive now has original links from interactive PDF annotations.
