# Priority C Real Source Integrations Plan

Last updated: 2026-05-21

## Goal

Move RASD from manual and legacy-only testing into real monitored sources without making the product noisy or expensive. The first production-ready loop should:

- Accept real RSS/news sources.
- Extract useful article metadata from public URLs.
- Deduplicate safely.
- Send items through the existing review, capture, report, and client-report workflow.
- Keep client-facing data clean while preserving internal raw extraction evidence.

## Architecture Decisions

### 1. Source Storage

Use the existing Supabase `sources` table as the source registry.

Do not hardcode production sources in code. Editors should be able to add, disable, and update sources without redeploying the app.

Needed schema additions:

- `feed_url text`
- `is_active boolean not null default true`
- `last_checked_at timestamptz`
- `last_success_at timestamptz`
- `last_error text`
- `poll_interval_minutes integer not null default 1440`

Use the existing `source_credibility` enum:

- `official`
- `media`
- `influencer`
- `public`

Do not add a separate `reliability` field now. It would duplicate `credibility` and make filtering/review rules harder to explain.

### 2. Polling Strategy

Start with a manual admin-triggered polling endpoint, then add scheduled polling.

Vercel Cron is useful, but plan limits matter:

- Hobby cron can run at most once per day.
- Pro can run minute-level schedules.

Implementation decision:

- Phase 1: owner/editor manual run button.
- Phase 2: daily cron if the project remains on Hobby.
- Phase 3: 15-30 minute cron only after confirming Vercel Pro or another scheduler.

All cron/manual polling must be protected:

- Admin UI calls use normal owner/editor auth.
- Cron calls use `CRON_SECRET`.
- Each run should have budget and item limits.

### 3. Review Automation

Do not auto-publish or auto-add to client reports at first.

Suggested initial state mapping:

- `official`: `needs_review`, with a visual trusted-source badge.
- `media`: `needs_review`.
- `influencer`: `candidate`.
- `public`: `candidate`.

Later, specific allowlisted official sources may move to `approved_pending_capture` after real QA.

### 4. Raw Extraction Storage

Use the existing `monitoring_items.raw_response jsonb`.

Do not add `raw_data` now.

Store compact internal data:

- extractor name and version
- canonical URL
- feed entry identifiers
- parsed metadata
- image candidates
- warnings/errors
- selected raw snippets

Avoid storing full HTML by default. Full HTML can be large, noisy, and expensive to query. If full evidence is needed later, store it in object storage and reference the asset path.

### 5. Article Extraction

Use a layered extractor:

1. Existing metadata extractor in `src/server/url-metadata.ts`.
2. Add RSS item fields as the first trusted source for title/link/date/summary.
3. Add local article extraction with Readability later.
4. Use external fallback services only when needed and only behind feature flags/env vars.

Do not make Microlink or any paid external extraction dependency required for the first version.

### 6. Editor Correction

Editor correction belongs inside the operational review flow, not the client report.

Editable fields:

- title
- summary/text
- author name
- author handle
- published date
- original URL/canonical URL
- source

Corrections must update client-safe fields while preserving the previous extracted values in `raw_response` and audit logs.

## Phases And Tasks

## Phase C1.0 - Source Registry Foundation

Outcome: admins can store real RSS/news source configuration in Supabase.

Tasks:

- [x] Add Supabase migration for source polling fields.
- [x] Update schema tests for new source fields.
- [x] Extend source types and persistent store mapping.
- [x] Add source validation for public `feed_url`.
- [x] Keep RLS owner/editor write access and viewer read restrictions unchanged.
- [x] Document how to seed first Hidayathon sources.

Acceptance checks:

- `sources` can store an active RSS feed URL.
- Invalid/private feed URLs are rejected before fetching.
- Existing manual/X flows still work.

Seed example for first Hidayathon RSS source:

```json
{
  "name": "Official Hidayathon Feed",
  "type": "rss",
  "url": "https://example.com/news",
  "feed_url": "https://example.com/rss.xml",
  "credibility": "official",
  "poll_interval_minutes": 1440
}
```

Notes:

- `feed_url` must be a public `http` or `https` URL.
- Private/local URLs like `localhost`, `127.0.0.1`, and private IP ranges are rejected before any fetch attempt.
- Polling fields are stored now; actual RSS fetching starts in Phase C1.1.

## Phase C1.1 - RSS Fetch And Normalize

Outcome: the server can fetch one configured RSS feed and normalize entries into monitoring items.

Tasks:

- [x] Add RSS parser utility with timeout and safe URL checks.
- [x] Normalize RSS fields into existing `MonitoringItem` shape.
- [x] Store RSS source metadata in `raw_response`.
- [x] Dedupe by canonical URL and source item ID.
- [x] Skip RSS entries that do not match the active Hidayathon keyword rule so generic news feeds do not flood review.
- [x] Add tests for RSS item parsing, date extraction, duplicate handling, and malformed feeds.

Acceptance checks:

- [x] A test RSS feed creates items once.
- [x] Re-running the same feed does not duplicate items.
- [x] Missing title/date/image does not crash ingestion.
- [x] Generic RSS entries unrelated to Hidayathon are counted as skipped and are not inserted.

Implementation notes:

- RSS parsing uses `rss-parser` behind `src/server/rss-ingestion.ts`.
- `store.ingestRssSource` and `persistentStore.ingestRssSource` can ingest one configured RSS source.
- RSS ingestion counts fetched entries separately from created, duplicate, skipped, and failed entries.
- Created RSS items enter the review workflow, not the live client report automatically.
- Manual UI/API triggering remains in Phase C1.2.

## Phase C1.2 - Manual Admin Polling

Outcome: owner/editor can trigger a controlled source poll from the app.

Tasks:

- [x] Add `POST /api/sources/:id/poll`.
- [x] Add `POST /api/sources/poll-active` with small batch limits.
- [x] Return counts: fetched, created, duplicates, failed.
- [x] Add audit logs for polling runs.
- [x] Add an admin UI action in `/ops` or a dedicated sources section.
- [x] Add a minimal `/ops` form for owner/editor to create the first active RSS source without opening Supabase.

Acceptance checks:

- [x] Viewer cannot call polling endpoints.
- [x] Owner/editor can poll one source and see results.
- [x] Poll failures show clear Arabic messages.
- [x] Adding the same RSS feed again returns the existing source instead of creating duplicate source rows.

Implementation notes:

- `/api/sources/:id/poll` runs one RSS source and returns created/duplicate/failed counts plus created review items.
- `/api/sources/poll-active` runs active RSS sources with a capped batch limit.
- `/ops` now lets owner/editor add an RSS source, shows active RSS sources, and can trigger either one source or the active batch.
- RSS-created items appear in the same review/capture/report workflow as manual URL items.
- Cron remains intentionally unimplemented until Phase C1.3.

## Phase C1.3 - Scheduled Polling

Outcome: source polling can run without a human click.

Tasks:

- [ ] Add `/api/cron/rss`.
- [ ] Protect with `CRON_SECRET`.
- [ ] Add `vercel.json` only after confirming desired schedule and plan limits.
- [ ] Start daily if on Hobby.
- [ ] Move to 15-30 minutes only if Vercel Pro or another scheduler is confirmed.

Acceptance checks:

- Missing/wrong `CRON_SECRET` returns unauthorized.
- Cron run respects batch and budget limits.
- Logs show a useful summary per run.

## Phase C2.0 - Extraction Model Cleanup

Outcome: manual URL extraction has clear internal vs client-safe fields.

Tasks:

- [ ] Define a compact `ExtractionResult` type.
- [ ] Keep client-safe fields on `monitoring_items`.
- [ ] Keep internal extraction details in `raw_response`.
- [ ] Add tests that raw fields do not appear in `/client-report` or PDF export.

Acceptance checks:

- Client report stays clean.
- Admin review can inspect extraction warnings.

## Phase C2.1 - Article Metadata Improvements

Outcome: public article URLs extract better title, summary, author, date, image, and canonical URL.

Tasks:

- [ ] Improve `src/server/url-metadata.ts` with canonical URL and image extraction.
- [ ] Add common Arabic/news meta tags.
- [ ] Add publisher/source fallback from URL hostname.
- [ ] Add tests for Saudi/news article samples.
- [ ] Keep X oEmbed behavior unchanged.

Acceptance checks:

- Website URLs produce useful title/summary/date when metadata exists.
- X URLs continue to produce tweet metadata.
- Private/internal URLs remain blocked.

## Phase C2.2 - Editor Correction

Outcome: editor can fix extracted article fields before approval.

Tasks:

- [ ] Add `PATCH /api/items/:id` for owner/editor field corrections.
- [ ] Allow corrections for title, summary, author, date, and original URL.
- [ ] Validate URLs and dates.
- [ ] Preserve previous/extracted values in `raw_response`.
- [ ] Add audit log entries for corrections.
- [ ] Add inline edit controls to the review detail UI.

Acceptance checks:

- Corrected fields appear in `/ops` and `/client-report` after approval/report insertion.
- Viewer cannot edit.
- Invalid URL/date corrections are rejected.

## Phase C2.3 - Readability Extraction

Outcome: article extraction improves beyond metadata for sites that provide weak meta tags.

Tasks:

- [ ] Add `@mozilla/readability` and `jsdom` only if bundle/build impact is acceptable.
- [ ] Extract readable article title/text/siteName/byline.
- [ ] Use Readability after metadata fetch, not before RSS item fields.
- [ ] Add timeout and size limits.
- [ ] Store only selected snippets in `raw_response`.

Acceptance checks:

- Long pages do not block the function.
- Extraction improves weak metadata cases.
- Build size and function runtime remain acceptable.

## Phase C2.4 - Optional External Fallback

Outcome: blocked sites can use a fallback service only when explicitly configured.

Tasks:

- [ ] Add env-gated fallback service setting.
- [ ] Add budget/cost guardrail.
- [ ] Add provider-specific error mapping.
- [ ] Keep the platform fully functional when no fallback key exists.

Acceptance checks:

- Missing fallback key does not break ingestion.
- Fallback usage is visible in health/status metrics.

## Recommended Start

Start with Phase C1.0, then C1.1, then C1.2.

Do not begin cron scheduling, Readability, or external fallback until manual polling proves that the ingestion loop works end to end.

First real test path:

1. Add one official/media RSS source.
2. Run manual poll.
3. Confirm items appear in `/ops`.
4. Approve one item.
5. Capture report-grade evidence.
6. Add to live report.
7. Confirm the item appears in `/client-report`.
