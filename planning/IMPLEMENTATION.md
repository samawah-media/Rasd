# RASD Platform Implementation

This project implements the first usable slice of the SaaS media monitoring plan:

- Arabic RTL Next.js dashboard.
- Local legacy report import review and import page.
- Legacy source-link backfill queue for missing or broken original URLs.
- Interactive client report page for approved legacy Hidayathon data.
- Secure HTML report page as the source of truth.
- PDF-ready report layout.
- Hono API stateful prototype for manual intake, review, capture, report items, share links, and audit logs.
- Source adapter contracts.
- Evidence pipeline contracts.
- Cost guardrail utility.
- Supabase schema with RLS-first multi-tenancy.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Important Routes

- `/` operational dashboard, inbox, sources, budgets, and report versions.
- `/feed` dedicated live monitoring feed with filters, editorial state, evidence status, and selected-item actions.
- `/client-report` client-facing Hidayathon workspace with four executive metrics, clickable day heatmap, compact filters, visual content list, detail drawer/bottom sheet, original links, content crops, publisher crops, and filtered printable export.
- `/access` owner-only client access screen for creating/updating email-password Viewer accounts and keeping customer handoff separate from content review.
- `/imports` local review/import UI for `data/imports/hidayathon_reports.json`, with filters for report, platform, confidence, page, and text search.
- `/imports/backfill` local source-link backfill UI for legacy items whose PDFs do not include an openable original URL; includes X/Web search links and an override JSON template per item.
- `/api/client-report/hidayathon` serves the enriched client report dataset from Supabase when configured, combining approved legacy data with manual items that have been added to the live Hidayathon report.
- `/api/client-report/hidayathon/export-pdf` serves a client-safe printable Arabic export for the currently selected/filtered items, capped at 50 items.
- `/api/access/client-viewers` lists and creates/updates Viewer accounts through Supabase Admin. It is owner-only and assigns Viewer memberships for both the active Hidayathon organization and the legacy Hidayathon archive.
- `/api/imports/legacy/status` returns legacy import counts.
- `/api/imports/legacy/backfill` returns link-backfill counts, status, search URLs, and override templates for legacy items.
- `/api/imports/legacy` imports approved legacy data into the in-memory workflow store idempotently.
- `/api/imports/legacy/supabase-plan` returns the deterministic Supabase upsert plan for the approved legacy archive without writing rows.
- `/api/imports/legacy/upsert-supabase` writes the legacy archive to Supabase only when server credentials are configured, `RASD_ADMIN_IMPORT_TOKEN` matches the `x-rasd-admin-token` request header, and the request body includes `{"dry_run": false}`; otherwise it returns a safe dry-run plan.
- `/ops` interactive workflow console for manual intake, editorial review, report-grade capture, live-report insertion, and safe archiving. It intentionally does not expose share-link management.
- `/reports/report-5` HTML report page.
- `/api/admin/health` connector and system health.
- `/api/admin/persistence` runtime storage mode and Supabase schema reachability.
- `/api/items/manual-url` manual URL intake endpoint.
- `/api/reports/hidayathon-live` returns the current live Hidayathon report id so production UI does not depend on the local `report-5` seed id.
- `/api/items/:id/review` approve/reject review endpoint.
- `/api/items/:id/capture-report-grade` guarded report-grade capture endpoint.
- `/api/reports/:id/items` report insertion endpoint with readiness checks.
- `/api/reports/:id/share-link` creates a private share link for owner/editor management, noindexed/watermarked by default, with optional expiry and optional view limit.
- `/api/share-links/:token` validates expiry/revocation/view limits and records a view.
- `/api/share-links/:token/revoke` revokes an existing share link.
- `/share/[token]` is a dormant public read-only fallback for token links; the primary client handoff is authenticated Viewer access to `/client-report`.
- `/api/reports/report-5/export-pdf` queues a PDF export job placeholder.

## Legacy Report Import

