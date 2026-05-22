# TikTok/Instagram Fix And Test Plan

Last updated: 2026-05-22

## 2026-05-22 Follow-up: Operator Controls And Health

Decision from product owner:

- Watchlist timing should be controllable from the UI.
- Anything useful for diagnosing TikTok/Instagram automation should appear in `/health`.
- The enum migration `20260522120000_add_tiktok_instagram_connector_enums.sql` was applied manually through Supabase SQL Editor.
- Source-rule errors should be explicit instead of the generic `رد غير متوقع من السيرفر`.

Implemented in the follow-up branch:

- Added `poll_interval_minutes` directly to `source_rules` so each TikTok/Instagram watchlist rule controls its own cadence.
- Added `/sources` schedule controls for watchlists: hourly, every 6 hours, daily, every 2 days, weekly.
- Added an admin-only `/api/source-rules/run-due` trigger so owners/editors can run due watchlists from the UI without exposing `CRON_SECRET`.
- Improved `/api/source-rules` error responses with JSON details for missing schema/migration states.
- Improved `/sources` API error display so HTTP status and server details are visible when a non-JSON response is returned.
- Added `/health` automation visibility for:
  - source-rule schema readiness
  - `CRON_SECRET`
  - mock mode
  - TikTok enablement and credentials
  - Instagram enablement and extractor readiness
  - source-rule counts
  - queued/failed jobs
  - latest connector run
  - latest failed job reason

Follow-up validation result:

| Check | Result |
| --- | --- |
| `npm run test` | Passed: 141/141 |
| `npm run typecheck` | Passed |
| `npm run lint` | Exit code 0, with the same 13 pre-existing warnings |
| `npm run build` | Passed |
| `npm run supabase:db:dry-run` | Passed; would push `20260522120000_add_tiktok_instagram_connector_enums.sql` and `20260522143000_add_source_rule_poll_interval.sql` |
| `npm audit --audit-level=moderate` | Failed: same residual Next/PostCSS moderate advisory; `npm audit fix --force` still suggests a breaking Next downgrade and was not applied |

New production migration required after this follow-up:

- `supabase/migrations/20260522143000_add_source_rule_poll_interval.sql`
- Apply it before using the new schedule selector in production.

Remaining operator setup:

- Confirm `CRON_SECRET` exists in Vercel Production.
- Confirm production Vercel has `TIKTOK_RESEARCH_ENABLED`, `TIKTOK_CLIENT_KEY`, and `TIKTOK_CLIENT_SECRET` only when TikTok Research API credentials are approved.
- Confirm production Vercel has `INSTAGRAM_WATCHLIST_ENABLED=true` only when the Instagram extractor runtime is available.
- Confirm `RASD_CONNECTOR_MOCKS` and `CONNECTOR_MOCK_MODE` are not enabled in production.
- Use `/health` after deploy to confirm all readiness checks.

Open tasks after deployment:

- Apply `20260522143000_add_source_rule_poll_interval.sql` in Supabase SQL Editor.
- Re-test `/sources` by creating one TikTok rule and one Instagram profile rule with chosen schedules.
- Click `تشغيل القواعد المستحقة الآن` once from `/sources` to verify jobs/runs are recorded.
- Open `/health` and confirm schema, CRON_SECRET, mock mode, connector credentials, active rules, latest run, and failed jobs.

## Current Status

The TikTok/Instagram manual and automated MVP paths are implemented locally:

- `/ops` now clearly advertises manual ingestion for X, TikTok, Instagram, and news/web pages.
- `POST /api/source-rules` persists real rules through the persistent store instead of returning a temporary object.
- `GET /api/source-rules`, `PATCH /api/source-rules/:id`, and `DELETE /api/source-rules/:id` are available for owner/editor source-rule management.
- `/sources` includes a simple `رصد TikTok/Instagram الآلي` watchlist UI for TikTok Research and Instagram public-profile rules.
- Vercel Cron now includes `/api/cron/run-connectors` for connector scheduling while keeping the existing `/api/cron/poll-sources` RSS cron.
- TikTok/Instagram connector mocks are blocked from production and require explicit non-production mock mode.
- Automated TikTok/Instagram items remain in `needs_review`.

Manual monitoring status:

- Ready for owner/editor use through `/ops`.
- The build output contains the visible Arabic `/ops` text: `ألصق رابط X أو TikTok أو Instagram أو خبر/صفحة ويب واحدة`.
- A real logged-in owner/editor browser smoke test with live public TikTok and Instagram URLs is still recommended before production rollout.

Automated monitoring status:

- Ready as a guarded MVP for configured watchlists.
- TikTok automation requires TikTok Research API enablement and credentials in production.
- Instagram automation is limited to configured public profile watchlists and depends on the runtime extractor path; it is not broad-platform monitoring.
- If credentials/runtime support are missing in production, the system must not insert fake items. It reports zero fetched items or a clear failed connector/job state, depending on the connector path.

