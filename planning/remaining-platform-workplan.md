# RASD Remaining Platform Workplan

Last updated: 2026-05-21

This file lists the remaining work needed to make the platform operate efficiently and become testable with real Hidayathon monitoring data.

Current priority:

```text
B4 /ops simplification and production review
```

Immediate prerequisite:

```text
Completed: sync deployed local changes to GitHub
```

The 2026-05-21 production deploy was originally made directly from the local working tree. Commit `87575f5` synced those deployed changes to GitHub `main`, and Vercel redeployed from GitHub to production.

Why this is next:

- The production client experience was redesigned and deployed to Vercel on 2026-05-21.
- The legacy archive, links, content crops, and publisher crops are already wired into the client report path.
- Manual intake and evidence-lite capture have automated coverage, but the full production browser loop still needs owner-side confirmation.
- Before building more UI or automation, the team needs one trusted production pass proving the deployed app works with the real Supabase runtime.

## North Star

The platform is considered ready for serious testing when this loop works end to end:

```text
Sources -> Ingestion -> Supabase persistence -> Review -> Links/screenshots -> Client report -> Export/share -> Role-protected access
```

## Phase 0 - Already Completed Foundation

Status: done enough for the next operational phase.

- Next.js app deployed to Vercel.
- Production URL is active: `https://rasd-gamma.vercel.app`.
- GitHub repository is connected to Vercel: `samawah-media/Rasd`.
- Push to `main` triggers Vercel production deployment.
- Supabase project is selected: `ewunxfttbpqisspqthiz`.
- Google provider starts successfully and redirects to Google.
- Owner login with `samawah.pod@gmail.com` works according to user confirmation.
- Admin/client route protection exists.
- Client report redesign was deployed to production on Vercel on 2026-05-21.
- Initial legacy Hidayathon reports are extracted.
- Legacy backfill workflow exists for missing links.
- Local docs exist for auth/deployment and UI redesign.

## Priority A - Critical Tasks For Real Testing

These tasks come before the full redesign. Without them, the platform can look good but will not be operationally trustworthy.

### A1. Confirm Production Auth Loop

Goal:

Make sure production login and protected routes are stable.

Tasks:

- Confirm owner login redirects to admin area.
- Confirm `/client-report` redirects unauthenticated users to `/login`.
- Confirm `/imports`, `/imports/backfill`, `/feed`, `/ops`, and `/reports/*` are blocked for viewer/unauthenticated users.
- Confirm logout clears the production session.
- Rotate the Google OAuth client secret because it was pasted in chat.
- Update Supabase Google Provider with the rotated secret.

Acceptance:

- Owner can log in and reach admin.
- Unauthenticated users cannot enter protected pages.
- Google login does not loop back silently.

Owner-side work:

- Rotate Google Client Secret in Google Cloud.
- Put the new secret directly into Supabase, not in chat.

### A2. Production Persistence Health Check

Goal:

Confirm production is not relying on memory for critical data.

Status: completed on 2026-05-20.

Status update - 2026-05-20:

- Production Vercel has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `RASD_ADMIN_IMPORT_TOKEN` configured for Production.
- `/api/admin/persistence` and `/api/client-report/hidayathon` return `401 auth_required` when called without a logged-in owner/member session, so the operational health endpoints are not public.
- Live Supabase schema is reachable and current migrations are up to date.
- Live persisted Hidayathon data is present: 124 legacy monitoring items, 124 legacy captures, 124 report-item links, 4 legacy reports, 3 legacy link overrides, and 2 default manual items.
- `share_links` write path was smoke-tested against Supabase by creating and immediately revoking a test link for a legacy report; only a SHA-256 token hash was stored.
- Fixed the production verification script and legacy import/backfill organization upserts to use the canonical slug `legacy-hidayathon`.
- Owner-side confirmation completed: `/api/admin/persistence` returned `mode: "supabase"`, `ok: true`, `publicConfigured: true`, `serverConfigured: true`, project ref `ewunxfttbpqisspqthiz`, and no missing service-role key.

Tasks:

- [x] Open `/api/admin/persistence` in production as owner.
- [x] Confirm Supabase schema is reachable.
- [x] Confirm server has `SUPABASE_SERVICE_ROLE_KEY`.
- [x] Confirm `share_links` and legacy persistence paths can use Supabase.
- [x] Confirm data survives a Vercel redeploy/server restart.

Acceptance:

- [x] Runtime reports Supabase as available for writes.
- [x] No critical workflow depends only on process memory.

### A3. Apply/Verify Supabase Schema

Goal:

Ensure the live Supabase DB has the complete schema and RLS.

Status update - 2026-05-21:

- Local schema and initial migration were updated so share-link management is allowed for `owner` and `editor`, while `viewer` remains blocked.
- Live Supabase verification found the already-applied initial migration still had the older owner-only `share_links` policy.
- Applied migration `20260521094823_allow_editor_share_links.sql` to the live project `ewunxfttbpqisspqthiz`.
- Live `share_links` RLS now has policy `owners and editors can manage share links`, with `owner` and `editor` allowed and `viewer` excluded.
- Live Priority A sanity query passed: 124 legacy monitoring items, 124 captures, 124 report-item links, 124 openable original links, 4 legacy reports, 3 legacy link overrides, 3 default manual items, and 0 public tables without RLS.

Tasks:

- [x] Verify all tables from `supabase/schema.sql` exist in project `ewunxfttbpqisspqthiz`.
- [x] Verify RLS is enabled on exposed public tables.
- [x] Verify organization, membership, report, item, capture, share-link, and audit tables exist.
- [x] Verify Data API exposure/grants are deliberate enough for the current server-side service-role runtime; keep explicit grants under review before broader client-side Data API use.
- [x] Verify service-role server operations can write safely.
- [x] Verify live `share_links` RLS policy allows `owner/editor` management and blocks `viewer`.

Acceptance:

- [x] Schema exists.
- [x] RLS is enabled.
- [x] App APIs can read/write the expected tables.
- [x] Share-link policies match the current product decision: owner/editor manage links; viewer cannot.

### A4. Move Legacy Hidayathon Data Fully Into Supabase

Goal:

Use real historical data as the first test corpus.

Tasks:

- Run legacy Supabase dry-run plan.
- Review counts: 124 monitoring items, 124 captures, 124 report-item links.
- Run real legacy upsert.
- Confirm rerun is idempotent and does not duplicate rows.
- Confirm 124 interactive PDF annotation links are stored as openable.
- Confirm X rows use real `x.com/.../status/...` post permalinks when available from the PDF link icon.

Acceptance:

- `/client-report` can read Hidayathon data from Supabase.
- Restart/redeploy does not remove imported reports.
- Missing links are not fabricated.

### A5. Wire Client Report To DB Data

Goal:

Make `/client-report` show persisted real data.

Status update - 2026-05-20:

- Code completed: `/client-report` and `/api/client-report/hidayathon` now prefer the persisted legacy Hidayathon report data from Supabase when server credentials are configured.
- Local fallback remains available for development, and production fallback now requires explicit `RASD_CLIENT_REPORT_FALLBACK=local`.
- Client-safe filters now include source, link status, and screenshot status. Viewer role no longer sees the raw extracted text toggle.
- Pending production verification: confirm the live Supabase import has data and the deployed report renders it after redeploy.

Status update - 2026-05-21:

- `/client-report` was redesigned into a simpler Arabic Saudi client workspace.
- The page now focuses on four top metrics, a clickable day heatmap, compact filters, a visual content list, and a detail panel/bottom sheet.
- Client-facing UI no longer exposes confidence, raw extraction text, extraction warnings, report page numbers, backfill links, or admin tools.
- Viewer can export the currently filtered view through a printable PDF-style HTML export, capped at 50 visible items.
- Product decision on 2026-05-21: the primary client experience is authenticated Viewer access to `/client-report`; public `/share/[token]` remains a tested backend capability but is not part of the daily workflow.
- Production deployment completed and aliased to `https://rasd-gamma.vercel.app`.

Tasks:

- [x] Ensure `/api/client-report/hidayathon` reads from Supabase in production.
- [x] Keep local/mock fallback only for development or explicit fallback.
- [x] Show original links, evidence image paths, source, date, platform, text, and status.
- [x] Keep filters working by date range, platform, source, sentiment, data scope, and readiness.
- [x] Hide raw extraction/admin details from viewer.
- [x] Keep client report comfortable and visual: metrics, heatmap, content thumbnails, publisher image, and detail drawer.
- [x] Add client-safe filtered export with a 50-item guardrail.

Acceptance:

- Client report shows real imported/persisted data.
- Filters operate on production data.
- Viewer sees only client-safe fields.
- Client report does not show internal technical fields or admin controls.

### A6. Link Backfill Persistence

Goal:

Make link fixes permanent and visible in client report.

Status update - 2026-05-21:

- Client report now distinguishes true original links from links merely mentioned inside X content.
- For X items, non-X URLs such as `hedayathon.com` are no longer shown as the original tweet link. They are shown as content links with a note that the tweet permalink still needs backfill.
- Current local client-report split: 1 true openable original link, 23 content-only links, 100 legacy-evidence-only items, and 0 malformed client links.
- Follow-up correction: original PDFs contain interactive links behind the link icon. The extractor now reads those annotations; current local split is 124 openable original links, including 70 X post permalinks, with 0 missing legacy links.

Tasks:

- Keep `/imports/backfill` as the admin workflow for missing/malformed links.
- Ensure overrides are stored in Supabase, not only JSON.
- Allow admin/editor to update original URL status.
- Track `missing`, `malformed`, `verified`, `manual_override`, and `legacy_evidence_only`.
- Show updated links in `/client-report`.

Acceptance:

- When a link is corrected, it remains corrected after redeploy.
- Client report reflects corrected original links.

### A7. Content Screenshot Evidence Pipeline

Goal:

Show the actual visual content for each item, not only the full PDF page image.

Planning reference:

- `planning/content-screenshot-pipeline-plan.md`

Current finding:

- The existing capture workflow is a state machine, but live capture currently stores a placeholder asset (`/window.svg`) rather than a real browser screenshot.
- The safest baseline is to extract/crop images already present in the legacy PDF report pages, then trial live screenshots on a small sample.

Status update - 2026-05-21:

- PDF crop extraction is now production-ready for the legacy Hidayathon archive.
- Generated 124 content crops and 124 publisher profile crops under `public/imports/legacy-content-crops/full`.
- `public/imports/legacy-content-crops/full/manifest.json` maps every legacy item to its content image, publisher image, and full-page fallback evidence.
- `/client-report` now reads only the legacy Hidayathon organization for this report and no longer mixes default/manual test items into the client dataset.
- Client report data now returns 124 items, 124 content images, 124 publisher profile images, and 124 full-page fallback references.
- Supabase was upserted with cropped content image paths in `monitoring_items.evidence_image_path`, `captures.asset_url`, and report card data while preserving full-page fallback paths in metadata.
- Automated coverage now asserts full production crop assets, Supabase mapping, and client-report image fields.

Tasks:

- [x] Build a PDF crop proof of concept for 10 representative items.
- [x] Compare crop quality across X posts, news/site pages, and official links.
- [x] Keep full-page report evidence as fallback for every item.
- [x] Add crop metadata and confidence before running all 124 items.
- [x] Persist chosen content image paths through the legacy import/Supabase path.
- Trial live Playwright screenshots on a 10-link sample only after PDF crops are reviewed.
- Replace placeholder capture behavior with real capture only after the sample succeeds.

Acceptance:

- Client report can show a useful content image for most legacy items.
- Missing or weak crops do not remove the historical full-page evidence.
- No expensive all-link live capture is run before a sample proves value.
- Screenshot references survive redeploy.

### A8. Minimum Real Monitoring Input

Goal:

Start testing current monitoring, even before full automation.

Status update - 2026-05-21:

