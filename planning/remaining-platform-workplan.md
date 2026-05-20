# RASD Remaining Platform Workplan

Last updated: 2026-05-20

This file lists the remaining work needed to make the platform operate efficiently and become testable with real Hidayathon monitoring data.

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

Status update - 2026-05-20:

- Production Vercel has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `RASD_ADMIN_IMPORT_TOKEN` configured for Production.
- `/api/admin/persistence` and `/api/client-report/hidayathon` return `401 auth_required` when called without a logged-in owner/member session, so the operational health endpoints are not public.
- Live Supabase schema is reachable and current migrations are up to date.
- Live persisted Hidayathon data is present: 124 legacy monitoring items, 124 legacy captures, 124 report-item links, 4 legacy reports, 3 legacy link overrides, and 2 default manual items.
- `share_links` write path was smoke-tested against Supabase by creating and immediately revoking a test link for a legacy report; only a SHA-256 token hash was stored.
- Fixed the production verification script and legacy import/backfill organization upserts to use the canonical slug `legacy-hidayathon`.
- Remaining owner-side confirmation: open `/api/admin/persistence` while logged in as owner and confirm the JSON shows `mode: "supabase"` and `ok: true`.

Tasks:

- [ ] Open `/api/admin/persistence` in production as owner.
- [x] Confirm Supabase schema is reachable.
- [x] Confirm server has `SUPABASE_SERVICE_ROLE_KEY`.
- [x] Confirm `share_links` and legacy persistence paths can use Supabase.
- [x] Confirm data survives a Vercel redeploy/server restart.

Acceptance:

- Runtime reports Supabase as available for writes.
- No critical workflow depends only on process memory.

### A3. Apply/Verify Supabase Schema

Goal:

Ensure the live Supabase DB has the complete schema and RLS.

Tasks:

- Verify all tables from `supabase/schema.sql` exist in project `ewunxfttbpqisspqthiz`.
- Verify RLS is enabled on exposed public tables.
- Verify organization, membership, report, item, capture, share-link, and audit tables exist.
- Verify Data API exposure/grants are deliberate.
- Verify service-role server operations can write safely.

Acceptance:

- Schema exists.
- RLS is enabled.
- App APIs can read/write the expected tables.

### A4. Move Legacy Hidayathon Data Fully Into Supabase

Goal:

Use real historical data as the first test corpus.

Tasks:

- Run legacy Supabase dry-run plan.
- Review counts: 124 monitoring items, 124 captures, 124 report-item links.
- Run real legacy upsert.
- Confirm rerun is idempotent and does not duplicate rows.
- Confirm 100 missing original URLs and 3 malformed URLs remain marked correctly.
- Confirm 21 openable extracted links are stored as openable.

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

Tasks:

- [x] Ensure `/api/client-report/hidayathon` reads from Supabase in production.
- [x] Keep local/mock fallback only for development or explicit fallback.
- [x] Show original links, evidence image paths, source, date, platform, text, and status.
- [x] Keep filters working by date range, platform, source, report, confidence, and link/screenshot status.
- [x] Hide raw extraction/admin details from viewer.

Acceptance:

- Client report shows real imported/persisted data.
- Filters operate on production data.
- Viewer sees only client-safe fields.

### A6. Link Backfill Persistence

Goal:

Make link fixes permanent and visible in client report.

Tasks:

- Keep `/imports/backfill` as the admin workflow for missing/malformed links.
- Ensure overrides are stored in Supabase, not only JSON.
- Allow admin/editor to update original URL status.
- Track `missing`, `malformed`, `verified`, `manual_override`, and `legacy_evidence_only`.
- Show updated links in `/client-report`.

Acceptance:

- When a link is corrected, it remains corrected after redeploy.
- Client report reflects corrected original links.

### A7. Minimum Real Monitoring Input

Goal:

Start testing current monitoring, even before full automation.

Tasks:

