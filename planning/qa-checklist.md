# RASD QA Checklist

Last updated: 2026-05-22

This checklist is the short production smoke test for RASD. Use it after each production deploy and before starting large UI work.

Current next check:

```text
Authenticated production smoke after /ops and /sources simplification
```

## Premium UI Refresh Quality Gate

Status: passed on 2026-05-22.

- GitHub `main` includes commit `6896679` for the premium admin/client shell refresh.
- Vercel production deployment is `Ready` and aliased to `https://rasd-gamma.vercel.app`.
- `npm run test` passed: 99 tests, 0 failures.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `npm audit --audit-level=moderate` still reports the known Next/PostCSS advisory; npm's suggested force fix is breaking and remains deferred.
- Signed-out browser smoke passed: `/login` renders with no console errors.
- Signed-out protected route smoke passed: `/overview` redirects to `/login` instead of returning 404.
- New protected routes `/overview` and `/directory` are included in the production build.

Current owner-side smoke target:

1. Open `https://rasd-gamma.vercel.app` as owner.
2. Confirm `/ops`, `/client-report`, `/sources`, `/access`, and `/settings` render cleanly after login.
3. Run one fresh `/ops` URL through intake, review, capture, live report insertion, and `/client-report` visibility.
4. Confirm RSS source schedule controls and keyword rules are visible and usable in `/sources`.
5. Confirm Viewer still lands on `/client-report` and remains blocked from admin routes.

## Operations Simplification Quality Gate

Status: deployed on 2026-05-22; pending authenticated production owner smoke.

- `/ops` is the daily content workbench: manual URL intake, duplicate feedback, review, capture, report insertion, and workflow cleanup.
- `/sources` is the source hub: RSS sources, source schedules, active/inactive state, manual polling, keyword rules, and advanced links to legacy import/backfill tools.
- Main navigation is intentionally reduced to: لوحة التشغيل، تقرير العميل، المصادر، المستخدمين، الإعدادات.
- Duplicate URL submissions now explain that the existing item was updated and opened for review, instead of only saying the URL exists.
- GitHub commit: `bc61ae8`.
- Vercel deployment: `rasd-mcd38wixs-samawahs-projects.vercel.app`, aliased to `https://rasd-gamma.vercel.app`.
- Signed-out production checks passed: `/ops`, `/sources`, and `/settings` redirect to login.

Local checks passed:

- `npm run test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Post-A10 Local Quality Gate

Status: passed on 2026-05-21.

- `npm run lint` passed after cleaning unused imports/variables in the new `/imports` work and admin home page.
- `npm run typecheck` passed.
- `npm run test` passed: 75 tests, 0 failures.
- `npm run build` passed.
- `npm audit --audit-level=moderate` reports a moderate advisory through `next` -> `postcss`; npm's suggested force fix would downgrade Next to an old incompatible version, so this remains a tracked dependency follow-up.

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
- Owner confirmed the live screenshot worker now produces real screenshots for manual items.
- Viewer account `omarsamawah@gmail.com` was created and assigned `viewer` membership for Hidayathon. After routing fixes, owner confirmed the Viewer account enters the platform.

Run these in production while logged in as `samawah.pod@gmail.com`:

0. Open `https://rasd-gamma.vercel.app/ops`, `/sources`, `/client-report`, `/access`, and `/settings`; confirm all render after login and use the refreshed shell.

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
21. Open the item detail, expand `تعديل بيانات المادة`, edit title/summary/publisher/date/original URL, save, and confirm the list/detail reflect the correction.
22. Approve the item, run report-grade capture, and confirm `/ops` shows a content evidence image for the item.
23. Add it to the live Hidayathon report.
24. Open `https://rasd-gamma.vercel.app/client-report` and confirm the corrected item appears with original link, publisher, summary, platform, date, and a content image.
25. Confirm admin tools are visible only while logged in as owner/editor.
26. Confirm a signed-out browser redirects `/client-report` to `/login?next=%2Fclient-report`.
27. Confirm the client handoff is Viewer login to `https://rasd-gamma.vercel.app/client-report`, not a public share-link flow.
28. As owner, open `https://rasd-gamma.vercel.app/access`, create/update one email-password Viewer account, and confirm that account can open `/client-report` only.
29. Confirm email-password login does not stay stuck on `جاري التحقق`; it should either enter the app or show a clear Arabic error within about 12 seconds.

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

## RSS Manual Polling Smoke Test

Use this after C1.2 deploy:

- As owner/editor, open `https://rasd-gamma.vercel.app/sources`.
- For one article/tweet from legacy reports, use `رابط مادة واحدة` in `/ops`; do not paste article URLs into the RSS source form.
- If no source exists, add one from `/sources` using a public RSS feed URL and confirm the source appears without opening Supabase.
- Add the same RSS feed again and confirm the UI reports that the source already exists rather than creating another active source.
- Confirm the `مصادر الأخبار` block shows active RSS sources.
- Click `تشغيل` for one RSS source and confirm the response message shows fetched, created, duplicate, and failed counts.
- For a generic source such as Okaz, confirm unrelated items are counted as `غير مطابق` and do not appear in the review list.
- Update `كلمات الرصد` from `/sources`, save, and confirm the next RSS run uses the new terms.
- Confirm new RSS materials appear in the same review list as manual URL items.
- Re-run the same source and confirm duplicates increase while created stays 0 for the same feed entries.
- Confirm the new RSS item can be approved, captured, and added to the live Hidayathon report like manual items.
- Confirm a Viewer account cannot call `POST /api/sources/:id/poll` or `POST /api/sources/poll-active`.
- Confirm failed/broken feeds return a JSON error message, not an empty response or `Unexpected end of JSON input`.

## Current Residual Risks

- End-to-end manual intake through `/ops` should be repeated with a fresh URL after each workflow change.
- Filtered PDF export is currently a printable browser HTML export capped at 50 visible items, not a server-generated binary PDF.
- X metadata depends on public oEmbed availability. When X blocks or omits metadata, `/ops` should still save the original link and show a clear warning instead of silently losing the item.
- Share-link API/RLS security passed production checks, but share links are intentionally dormant for now; primary client access is Viewer login to `/client-report`.
- RSS/source automation has manual owner/editor polling plus a daily Vercel cron protected by `CRON_SECRET`; each source decides whether it is due by its admin schedule.
- Link backfill still matters for future corrections, but the current legacy PDF archive now has original links from interactive PDF annotations.
- `npm audit --audit-level=moderate` currently reports a `postcss` advisory via Next. Do not run `npm audit fix --force`; wait for a compatible Next/PostCSS patch path.
- After the cleanup deploy, production `/client-report`, `/ops`, `/imports`, and Viewer restrictions need one quick smoke pass on `https://rasd-gamma.vercel.app`.
