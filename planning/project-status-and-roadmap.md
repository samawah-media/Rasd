# RASD Project Status And Roadmap

Last updated: 2026-05-22

This file is the current project map. It summarizes what is done, what is in progress, what is blocked by owner testing, and what should happen next without reading every planning file end to end.

## Current Position

RASD is no longer just a prototype. The core platform is deployed, connected to Supabase, protected by roles, and showing real Hidayathon archive data.

Current phase:

```text
Stabilization + real-source readiness
```

Main active threads:

- Owner/editor production smoke for `/ops`, `/sources`, `/client-report`, `/access`, and `/settings`.
- C3 X/Twitter workflow foundation is currently being continued by another agent.
- C4 screenshot/evidence storage foundation is deployed, but needs authenticated live capture smoke.
- UI is good enough for testing; broad redesign should wait until the real monitoring loop is proven.

## Completed Foundation

### Deployment And Runtime

- Production URL is active: `https://rasd-gamma.vercel.app`.
- GitHub `main` deploys to Vercel production.
- Supabase project is connected: `ewunxfttbpqisspqthiz`.
- Production persistence is Supabase-backed, not memory-only.
- Vercel redeploys do not erase legacy reports, report items, links, or captures.

### Auth And Roles

- Owner login works with `samawah.pod@gmail.com`.
- Viewer account flow exists through `/access`.
- Viewer is routed to `/client-report`.
- Owner/editor can access admin pages.
- Unauthenticated users are redirected to login for protected pages.
- Share-link backend/RLS is tested, but visible share links are intentionally not part of the daily product flow.

Still owner-side:

- Rotate Google OAuth secret because an old secret was pasted in chat.
- Reconfirm a freshly created Viewer account can open only `/client-report` and cannot open admin pages.

### Supabase Schema And Data

- Schema/RLS verification passed.
- `share_links` policy allows owner/editor management and blocks viewer.
- Legacy Hidayathon archive is in Supabase.
- Current legacy baseline:
  - 124 legacy monitoring items.
  - 124 legacy captures.
  - 124 report-item links.
  - 124 openable original links from PDF annotations.
  - 4 legacy reports.
  - 3 legacy link overrides.

### Client Report

- `/client-report` reads real persisted Hidayathon data.
- Client report is Arabic, visual, filterable, and role-protected.
- Viewer does not see admin tools, raw extraction, confidence, warnings, backfill links, or technical internals.
- Filtered printable export exists and is capped at 50 visible items.
- Public share-link flow is dormant; client handoff is authenticated Viewer login.

### Legacy Images And Evidence

- 124 content crops exist for legacy items.
- 124 publisher/profile crops exist for legacy items.
- Full PDF page evidence is preserved as fallback.
- Legacy crop paths are mapped into Supabase/client-report.
- Live/manual capture assets can be persisted to private Supabase Storage when available.
- Stored capture assets are served through `/api/captures/:id/asset`.
- Signed-out access to stored capture assets returns `401 auth_required`.

## Priority A Status

Priority A is essentially complete enough for real testing.

Remaining A-level work:

- Owner-authenticated production smoke after recent `/ops` duplicate fix.
- Verify one fresh real URL can go:
  `paste link -> review -> capture -> add to report -> visible in /client-report`.
- Verify the same path survives refresh and redeploy.
- Confirm Supabase Storage capture path with a real logged-in capture:
  `/api/items/:id/captures` should show either protected storage proxy or safe fallback image URL.

## Priority B Status

Priority B is about making the platform efficient for daily use.

### B1 Admin Operations Dashboard

Status: first premium pass deployed, but needs owner UX review.

Remaining:

- Confirm the dashboard is useful rather than crowded.
- Keep only operational indicators that support decisions.
- Improve health/status cards after real source usage produces actual data.

### B2 Legacy Import Tools

Status: deferred.

Reason:

- Legacy import is not a daily task anymore.
- Current archive is already imported and usable.

Remaining later:

- Faster table/detail review.
- Bulk approve/import states.
- Better low-confidence extraction review if new PDF batches arrive.

### B3 Legacy Link Backfill

Status: deferred.

Reason:

- Current 124 links are openable from PDF annotations.

Remaining later:

- Keep page available for future corrections.
- Store future corrections in Supabase with status and notes.

### B4 `/ops`

Status: implemented and deployed as daily operations workbench.

Done:

- Paste URL.
- Duplicate feedback.
- Reopen archived duplicates when submitted again.
- Pin selected old duplicate so it does not disappear from the 48-item workbench window.
- Review/capture/add to report.
- Cleanup visible workflow items.
- Sources/keywords moved out to `/sources`.

Remaining:

- Owner production validation after latest duplicate fix.
- Reduce remaining friction based on real use.

### B4.1 `/sources`

Status: implemented and deployed.

Done:

- RSS source creation.
- Active/inactive.
- Manual source polling.
- Batch active polling.
- Per-source schedule.
- Keyword rule editing.
- Links to legacy import/backfill as advanced tools.

Remaining:

- Owner production validation:
  add or use one real RSS feed, run it, tune keywords, confirm items appear in `/ops`.

### B5 `/feed`

Status: deferred.

Decision:

- `/ops` is the real workflow surface for now.
- Do not spend time improving `/feed` until `/ops` and `/sources` are stable.

### B6 Reports And Client Access

Status: mostly done.

Done:

- Viewer login to `/client-report`.
- `/access` for creating/updating Viewer email/password accounts.
- Share-link UI removed from daily workflow.

Remaining:

- Generate report versions from approved live items.
- Validate a newly created Viewer account end to end.
- Polish PDF export later.

## Priority C Status

Priority C is real source integrations.

### C1 RSS/News Sources

Status: mostly complete.

Done:

- Source registry fields.
- RSS parser.
- Safe public feed URL validation.
- Manual poll endpoint.
- Batch poll endpoint.
- Cron endpoint protected by `CRON_SECRET`.
- Daily Vercel cron.
- Per-source schedule controls.
- Keyword filtering so generic feeds do not flood review.
- `/sources` UI for sources and keywords.

Remaining:

- Keep initial official/media items in review, not auto-approve.
- Production owner smoke of `/sources`.
- Optional: improve source health summaries after real usage.

### C2 Manual Web Extraction

Status: mostly complete.

Done:

- Public URL metadata extraction.
- X oEmbed baseline.
- Canonical URL/image/date extraction.
- Publisher fallback.
- Readability fallback for weak pages.
- Editor correction endpoint and inline edit controls.
- Compact internal extraction metadata only, not full HTML.

Remaining:

- External fallback services only if real sites prove they need it.
- Any fallback must be env-gated and budget-aware.

### C3 X/Twitter Workflow

Status: in progress by another agent.

Current ownership:

- The other agent should work on:
  - `src/lib/x/**`
  - `tests/x-workflow.test.ts`
  - `planning/implementation_plan_c3*.md`
  - any X provider/parser/manager foundation files.

Do not overlap while C3 is active:

- Do not modify X provider internals from another thread.
- Do not redesign `/ops` around C3 until the C3 foundation is merged and reviewed.
- Do not add paid X API behavior before provider selection and guardrails are reviewed.

Expected C3 deliverables:

- Normalize more X URL variants.
- Provider abstraction for oEmbed/mock/future Apify/official API.
- Cost-safe fallback.
- Tests for URL parsing, provider choice, and fallback behavior.
- No hard dependency on paid X credentials for basic workflow.

### C4 Screenshot And Evidence Pipeline

Status: storage foundation deployed; real capture worker still pending.

Done:

- Supabase Storage chosen for first evidence storage target.
- Private storage helper.
- Authenticated proxy route for stored captures.
- Fallback if storage upload/source fetch fails.
- Legacy PDF crops remain stable.

Remaining:

- Owner/editor live capture smoke in production.
- Live screenshot sample for 10 links before broad automation.
- Real browser capture worker/service.
- Preview capture for review, if useful.
- Future legacy imports should move report-page evidence to Storage instead of repository assets.

## Priority D Status

Priority D is client experience readiness.

### D1 Client Report Product

Status: first premium pass deployed.

Done:

- Metrics.
- Heatmap.
- Filters.
- Visual list.
- Detail drawer/bottom sheet.
- Original links and screenshots.

Remaining:

- Owner UX review in production.
- Client-style feedback pass after real testing.
- Mobile/responsive pass with authenticated screens.

### D2 Export

Status: first pass.

Done:

- Printable filtered export.
- RTL Arabic output.
- 50-item guardrail.

Remaining:

- Real generated PDF service only if browser print is not enough.
- Improve layout/branding of exported report later.

### D3 Viewer Experience

Status: first pass.

Done:

- Viewer sees client report only.
- Viewer does not see admin tools.

Remaining:

- Validate with a newly created Viewer email/password account.

## Priority E Status

Priority E is full UI redesign.

Status: partially done, but should not become the main focus yet.

Done:

- IBM Plex Sans Arabic direction.
- Premium shell pass.
- Client report refresh.
- `/ops` and `/sources` split.

Remaining:

- Owner authenticated UX pass.
- Responsive/mobile pass.
- Accessibility/contrast pass.
- Do not start a large visual rebuild until production data loop is proven again.

Note:

`planning/ui-redesign-plan.md` contains older ambitious concepts. Treat it as visual inspiration, not as the immediate execution plan. Some parts are intentionally deferred because they would add visual complexity before the platform loop is stable.

## Priority F Status

Priority F is SaaS readiness later.

Not needed for the first Hidayathon test:

- Multiple organizations UI.
- Organization switcher.
- Billing/plans.
- Formal invites.
- Retention policy.
- Backup/restore process.
- Privacy policy/terms.
- Custom domain.
- Observability dashboard.

## Immediate Next Sequence

Do these in order unless C3 requires review:

1. Wait for the C3 agent to finish and report changed files, tests, and known risks.
2. Review C3 without merging unrelated UI/storage changes into it.
3. Run full local checks after C3:
   - `npm run test`
   - `npm run typecheck`
   - `npm run lint`
   - `npm run build`
4. Owner production smoke:
   - `/ops`
   - `/sources`
   - `/client-report`
   - `/access`
   - `/settings`
5. Test one URL through the full workflow:
   - paste URL
   - confirm item visible
   - approve
   - capture
   - add to report
   - confirm in `/client-report`
6. Test RSS source flow:
   - run one source
   - confirm unrelated items are skipped
   - confirm relevant items enter `/ops`
7. Test Viewer account:
   - can open `/client-report`
   - cannot open `/ops`, `/sources`, `/imports`, `/reports/*`, or admin APIs.
8. After smoke passes, choose the next sprint:
   - C4 real browser capture sample, or
   - PDF export polish, or
   - focused UI cleanup from real feedback.

## Current Blockers And Risks

- C3 is in progress in parallel, so avoid editing X provider files until it lands.
- Google OAuth secret rotation is still an owner-side security task.
- Production owner smoke is still the most important proof after recent changes.
- X metadata can fail because oEmbed/public X access is not guaranteed.
- RSS feeds can be noisy; keyword rules must stay editable by admin.
- Export is currently browser-print style, not a dedicated PDF generation service.
- `npm audit --audit-level=moderate` has a known Next/PostCSS advisory; do not force downgrade.

## Best Parallel Work Split

While C3 continues:

- Other agent: C3 X parser/provider/manager/tests only.
- This thread: planning, QA, production smoke, `/client-report` review, C4 smoke, documentation.

Avoid parallel edits to:

- `src/lib/x/**`
- `tests/x-workflow.test.ts`
- `planning/implementation_plan_c3*.md`
- any shared ingestion code unless both agents agree first.