- Support manual URL intake for X/news URLs in production.
- Store source, platform, URL, title/text, author, published date, captured date, and review status.
- Dedupe by canonical URL and organization.
- Allow owner/editor to approve/reject items.
- Allow approved items to appear in the client report.

Acceptance:

- We can add a real URL today and see it flow into review/report.
- Dedupe prevents repeated test submissions.

### A8. Review Workflow Persistence

Goal:

Make editorial decisions durable.

Tasks:

- Persist approve/reject status.
- Persist report insertion status.
- Persist capture warnings.
- Persist editor notes.
- Write audit logs for manual URL, review, link update, capture, report insert, share link creation/revoke.

Acceptance:

- Refresh/redeploy does not erase review state.
- Admin can understand who changed what and when.

### A9. Production Smoke Test

Goal:

Have one repeatable checklist that proves the platform can be tested seriously.

Tasks:

- Owner login.
- Create/import item.
- Review item.
- Add/fix original link.
- Confirm client report shows item.
- Confirm viewer cannot access admin routes.
- Confirm share link works, expires, and can be revoked.
- Confirm Vercel redeploy does not lose data.

Acceptance:

- One Hidayathon item can travel through the full platform loop.

## Priority B - Needed For Efficient Operations

These tasks make the platform usable by the team day to day.

### B1. Admin Operations Dashboard

- Show data mode: Supabase vs memory.
- Show last import time.
- Show counts for monitored, approved, missing-link, malformed-link, and report-ready items.
- Show connector health.
- Show latest errors and failed jobs.

### B2. Improve `/imports`

- Make review faster with table + detail drawer.
- Bulk approve legacy batches.
- Highlight low-confidence extraction.
- Preserve report/page/source context.
- Add clear "imported to DB" state.

### B3. Improve `/imports/backfill`

- Filter missing vs malformed vs fixed.
- Show evidence page preview beside candidate search links.
- Allow quick save of corrected URL.
- Add verification status and notes.

### B4. Improve `/feed`

- Connect buttons to real API.
- Show review state machine clearly.
- Support approve/reject/report-ready flow.
- Add source/date/platform filters.

### B5. Reports And Share Links

- Generate report versions from approved items.
- Create share links only for owner/editor.
- Enforce expiry, revoke, and view limit.
- Record views in audit log.

## Priority C - Real Source Integrations

These tasks move from manual/legacy testing into actual monitoring.

### C1. RSS/News Sources

- Add source registry for news/RSS.
- Poll configured sources.
- Normalize articles into monitoring items.
- Dedupe by canonical URL.
- Mark source reliability.

### C2. Manual Web Extraction

- Given a URL, extract title, text, author, date, image, and canonical URL.
- Store raw extraction separately from client-safe fields.
- Allow editor correction.

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

- Show live/private platform feel.
- Add executive metric band.
- Add activity timeline.
- Add source distribution.
- Add content feed.
- Add detail drawer.
- Improve screenshot and original-link inspection.

### D2. Export

- PDF export from the client report layout.
- Preserve RTL and Arabic typography.
- Include screenshots and original links.
- Add warning when a screenshot/link is missing.

### D3. Viewer Experience

- Viewer sees filters, analytics, links, screenshots, and exports.
- Viewer does not see imports, backfill, ops, raw extraction, admin buttons, or edit controls.

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

1. Confirm production auth smoke test.
2. Verify live Supabase schema and RLS.
3. Upsert legacy Hidayathon archive into Supabase.
4. Make `/client-report` read persisted Supabase data in production.
5. Make link backfill writes persistent.
6. Add one real manual URL intake test path.
7. Run one end-to-end smoke test.

Definition of done:

- Owner can log in.
- Data is persisted in Supabase.
- Client report shows real Hidayathon data.
- Original links/screenshots/statuses survive redeploy.
- One manually added item can be reviewed and shown in the client report.
- Viewer cannot access admin pages.
