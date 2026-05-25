<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## RASD QA Notes For Agents

The project now keeps the TestSprite findings as durable regression coverage inside the repository, not just as one-off external reports.

### Current Durable Test Additions

- `tests/navigation.test.ts` verifies that the admin sidebar exposes the legacy import workspace at `/imports` with the import icon.
- `tests/mock-data.test.ts` verifies seeded source IDs are UUID-compatible and monitoring items reference known sources, protecting Supabase seed compatibility.
- `tests/auth-config.test.ts` now covers:
  - `/imports` admin routing.
  - import API role mappings.
  - narrow public API exposure.
  - protected share-link mutation routes.
  - member-only client-report API access.
- `tests/api.test.ts` now covers RSS/cron stability:
  - active RSS polling continues when one feed fails.
  - failing RSS sources record `lastError`.
  - scheduled RSS polling is protected by `CRON_SECRET`.
  - cron polling caps batches at 10 even with larger requested limits.
  - fresh RSS sources are skipped under scheduled polling.
- `testsprite_tests/testsprite_backend_test_plan.json` records the backend-focused TestSprite plan for future external reruns. Generated TestSprite Python/temp artifacts should stay ignored.

### Why This Matters

These tests are intentionally regression-oriented. They protect against the failures surfaced during TestSprite work:

- backend/server unavailability or empty responses hiding product defects.
- accidental exposure of admin/member APIs.
- share-link revoke or management routes becoming public.
- `/imports` existing but becoming undiscoverable in navigation.
- one malformed RSS feed stopping the whole polling run.
- cron jobs reprocessing too much work or fresh sources.
- local seed data drifting away from Supabase-compatible IDs.

### Recommended Verification Commands

Use focused checks while editing the affected areas:

```powershell
npx tsx --test tests/auth-config.test.ts tests/navigation.test.ts tests/mock-data.test.ts
npx tsx --test tests/api.test.ts tests/rss-ingestion.test.ts
```

Before shipping broader changes, run:

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
```

Recent baseline after the QA additions:

- `npm run test`: 173 passing tests.
- `npm run typecheck`: passing.
- `npm run lint`: passing.
- `npm run build`: passing.

### Supabase And TestSprite Notes

- Supabase no-write checks passed through automated tests and migration dry-run. Direct `/api/admin/persistence` calls on a running app require an authenticated owner session and may return `401` without browser auth.
- Do not commit TestSprite API keys, `testsprite_tests/tmp/`, or generated `testsprite_tests/*.py` files.
- Do not rerun the same frontend TestSprite suite unless specifically requested; prefer backend/security, Supabase/RLS, and cron/RSS stability coverage for new rounds.