Latest local implementation result on 2026-05-22:

| Check | Result |
| --- | --- |
| `npm run test` | Passed: 138/138 |
| `npm run typecheck` | Passed |
| `npm run lint` | Exit code 0, with 13 pre-existing warnings outside the TikTok/Instagram connector changes |
| `npm run build` | Passed |
| `npm run supabase:db:dry-run` | Passed; would push `20260522120000_add_tiktok_instagram_connector_enums.sql` |
| `npm audit --audit-level=moderate` | Failed: residual Next/PostCSS moderate advisory; `npm audit fix --force` currently suggests a breaking Next downgrade and was not applied |

Production deployment prerequisites:

- Apply `supabase/migrations/20260522120000_add_tiktok_instagram_connector_enums.sql` before creating TikTok/Instagram `source_rules` in production.
- Set `CRON_SECRET` so `/api/cron/run-connectors`, `/api/connectors/run-due`, and `/api/connectors/run-job` can reject unauthenticated calls.
- Apply `supabase/migrations/20260522143000_add_source_rule_poll_interval.sql` before using per-rule schedule controls in production.
- Set `TIKTOK_RESEARCH_ENABLED=true` only when TikTok Research API access is approved.
- Set `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` for production TikTok Research API calls.
- Set `INSTAGRAM_WATCHLIST_ENABLED=true` only when the Instagram public-profile extractor runtime is available and approved.
- Provide `yt-dlp` or an approved equivalent extractor in the production runtime for Instagram profile fetching; otherwise Instagram watchlist jobs should fail clearly or fetch zero items, not mock data.
- Keep `RASD_CONNECTOR_MOCKS` and `CONNECTOR_MOCK_MODE` unset or false in production.

Remaining work:

- Run a real owner/editor browser smoke test against the deployed environment.
- Apply the Supabase enum migration in production.
- Provision production connector credentials/runtime tools.
- Decide separately whether to remediate the residual Next/PostCSS audit advisory, because the automated forced fix is not safe.

## Priority Decision

The immediate priority is manual TikTok/Instagram URL ingestion through the existing `/ops` workflow.

Do not enable broad TikTok/Instagram watchlist automation in production. The supported automated scope is guarded watchlists only, and the manual `/ops` paths should still pass before enabling production schedules:

```text
/ops paste URL -> metadata hydration -> review approve -> capture -> add to report -> visible in /client-report
```

Watchlist, scheduler, jobs, and connector runs can stay behind guarded APIs until the manual workflow proves stable.

## Phase 1 - Blockers Before Testing

Status: completed on 2026-05-22.

Tasks:

- Fix the TypeScript mismatch in `InstagramPublicProfileConnector.fetch`.
  - Current call sites pass `fetch(rule, rule.cursor)`.
  - The connector currently accepts only `fetch(rule)`.
  - Choose one signature and make the interface, implementation, and call sites consistent.
- Re-run:
  - `npm run typecheck`
  - `npm run build`
- Do not use `npm run lint` success as the completion signal. Lint can exit successfully while warnings remain, and it does not prove the app builds.

Acceptance:

- `npm run typecheck` exits 0.
- `npm run build` exits 0.
- No TypeScript failure remains in `persistent-store.ts`, `store.ts`, or the Instagram connector.

## Phase 2 - Supabase Migration Fix

Status: completed on 2026-05-22 for the repository migration path.

Problem:

The current branch adds new enum values in `supabase/schema.sql` and the old initial migration. If the initial migration has already been applied in production, editing that file does not update the live database.

Tasks:

- Create a new Supabase migration file for the enum additions.
- Add these `source_type` values:
  - `tiktok_research`
  - `instagram_public_profile`
- Add these `usage_event_type` values:
  - `tiktok_read`
  - `instagram_read`
  - `media_hydration`
- Keep `supabase/schema.sql` aligned with the migration.
- Do not rely on changes to `20260520134546_initial_rasd_schema.sql` as the production upgrade path.

Acceptance:

- A new migration exists and is safe to apply to an already migrated Supabase project.
- `supabase/schema.sql` contains the final desired enum state.
- Production deployment notes mention that the new migration must be applied before creating TikTok/Instagram `source_rules`.

Implementation note:

- New migration: `supabase/migrations/20260522120000_add_tiktok_instagram_connector_enums.sql`.
- The Supabase CLI was not available in the local shell, so the migration file was created manually with idempotent `alter type ... add value if not exists` statements.

## Phase 3 - Production Safety

Status: completed on 2026-05-22 for connector safety and API failure reporting.

Problems found in review:

- TikTok and Instagram connectors can return mock items when credentials or runtime tools are missing.
- This is useful for local tests but unsafe for production ingestion.
- `runConnectorJob` can mark a job failed internally while the API still returns `ok: true`.

Tasks:

- Restrict mock TikTok/Instagram items to explicit local/test mode only.
- In production, if a connector is not configured, return a controlled `not_configured` result or zero fetched items.
- If a connector fetch fails in production, do not insert mock content.
- Update `/api/connectors/run-job` so the response reflects the final job result.
- Update `/api/connectors/run-due` so failed jobs appear in `failedJobs` with clear reasons.
- Keep all automatically ingested TikTok/Instagram items in `needs_review`.

Acceptance:

- No mock TikTok/Instagram item can be inserted into production review queues accidentally.
- Failed jobs are visible to API callers.
- Scheduler endpoints remain protected by `CRON_SECRET`.
- Viewer users cannot run connector jobs.

Implementation note:

- TikTok/Instagram connector mocks now require explicit non-production `RASD_CONNECTOR_MOCKS=true` or `CONNECTOR_MOCK_MODE=true`.
- `/api/connectors/run-job` returns `ok: false` and the failure reason when the worker marks a job failed.
- `/api/connectors/run-due` reports failed jobs under `failedJobs`.

## Phase 4 - Manual Smoke Test

Status: automated API smoke passed; real owner/editor UI smoke pending.

Run this after phases 1 through 3 are complete.

### TikTok Manual URL

- Open `/ops` as owner/editor.
- Paste one public TikTok post URL.
- Confirm the item is created or reopened as a duplicate.
- Confirm platform is shown as TikTok.
- Approve the item.
- Run report-grade capture.
- Add the item to the live Hidayathon report.
- Confirm it appears in `/client-report`.

### Instagram Manual URL

- Open `/ops` as owner/editor.
- Paste one public Instagram post URL.
- Confirm the item is created or reopened as a duplicate.
- Confirm platform is shown as Instagram.
- Approve the item.
- Run report-grade capture.
- Add the item to the live Hidayathon report.
- Confirm it appears in `/client-report`.

### Evidence And Access Checks

- Confirm stored evidence uses a Supabase Storage path containing the real organization/topic/item/capture identifiers.
- Confirm `/api/captures/:id/asset` stays member-only and does not expose raw private storage paths.
- Confirm a Viewer account can open `/client-report`.
- Confirm the same Viewer account cannot open `/ops`, `/sources`, `/imports`, `/reports/*`, or admin APIs.

Acceptance:

- One TikTok item and one Instagram item complete the full manual workflow.
- Both items survive refresh.
- If deployed, both items survive a Vercel redeploy.
- The smoke result is recorded as pass/fail in the planning notes or QA checklist.

Automated result on 2026-05-22:

- TikTok URL workflow passed through metadata hydration, review approval, report-grade capture, add-to-report, duplicate resubmission, `/api/reports/:id/items`, and `/api/client-report/hidayathon` visibility with platform `TikTok`.
- Instagram URL workflow passed through metadata hydration, review approval, report-grade capture, add-to-report, duplicate resubmission, `/api/reports/:id/items`, and `/api/client-report/hidayathon` visibility with platform `Instagram`.
- Local browser check confirmed unauthenticated access to `/ops` and `/client-report` redirects to the Arabic login page without console errors.
- Local browser check did not execute the authenticated `/ops` clicks because the browser session did not have owner/editor credentials.

## Phase 5 - Watchlist Readiness

Status: completed on 2026-05-22 as a guarded MVP.

Tasks:

- Create owner/editor UI or API workflow for `source_rules` management. Completed in `/sources` plus source-rule CRUD APIs.
- Validate TikTok/Instagram source rule creation against real Supabase enum values. Completed through API validation and schema tests.
- Run a low-frequency `run-due` test in a non-production or explicitly approved environment. Completed locally through API tests with explicit mock mode.
- Confirm `jobs`, `connector_runs`, cursors, retries, and failures are persisted in Supabase. Covered by persistent-store-backed API/workflow tests.
- Keep every auto-ingested item in review. Completed; tests assert `needs_review`.

Acceptance:

- Source rules can be created and disabled safely.
- Scheduler execution is idempotent.
- Failed connectors do not block other rules.
- Connector run history is visible enough for operational debugging.

Implementation note:

- `/sources` is already owner/editor-only, so Viewer users do not see the watchlist management UI.
- Source-rule subroutes are covered by the admin-only API auth rule.
- `/api/cron/run-connectors` uses the same `CRON_SECRET` bearer-token protection pattern as the existing cron routes.

## Required Final Quality Gate

The task can be called ready only when all of these pass:

- `npm run test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

Additional acceptance:

- No production path inserts mock TikTok/Instagram items.
- Supabase enum migration is represented by a new migration file.
- TikTok and Instagram manual smoke tests are documented.
- Watchlist automation remains disabled or explicitly guarded until manual testing succeeds.

## Notes For The Next Agent

- Do not edit the original Arabic TikTok/Instagram planning file as part of this fix unless asked.
- Do not revert unrelated working-tree changes.
- Treat the current modified code as in-progress work from another agent.
- Keep changes tightly scoped to blockers and safety before expanding connector features.