The local reports in `D:\code - projects\RASD HAKSON` can be extracted into a reviewable JSON seed file:

```bash
python scripts/extract_reports.py --input-dir "D:\code - projects\RASD HAKSON" --output data/imports/hidayathon_reports.json
```

The extractor deduplicates identical PDFs by SHA-256, extracts report metadata, item pages, summary text, author, platform, capture date text, raw text, and confidence flags. The current import result is `data/imports/hidayathon_reports.json`.

Current extraction notes:

- E01 duplicate is detected and excluded from the unique item total.
- E01/E02/E03/E04 extract into 124 unique monitoring/report items.
- The dashboard PDF is mostly images and is better treated as a visual reference unless we add OCR.
- The extractor renders page-level evidence images for every legacy item into `public/imports/legacy-pages`.
- The PDFs contain interactive link annotations behind the link icon on content pages. The extractor now reads those annotations and recovers 124 original URLs, including 70 X post permalinks.
- `/imports/backfill` remains the manual enrichment/correction surface, but the legacy Hidayathon archive no longer has a bulk missing-link gap after annotation extraction.
- Extracted text should pass through a review screen before becoming final report data, especially for low-confidence pages and sentiment selection.
- `/imports` is that first review screen and now includes a local import action. Because the old reports are already approved, the import creates 4 published legacy report versions, 124 published monitoring items, report-grade legacy captures, and 124 report-item links in the in-memory workflow store.
- Re-running the legacy import is safe: deterministic IDs prevent duplicate reports, items, captures, and report-item links.
- `/client-report` is the first customer-facing surface over that legacy data. It keeps HTML as the source of truth, exposes day/range filtering for publication dates, and lets the client inspect each item without changing approval state.

## Acceptance Tests

The prototype now includes Node test coverage for the most important workflow rules:

- Hono API request/response acceptance for manual intake, review, capture, report insertion, client-report visibility, share links, and X not-configured isolation.
- manual URL dedupe by canonical URL, including a real `x.com/.../status/...` intake shape.
- approved items stay `approved_pending_capture` until report-grade capture succeeds.
- non-ready items cannot be inserted into a report.
- capture-failed items require explicit warning acceptance.
- screenshot work stops before crossing budget limits.
- share links enforce revocation and view limits, and enforce expiry when an expiry is explicitly configured. By default, new links have no automatic expiry.
- share-link token hashes are verified not to leak the usable token.
- Supabase schema checks verify RLS coverage, tenant ownership, BYOK encrypted/masked fields, share-link controls, the live share-link policy correction migration, and organization-scoped dedupe.
- utility checks cover URL canonicalization, keyword match explanations, and budget hard-stop behavior.
- client-report utility checks cover Arabic legacy date extraction, capture-date extraction, and the enriched Hidayathon report dataset.
- API checks verify `/api/client-report/hidayathon` serves the interactive report data.
- API checks verify `/api/client-report/hidayathon/export-pdf` returns a printable client-safe export and rejects exports above 50 items.
- backfill utility/API checks verify that the 124 interactive PDF annotation links are available and that missing legacy URLs are not fabricated.
- legacy Supabase import-plan checks verify deterministic upsert batches, 124 monitoring rows, 124 report-item rows, 124 capture rows, and 124 openable original URLs.
- production persistence checks verify the canonical legacy organization slug `legacy-hidayathon`, live row-count sanity SQL, protected admin persistence endpoint behavior, and owner-confirmed Supabase runtime mode.
- client-report checks verify that X rows do not present official site links such as `hedayathon.com` as original tweet permalinks; those are exposed separately as content links until true `x.com/.../status/...` links are backfilled.
- client-report export checks verify internal fields such as confidence, raw extraction text, backfill links, and extraction warnings are not included in the client export.

Run:

```bash
npm run test
```

## Supabase

The schema is in `supabase/schema.sql`. Apply it to a Supabase project after creating the project and reviewing the RLS policies.

