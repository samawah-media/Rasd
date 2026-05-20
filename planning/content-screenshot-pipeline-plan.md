# Content Screenshot Pipeline Plan

Last updated: 2026-05-21

This plan turns the existing link-correct Hidayathon archive into a visual client experience where each item can show the best available content image.

## Goal

For every report item, show a useful visual proof image in the platform:

- Prefer a clean content screenshot cropped from the original PDF when available.
- Keep the publisher profile identity visible through a separate crop from the PDF header. In the legacy PDFs, the Arabic label `الكاتب` means the source/profile username that published the content.
- Use a live URL screenshot only after a small, cost-controlled trial proves it is reliable.
- Keep the historical full-page report image as the fallback.
- Persist final image references in Supabase so they survive redeploys.

## Current State

- The legacy archive has 124 monitoring items.
- All 124 items now have openable original links from PDF link annotations.
- All 124 items are classified as positive after reading the visual checkmark in the `تصنيف المحتوى` row of the rendered PDF page.
- The platform already stores 124 `captures` rows.
- Production crop extraction now generated 124 content images and 124 publisher profile images under `public/imports/legacy-content-crops/full`.
- Supabase `captures.asset_url` and `monitoring_items.evidence_image_path` now point to the cropped content images for the legacy archive.
- The original full report-page evidence image remains in import metadata as `sourceEvidenceImagePath` and as each crop manifest fallback.
- The API endpoint `/api/items/:id/capture-report-grade` records capture workflow state, but the current implementation stores a placeholder asset (`/window.svg`) rather than a real browser screenshot.

## Evidence Types

Use clear names so the app does not confuse different kinds of images:

- `legacy_page_evidence`: full page rendered from the original PDF.
- `legacy_content_crop`: cropped image of the tweet/article/content inside the PDF page.
- `legacy_publisher_profile_crop`: cropped publisher username/profile identity area from the PDF page header.
- `live_preview_capture`: trial screenshot from the current URL, not yet trusted for reports.
- `live_report_capture`: production-grade screenshot from the current URL.

## Recommended Strategy

Start with PDF-based extraction, then use live screenshots only as an upgrade path.

Why:

- PDF extraction is cheap and deterministic.
- It does not depend on X login walls, network timing, cookie banners, or site layout changes.
- It preserves the historical evidence that was actually inside the approved report.
- Live screenshots can still be added later for freshness, but only after a small trial.

## Phase 1 - PDF Crop Proof Of Concept

Goal:

Create a small local sample of cropped content images from existing report pages.

Status:

- Completed.
- Implementation script: `scripts/extract_content_crops.py`.
- Sample output directory: `public/imports/legacy-content-crops/sample`.

Tasks:

- [x] Pick a representative sample:
  - 5 X posts.
  - 3 news/site pages.
  - 2 official/other links.
- [x] Add a local script that reads `data/imports/hidayathon_reports.json`.
- [x] Use the existing rendered page image as the source.
- [x] Detect or define a crop area for the visible content block.
- [x] Detect or define a crop area for the publisher profile identity block.
- [x] Read the visual `تصنيف المحتوى` checkmark so the sample shows report sentiment instead of internal crop quality.
- [x] Save crops under `public/imports/legacy-content-crops/sample`.
- [x] Generate a JSON manifest with item id, source page image, content crop path, publisher profile crop path, crop method, and confidence.
- [x] Do not write to Supabase in this phase.
- [x] Add automated tests for sample composition, content crop dimensions, publisher profile crop dimensions, hashes, and fallback evidence.

Acceptance:

- At least 8 of 10 sample crops are visually useful.
- Crops show the content image/card area, not only the report header or footer.
- Publisher profile crops preserve the username/profile handle and profile/logo area without showing the whole page.
- Visible review cards show `تصنيف المحتوى` in Arabic, while image crop confidence stays internal in the manifest.
- The script is repeatable and does not mutate production data.

## Phase 2 - Crop Quality Rules

Goal:

Make PDF crop extraction safe enough to run on all 124 items.

Status:

- Completed for the legacy Hidayathon archive.
- Full output directory: `public/imports/legacy-content-crops/full`.
- Current full manifest: 124/124 content crops and 124/124 publisher profile crops, all high confidence.

Tasks:

- [x] Add crop quality metadata:
  - `crop_confidence`: `high`, `medium`, or `low`.
  - `publisher_profile_crop_confidence`: `high`, `medium`, or `low`.
  - `crop_method`: `auto`, `template`, or `manual`.
  - `crop_notes` for known weak pages.
- [x] Add conservative fallback:
  - if crop confidence is low, keep using the full page evidence image.
- [x] Run extraction for all 124 items locally.
- [x] Review counts by report issue and platform.

Acceptance:

- No item loses its existing full-page evidence.
- High/medium confidence crops are available for most items.
- Low confidence crops remain reviewable and are not presented as final content images.

## Phase 3 - Storage And Supabase Mapping

Goal:

Persist content image references without creating a messy asset model.

Recommended first implementation:

- [x] Store generated crop files in the repository under `public/imports/legacy-content-crops`.
- [x] Add the chosen content image path to the imported dataset.
- [x] Upsert the chosen path into Supabase through the existing legacy import pipeline.
- [x] Store publisher profile crop paths in the client-report/import metadata.

Later production implementation:

- Move generated images to Supabase Storage.
- Keep only signed/public storage paths in `captures.asset_url` or a dedicated asset field.
- Add storage RLS/policies only when the client access model is final.

Tasks:

- [x] Reuse `captures.asset_url` and `monitoring_items.evidence_image_path` for the best client-visible evidence image.
- [x] Preserve full-page PDF evidence in `raw_response.sourceEvidenceImagePath` and the crop manifest.
- [x] Update the client report data mapping to prefer:
  1. `legacy_content_crop`
  2. `live_report_capture`
  3. `legacy_page_evidence`
- [x] Update tests to assert image fallback order.

Acceptance:

- Client report can display content crops from persisted data.
- Client report can display the publisher username/profile identity beside the content without exposing extraction details.
- Full-page evidence remains reachable.
- Re-running the import is idempotent.

## Phase 4 - Live Screenshot Trial

Goal:

Prove whether live capture is worth operationalizing.

Tasks:

- Build a local Playwright capture script first, not a production endpoint.
- Capture only 10 sample URLs:
  - 5 X post URLs.
  - 3 news/site URLs.
  - 2 official/other URLs.
- Save output under `public/imports/live-capture-samples`.
- Capture metadata:
  - HTTP/page load status.
  - final URL after redirects.
  - render time.
  - screenshot dimensions.
  - failure reason.
- Compare live screenshots against PDF crops.

Acceptance:

- Live capture succeeds on at least 70 percent of the sample.
- X failures are clearly categorized.
- No production DB writes happen during the trial.

## Phase 5 - Real Capture Worker

Goal:

Replace the placeholder capture behavior with a real capture pipeline.

Tasks:

- Implement a server-side capture worker or admin-only script.
- Add strict budget controls:
  - max captures per run.
  - max retry count.
  - max storage per run.
  - skip if a trusted capture already exists.
- Store real capture rows with:
  - `status`.
  - `asset_url`.
  - `captured_at`.
  - `failure_reason`.
  - capture metadata.
- Update audit logs for capture attempts.

Acceptance:

- `/api/items/:id/capture-report-grade` no longer creates `/window.svg` placeholder captures.
- Failed captures are visible and do not break the client report.
- Usage counters reflect real capture attempts.

## Phase 6 - Client Report UI Integration

Goal:

Make screenshots feel like part of the product, not a debug artifact.

Tasks:

- [x] Add a content image preview in item cards and detail view.
- [x] Add publisher profile crop in the detail view.
- [x] Keep original link next to the visual evidence.
- Add a small label for evidence source:
  - PDF crop.
  - Live capture.
  - Full report page.
- Add filters for screenshot source/availability only if useful.
- [x] Avoid exposing raw extraction details to viewer accounts.

Acceptance:

- Viewer can inspect the content image and original link comfortably.
- Admin can tell which items need better screenshots.
- No admin-only controls appear in the client view.

## Execution Order

1. PDF crop sample.
2. Review sample quality in the app/local files.
3. Full PDF crop extraction.
4. Persist crop paths in Supabase/import data.
5. Client report image fallback order.
6. Live screenshot sample.
7. Real capture worker only if live sample is worth it.

## Do Not Do Yet

- Do not run live capture for all 124 links immediately.
- Do not pay for or depend on X API just for screenshots.
- Do not replace historical PDF evidence.
- Do not expose storage buckets broadly until access rules are reviewed.
- Do not start visual redesign before the content image pipeline has a reliable baseline.
