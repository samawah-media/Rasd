# RASD QA Checklist

Last updated: 2026-05-21

This checklist is the short production smoke test for RASD. Use it after each production deploy and before starting large UI work.

Current next check:

```text
A10. Owner-authenticated Production Smoke Test
```

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
- 124 cropped legacy content images in `monitoring_items.evidence_image_path`.
- 124 cropped legacy content images in `captures.asset_url`.
- 124 publisher profile crop references in the client report dataset.
- 4 legacy reports.
- 3 legacy link overrides.
- 3 default manual items.
- Any manually approved live-report items should be linked through the default Hidayathon live report, not by hard-coded `report-5`.
- 0 public tables with RLS disabled.

Live Supabase schema/RLS verification:

- Passed on 2026-05-21 against project `ewunxfttbpqisspqthiz`.
- Applied migration `20260521094823_allow_editor_share_links.sql`.
- `share_links` now has policy `owners and editors can manage share links`.
- The live policy allows `owner` and `editor` and excludes `viewer`.
- The live Priority A SQL returned 0 public tables with RLS disabled.

## Manual Owner Smoke Test

Partial run on 2026-05-21:

- GitHub `main` was synced with production code at commit `87575f5`.
- Vercel deployment `https://rasd-6jev465st-samawahs-projects.vercel.app` reached `Ready`.
- Production alias `https://rasd-gamma.vercel.app` points at that deployment.
- Signed-out API checks passed:
  - `/api/admin/persistence` returns `401 auth_required`.
  - `/api/client-report/hidayathon` returns `401 auth_required`.
  - `/client-report` redirects to `/login?next=%2Fclient-report`.
- Browser reached Google sign-in. The remaining checks below require completing owner login as `samawah.pod@gmail.com`.
- Owner opened `/client-report` successfully in their authenticated browser session.
- The client report loaded real production data and initially showed 126 visible items: 124 legacy archive items plus 2 live-report items.
- Smoke finding: one old live test item, `اختبار رصد هداية هاكاثون`, had a historical placeholder report-grade asset `/window.svg`.
- Fix added: `/window.svg` is no longer treated as client evidence; the UI should mark it as missing evidence instead of displaying a fake screenshot.
- Owner chose to remove the old test item. Production cleanup deleted 1 monitoring item, 1 report link, and 2 old captures for `https://hedayathon.com`.
- Post-cleanup production state: 124 legacy report items plus 1 live X report item, so the client report should show 125 items after refresh.
- Owner confirmed after refresh that the client report works as expected: total coverage is correct, the first visible item is valid, day filtering works, and filtered PDF export opens. PDF polish remains a later improvement, not an A10 blocker.

Run these in production while logged in as `samawah.pod@gmail.com`:

1. Open `https://rasd-gamma.vercel.app/api/admin/persistence`.
2. Confirm the JSON matches the Production Persistence expectations above.
3. Open `https://rasd-gamma.vercel.app/client-report`.
4. Confirm the Hidayathon report loads real items, not an empty state.
5. Confirm the redesigned page shows `رصد هداية هاكاثون`, four top metrics, day heatmap, compact filters, visual content rows, and a detail panel.
6. Click `أعلى يوم نشاط` and a day in the heatmap; confirm the content list filters immediately.
7. Use visible filters for search, date, platform, and the `المزيد` filters for source, sentiment, data scope, and readiness.
8. Open an item detail and confirm it shows the original link, a cropped content image, publisher/profile image, author/source, date, platform, sentiment, copy actions, image zoom, and image download.
9. Confirm the client page does not show internal fields: confidence, raw text, extraction warnings, report page number, backfill links, or admin controls.
10. For X items, confirm original links open `x.com/.../status/...` post permalinks extracted from the PDF link icon.
11. Apply a filter that returns 50 or fewer items, click `تصدير PDF`, and confirm a printable Arabic report opens.
12. Try exporting more than 50 visible items and confirm the UI asks for a narrower range.
13. Open `https://rasd-gamma.vercel.app/imports/backfill`.
14. Confirm the backfill page no longer shows bulk missing legacy links for the current archive; it should remain available for future corrections.
15. Open `https://rasd-gamma.vercel.app/ops`.
16. Paste one fresh public X or news URL without filling optional manual fields.
17. Confirm the new item appears immediately at the top of `/ops` with readable title/summary, publisher, platform, date when available, and the original link.
18. Confirm private/internal URLs such as `http://127.0.0.1/admin` are rejected.
19. Confirm X URLs with `?lang=...` or tracking parameters dedupe to the clean `https://x.com/.../status/...` URL.
20. If a duplicate was previously saved without tweet metadata, submit it again and confirm the same item is refreshed with tweet text, publisher, handle, and date.
21. Approve the item, run report-grade capture, and confirm `/ops` shows a content evidence image for the item.
22. Add it to the live Hidayathon report.
23. Open `https://rasd-gamma.vercel.app/client-report` and confirm the new item appears with original link, publisher, summary, platform, date, and a content image.
24. Confirm admin tools are visible only while logged in as owner/editor.
25. Confirm a signed-out browser redirects `/client-report` to `/login?next=%2Fclient-report`.
26. Confirm `/share/[token]`, when generated by owner/editor from the admin/report flow, is read-only, noindexed, and does not show admin tools.

## Content Screenshot Pipeline Smoke Test

Use this after the PDF crop production path is changed:

- Confirm sample crops exist for 10 representative items under `public/imports/legacy-content-crops/sample`.
- Confirm full production crops exist for all 124 items under `public/imports/legacy-content-crops/full`.
- Open `public/imports/legacy-content-crops/sample/review.html` locally and visually inspect all 10 crops.
- Open `public/imports/legacy-content-crops/full/review.html` locally only when you need a full visual pass; it contains all 124 cards.
- Confirm each sample includes a compact publisher profile crop with the username/profile handle and profile/logo area. In the legacy PDF this is labeled `الكاتب`.
- Confirm cards show `تصنيف المحتوى` rather than internal crop-quality labels.
- Confirm each sample keeps the full-page report evidence as fallback in `manifest.json`.
- Confirm `public/imports/legacy-content-crops/full/manifest.json` has `total_items: 124`, `group_counts.all: 124`, and high/medium confidence for all 124.
- Confirm no live capture is run for all 124 links before a separate live-capture sample succeeds.
- Confirm weak/failed crops are marked and do not replace trusted evidence.
- Confirm client report prefers content crop when available and keeps full-page PDF evidence as fallback metadata.

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
- The redesigned production client report has owner-side acceptance for the refreshed data/filter/export flow, but the latest manual item still needs confirmation after the screenshot worker fix lands.
- Filtered PDF export is currently a printable browser HTML export capped at 50 visible items, not a server-generated binary PDF.
- X metadata depends on public oEmbed availability. When X blocks or omits metadata, `/ops` should still save the original link and show a clear warning instead of silently losing the item.
- Share-link API/RLS security passed production checks, but share links still need a browser-level production test with a newly generated token.
- X/RSS/source automation is not connected yet; current real monitoring is manual/legacy.
- Link backfill still matters for future corrections, but the current legacy PDF archive now has original links from interactive PDF annotations.
- Real live screenshot capture is not implemented yet; current capture workflow must not be treated as proof of a successful browser screenshot until the new pipeline replaces the placeholder behavior.
- Live manual captures currently generate a rendered evidence image from the fetched tweet/page metadata, not a browser screenshot of the live X page. This prevents blank placeholders while the real browser-capture service remains a separate pipeline task.