The app expects:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in the browser.

The server initializes Supabase lazily through `src/server/supabase-admin.ts`, so `next build` does not require database credentials. The share-link service uses the in-memory store locally, and switches to the `share_links` table when server Supabase credentials are available. Share-link management remains owner/editor-only at the API/RLS level, but it is intentionally not exposed in the primary UI while Viewer login to `/client-report` is the client handoff.

Legacy persistence is mapped in `src/server/legacy-supabase-import.ts`. It creates deterministic UUIDs for the legacy organization, topic, template, report versions, monitoring items, captures, and report-item links, then upserts by `id` so re-running the import does not duplicate data. Original URLs now come from interactive PDF link annotations when present, with printed text URLs retained in `extracted_urls` for review context. Real writes are additionally protected by `RASD_ADMIN_IMPORT_TOKEN` because the prototype API is not yet behind full Supabase Auth.

Supabase changed Data API exposure behavior for newly created tables in 2026, so applying `supabase/schema.sql` should be followed by a deliberate review of Data API exposure and grants. RLS is already enabled on every public table in the schema, but API exposure and RLS are separate controls.

## Current Implementation Boundary

This is a production-shaped foundation, not the full external integration layer yet. X API, Browser Run, R2 uploads, and AI summaries are represented by interfaces, API contracts, and guarded job placeholders so they can be connected without changing the product shape.

## Supabase Activation Details

The repository now has Supabase CLI configuration from `npx supabase init`. The initial migration `supabase/migrations/20260520134546_initial_rasd_schema.sql` is intentionally identical to the reviewed `supabase/schema.sql`; `tests/schema.test.ts` verifies this so the migration cannot drift silently. The follow-up migration `supabase/migrations/20260521094823_allow_editor_share_links.sql` is an idempotent live-database correction for projects where the initial migration had already been applied with the older owner-only share-link policy.

For project `ewunxfttbpqisspqthiz`, `.env.local` contains only public/non-secret setup values. Real schema application and legacy writes need server-only values:

```bash
SUPABASE_SERVICE_ROLE_KEY=
RASD_ADMIN_IMPORT_TOKEN=
SUPABASE_DB_PASSWORD=
```

Operational scripts:

```powershell
npm run supabase:db:dry-run
npm run supabase:db:push
npm run supabase:legacy:dry-run
npm run supabase:legacy:upsert
```

`/api/admin/persistence` distinguishes partial activation from full persistence: public Supabase settings may be present while writes remain on local memory until `SUPABASE_SERVICE_ROLE_KEY` is configured and the schema is reachable.

Production confirmation on 2026-05-20:

- Owner-authenticated `/api/admin/persistence` returned `mode: "supabase"`, `ok: true`, `publicConfigured: true`, `serverConfigured: true`, and project ref `ewunxfttbpqisspqthiz`.
- Unauthenticated `/api/admin/persistence` returns `401 auth_required`.
- Live Supabase row-count sanity check after Vercel redeploy showed 124 legacy monitoring items, 124 captures, 124 report-item links, 4 legacy reports, 3 legacy link overrides, 2 default manual items, and 0 public tables without RLS.
- `share_links` was smoke-tested against Supabase by creating and revoking a test link for a legacy report; the usable token was not stored in `token_hash`.

Production schema/RLS confirmation on 2026-05-21:

- `npm run supabase:db:dry-run` detected one pending migration: `20260521094823_allow_editor_share_links.sql`.
- `npm run supabase:db:push` applied that migration to project `ewunxfttbpqisspqthiz`.
- Live `share_links` policy is now `owners and editors can manage share links`, with `owner` and `editor` allowed and `viewer` excluded.
- Live Priority A row-count sanity query showed 124 legacy monitoring items, 124 captures, 124 report-item links, 124 openable original links, 4 legacy reports, 3 legacy link overrides, 3 default manual items, and 0 public tables without RLS.