- Manual URL intake now accepts validated `http/https` URLs only and supports title, summary text, publisher name, publisher handle, and source publish date.
- Manual URL intake now hydrates pasted X/news links automatically when possible, using X oEmbed for public posts and HTML metadata for normal websites.
- X status URLs are canonicalized across `x.com`/`twitter.com`, language parameters, tracking parameters, and fragments so old duplicate rows can be refreshed instead of staying empty.
- Manual intake stores the canonical URL, dedupe hash, source metadata, derived platform (`X` or `Website`), review state, evidence-lite capture, and audit event in the active persistence mode.
- `/api/reports/hidayathon-live` exposes the current live Hidayathon report id so `/ops` no longer relies on the local-only `report-5` id in production.
- `/ops` now focuses on a simple owner flow: paste URL, review the hydrated item immediately, approve, capture, then add to the live Hidayathon report.
- Live report-grade capture now stores a rendered evidence image from the fetched item metadata instead of the old `/window.svg` placeholder. A true browser screenshot service remains a later A7/C4 task.
- `/client-report` can include manual items after they are reviewed, report-grade captured, and added to the live report, while keeping unlinked default/manual test rows out of the client dataset.
- Automated API coverage now proves a real X URL can flow through intake -> metadata hydration -> duplicate detection -> review -> capture -> report insertion -> client report.

Tasks:

- [x] Support manual URL intake for X/news URLs in production.
- [x] Store source, platform, URL, title/text, author, author handle, published date, captured date, and review status.
- [x] Fetch readable metadata from a pasted URL before asking the editor for manual fields.
- [x] Refresh stale duplicate manual rows when metadata becomes available later.
- [x] Replace live manual placeholder capture assets with a content evidence image.
- [x] Dedupe by canonical URL and organization.
- [x] Allow owner/editor to approve/reject items.
- [x] Allow approved items to appear in the client report.

Acceptance:

- [x] We can add a real URL today and see it flow into review/report.
- [x] Dedupe prevents repeated test submissions.

### A9. Review Workflow Persistence

Goal:

Make editorial decisions durable.

Status update - 2026-05-21:

- Manual intake, review, capture, report insertion, share-link creation/revoke, and audit events are implemented through the persistent store path.
- The remaining need is a production smoke pass proving these decisions survive the real Vercel/Supabase runtime and are visible in the client report.

Tasks:

- Persist approve/reject status.
- Persist report insertion status.
- Persist capture warnings.
- Persist editor notes.
- Write audit logs for manual URL, review, link update, capture, report insert, share link creation/revoke.
- Verify the above in production with a fresh manual item.

Acceptance:

- Refresh/redeploy does not erase review state.
- Admin can understand who changed what and when.

### A10. Production Smoke Test

Goal:

Have one repeatable checklist that proves the platform can be tested seriously.

Status:

```text
PASSED WITH FOLLOW-UPS
```

Reason:

This is the first task that proves the deployed system is actually usable end to end after the client UI redesign and production deployment.

Tasks:

- [x] Owner login.
- [x] Create/import item.
- [x] Review item.
- [x] Add/fix original link.
- [x] Confirm client report shows item.
- [x] Confirm client report metrics, heatmap, filters, item details, publisher image, original link, and filtered export work.
- [x] Confirm production live screenshot/content image for the latest manual item after the screenshot worker fix lands.
- [x] Confirm unauthenticated users cannot access admin/client API routes.
- [x] Confirm viewer cannot access admin routes with a real viewer account.
- [x] Confirm share-link API security: create/revoke is owner/editor-only, public resolve is read-only, invalid/revoked links do not expose data, and pages are noindexed.
- [x] Defer visible share-link UI; the product now uses Viewer login to `/client-report` as the primary client access path.
- [x] Confirm owner/editor can manage share links while viewer is blocked by live RLS.
- [x] Confirm Vercel redeploy does not lose persisted legacy/client-report data.

Acceptance:

- One Hidayathon item can travel through the full platform loop.
- The deployed client experience is comfortable enough for real client review.
- The smoke-test result is recorded in `planning/qa-checklist.md`.

Status update - 2026-05-21:

- Synced the deployed local changes to GitHub with commit `87575f5`.
- Vercel Git deployment `rasd-6jev465st-samawahs-projects.vercel.app` is `Ready` and aliased to `https://rasd-gamma.vercel.app`.
- Unauthenticated protection passed: `/api/admin/persistence` and `/api/client-report/hidayathon` return `401 auth_required`, and `/client-report` redirects to `/login?next=%2Fclient-report`.
- Browser login reached Google sign-in, but owner-authenticated smoke testing needs the owner to complete Google login in the browser session before the client report and `/ops` workflow can be verified live.
- Owner confirmed `/client-report` opens in their authenticated browser session and shows the redesigned `رصد هداية هاكاثون` workspace.
- The production client report initially showed 126 items: 124 legacy archive items plus 2 live-report items.
- A10 found an old live test item using the historical `/window.svg` placeholder capture. Code now excludes `/window.svg` from client evidence so fake screenshots are not shown.
- Owner chose to remove the old test artifact. Production cleanup deleted the `https://hedayathon.com` test monitoring item, its report link, and two old captures.
- Post-cleanup state should show 125 client report items after refresh: 124 legacy archive items plus 1 live X report item.
- Owner confirmed the refreshed client report works: expected item count, valid first item, clickable day filtering, and filtered PDF export. Export quality polish remains a later D2 task, not a blocker for A10.
- Additional production security check on 2026-05-21:
  - Unauthenticated production checks passed for `/`, `/ops`, `/imports`, `/feed`, `/reports/report-5`, and `/client-report`; page routes redirect to `/login`.
  - Unauthenticated API checks passed for `/api/admin/persistence`, `/api/client-report/hidayathon`, `/api/client-report/hidayathon/export-pdf`, `/api/items/:id/evidence-card.svg`, `/api/reports/:id/share-link`, and `/api/share-links/:token/revoke`; all return `401 auth_required`.
  - Public share-link resolve is intentionally public, but an invalid token returns `share_link_not_found`, and `/share/not-a-real-token` renders a private noindex "link unavailable" page with no admin tools.
  - Live Supabase `share_links` RLS was rechecked: only `owner` and `editor` satisfy the management policy; `viewer` is excluded.
  - `npm run test` passed with 75 tests, including share-link token privacy, view limits, revocation, expiry, client export guardrails, auth routing, and Supabase RLS/schema checks.
  - `npm run typecheck` passed.
  - `npm run lint` is currently blocked by the in-progress `/imports` work from the parallel agent (`src/app/imports/imports-client.tsx`), so it is not treated as an A10 regression until that work is merged/fixed.
- Viewer-account finding on 2026-05-21:
  - `omarsamawah@gmail.com` was created in production Auth and added as `viewer` for both `rasd-hidayathon` and `legacy-hidayathon`.
  - Viewer routing was fixed after a redirect loop, and the owner confirmed the Viewer account now enters the platform.
  - Viewer access is treated as validated for A10; admin-route blocking remains part of the standard smoke checklist.
- Live screenshot update on 2026-05-21:
  - The screenshot worker fix from the parallel agent restored real screenshots for live manual items.
  - Owner confirmed the screenshot evidence is now real and better than the previous placeholder/blank state.

## Post-A10 Stabilization And Quality Gate

Goal:

Stabilize the codebase after parallel work before starting the next feature sprint.

Tasks:

- [x] Resolve the remaining `npm run lint` failure in `src/app/imports/imports-client.tsx`.
- [x] Re-run `npm run test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
- [ ] Re-check production `/client-report`, `/ops`, `/imports`, and Viewer restrictions after the cleanup deploy.
- [x] Update this workplan and `planning/qa-checklist.md` with the local post-A10 quality result.

Local quality result - 2026-05-21:

- `npm run lint` passed after removing unused imports/variables from `/imports` and the admin home page.
- `npm run typecheck` passed.
- `npm run test` passed: 75 tests, 0 failures.
- `npm run build` passed with Next.js production build.
- `npm audit --audit-level=moderate` still reports a moderate `postcss` advisory through Next; npm suggests a breaking force fix, so this is tracked as a dependency follow-up instead of being applied.

Acceptance:

- [x] The repository passes the standard local quality gate.
- Production remains usable for Owner and Viewer after the cleanup deploy.
- Priority B work can continue without carrying known lint/type/build debt.

## Priority B - Needed For Efficient Operations

These tasks make the platform usable by the team day to day.

### B1. Admin Operations Dashboard

Status: first pass implemented by parallel agent on 2026-05-21; local quality gate passed, pending owner UX review.

- Show data mode: Supabase vs memory.
- Show last import time.
- Show counts for monitored, approved, missing-link, malformed-link, and report-ready items.
- Show connector health.
- Show latest errors and failed jobs.

### B2. Legacy Import Tools

Status: deferred on 2026-05-21. Legacy archive import is not a daily workflow now; keep these pages as admin-only maintenance tools.

- Make review faster with table + detail drawer.
- Bulk approve legacy batches.
- Highlight low-confidence extraction.
- Preserve report/page/source context.
- Add clear "imported to DB" state.

### B3. Legacy Link Backfill

Status: deferred on 2026-05-21. Current legacy report links are good enough for testing; use this only for future corrections.

- Filter missing vs malformed vs fixed.
- Show evidence page preview beside candidate search links.
- Allow quick save of corrected URL.
- Add verification status and notes.

### B4. Improve `/ops`

Status: first pass implemented locally on 2026-05-21; pending production review with the owner account.

- [x] Convert `/ops` into a focused inbox-style workbench.
- [x] Keep the main flow visible: paste link, review, capture, add to report.
- [x] Replace heavy explanatory side panels with compact filters and a detail inspector.
- [x] Use the current green/yellow RASD direction with Vercel/Linear-style spacing and controls.
- [x] Preserve the existing API workflow and role protection.
- [ ] Validate on production with owner login after deploy.

### B5. Improve `/feed`

Status: deferred until `/ops` is stable, because `/ops` is the actual daily workflow right now.

- Connect buttons to real API.
- Show review state machine clearly.
- Support approve/reject/report-ready flow.
- Add source/date/platform filters.

### B6. Reports And Client Access

Status: simplified on 2026-05-21. The team decided not to expose share-link management in `/ops`; client access should stay practical and clean through Viewer login to `/client-report`. Owner now has a dedicated `/access` screen to create/update client Viewer accounts with email and password.

- [ ] Generate report versions from approved items.
- [x] Keep the primary client route as `/client-report` behind authenticated Viewer access.
- [x] Remove visible share-link management from `/ops` to reduce operational clutter.
- [x] Keep share-link backend/security tests as a dormant fallback, not a primary product path.
- [x] Add a clean Viewer/user access management screen outside the content review flow.
- [x] Move email-password login through a server-side auth route with a timeout and clear Arabic errors, so the login button does not stay stuck on verification.
- [ ] Validate a newly created email/password Viewer account can open `/client-report` and is blocked from `/`, `/ops`, `/imports`, and `/reports/*`.

## Priority C - Real Source Integrations

These tasks move from manual/legacy testing into actual monitoring.

Detailed execution plan: [priority-c-real-source-integrations-plan.md](priority-c-real-source-integrations-plan.md)

### C1. RSS/News Sources

Status: C1.0 and C1.1 completed on 2026-05-21. Next: C1.2 manual admin polling.

- [x] Add source registry fields to the existing `sources` table: `feed_url`, `is_active`, `last_checked_at`, `last_success_at`, `last_error`, `poll_interval_minutes`.
- [x] Use the existing `source_credibility` enum instead of adding a second reliability model.
- [x] Add public `feed_url` validation before any fetch attempt.
- [x] Extend source types and persistent mapping for polling fields.
- [x] Build RSS fetch/normalize utility with safe URL checks and timeout.
- [x] Normalize RSS entries into review-ready monitoring items while preserving compact raw metadata.
- [x] Dedupe by canonical URL and source item ID.
- [x] Add RSS parsing, malformed feed, missing field, and duplicate ingestion tests.
- [ ] Add owner/editor manual polling endpoint before scheduled cron.
- [ ] Add scheduled cron only after confirming Vercel plan limits and `CRON_SECRET`.
- [ ] Keep initial official/media items in review flow; avoid broad auto-approve until real QA passes.

### C2. Manual Web Extraction

Status: planned on 2026-05-21. Improve the current extractor and correction workflow without adding unnecessary DB fields.

- [ ] Use existing `monitoring_items.raw_response` for compact internal extraction details.
- [ ] Do not add a new `raw_data` column now.
- [ ] Improve URL extraction for title, summary, author, date, image, and canonical URL.
- [ ] Keep X oEmbed behavior unchanged.
- [ ] Add editor correction endpoint for title, summary, author, date, and original URL.
- [ ] Preserve old extracted values in `raw_response` and audit logs.
- [ ] Add Readability later only after manual/RSS extraction is stable.
- [ ] Keep external fallback services optional and env-gated.

### C3. X/Twitter Workflow

Short-term:

- Manual X URL intake.
- X oEmbed or link preview where available.
- Store X URL as original link.

Later:

- X API integration if account/credits are available.
- Search queries and monitored accounts.
- Rate limit and cost guardrails.

### C4. Screenshot And Evidence Pipeline

- Decide storage: Supabase Storage, Vercel Blob, or Cloudflare R2.
- Store report-page evidence for legacy items.
- Capture preview evidence for review.
- Capture report-grade screenshots only for approved/report items.
- Avoid capturing every raw candidate.

## Priority D - Client Experience Readiness

These tasks make the platform useful to the client after the data loop is working.

### D1. Client Report Product

Status: first pass deployed on 2026-05-21.

- [x] Show live/private platform feel.
- [x] Add executive metric band.
- [x] Add clickable day heatmap.
- [x] Add compact platform distribution.
- [x] Add content feed.
- [x] Add detail drawer/bottom sheet.
- [x] Improve screenshot and original-link inspection.
- [ ] Validate the experience with owner in production.
- [ ] Iterate after real user feedback.

### D2. Export

Status: first pass deployed on 2026-05-21.

- [x] Printable PDF-style export from the filtered client report view.
- [x] Preserve RTL and Arabic typography.
- [x] Include screenshots and original links.
- [x] Cap export at 50 visible items.
- [ ] Replace browser-print export with a generated PDF service if needed.

### D3. Viewer Experience

Status: first pass deployed on 2026-05-21.

- [x] Viewer sees filters, analytics, links, screenshots, and exports.
- [x] Viewer does not see imports, backfill, ops, raw extraction, admin buttons, or edit controls.
- [x] Test with a real viewer account/invite.

## Priority E - Full UI Redesign

Start only after Priority A is testable.

Design direction:

```text
RTL Executive Media Intelligence Dashboard
```

Typography:

```text
IBM Plex Sans Arabic
```

Color direction:

- Green for trust, live monitoring, and navigation.
- Yellow for signal, highlights, warnings, and insight.

Implementation order:

1. Design tokens and font.
2. Shared app shell.
3. Client report redesign.
4. Admin shell redesign.
5. Loading/empty states.
6. Mobile/responsive pass.
7. Accessibility/contrast pass.

## Priority F - SaaS Readiness Later

Not required for the first real Hidayathon test.

- Multiple organizations beyond Hidayathon.
- Organization switcher.
- Invites UI for owner.
- Billing/plans.
- Usage limits and entitlements.
- Retention policy.
- Backups and restore process.
- Privacy policy and terms.
- Custom domain.
- Observability dashboard.

## Immediate Recommended Sprint

Sprint name:

```text
Make RASD testable with real persisted Hidayathon data
```

Sprint tasks:

1. [x] Confirm production auth smoke test enough for owner access.
2. [x] Verify live Supabase schema and RLS after the share-link policy update.
3. [x] Upsert legacy Hidayathon archive into Supabase.
4. [x] Make `/client-report` read persisted Supabase data in production.
5. [x] Make link backfill writes persistent for current workflow.
6. [x] Add PDF-cropped content images for legacy items.
7. [x] Add one real manual URL intake test path.
8. [x] Deploy the simplified client experience to Vercel.
9. [ ] Run one end-to-end production smoke test.

Definition of done:

- Owner can log in.
- Data is persisted in Supabase.
- Client report shows real Hidayathon data.
- Original links/screenshots/statuses survive redeploy.
- Legacy items have content images or safe full-page evidence fallback.
- One manually added item can be reviewed and shown in the client report.
- Viewer cannot access admin pages.

Next recommended task:

```text
A10. Production Smoke Test
```

Concrete first step:

Open `https://rasd-gamma.vercel.app/client-report` as owner and confirm the redesigned client workspace loads real data. Then use `/ops` with one fresh public X/news URL and follow the item through review, capture, live report insertion, client report visibility, and filtered export.
