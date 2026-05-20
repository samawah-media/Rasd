# RASD UI Redesign Plan

Local planning file for the next visual and product redesign phase.

Last updated: 2026-05-20

## Timing

Do not start the full redesign until the core platform loop is confirmed:

1. Production login works with `samawah.pod@gmail.com`.
2. Supabase Auth + roles are stable enough for owner/editor/viewer.
3. The platform reads persisted reports from Supabase.
4. The platform can ingest or display monitored X posts and news items.
5. Links, screenshots, statuses, and review state persist after server restart.
6. `/client-report` shows real data, not only mock or static content.

Once those are confirmed, redesign work starts with `/client-report`, then expands to the admin shell.

## Design Direction

Chosen direction:

```text
RTL Executive Media Intelligence Dashboard
```

The product should feel like a private media intelligence command center for Hidayathon, not a marketing website and not a generic admin dashboard.

Reference mood:

- Datadog: live monitoring clarity.
- Linear: clean navigation, restrained interaction, sharp details.
- Palantir-style command center: operational intelligence and confidence.
- Bloomberg Terminal, lightly: dense but readable signal.
- Notion/Arc, lightly: calm surfaces and polished spacing.

## Visual Identity

Palette direction:

```text
Primary green:
#116A5C

Live mint:
#22C59E

Signal yellow:
#F3C744

Soft yellow:
#FFF4C2

Deep ink:
#111816

Panel ink:
#17201D

Warm surface:
#F6F5EF

Card surface:
#FFFFFF

Border:
#DFE3D9

Muted text:
#66736D
```

Use green for trust, monitoring, positive state, and navigation.

Use yellow for signal, attention, highlights, unusual spikes, warnings, and featured insights.

Avoid:

- Purple-first SaaS styling.
- Heavy dark-mode-only dashboards.
- Decorative blobs and generic gradients.
- Big marketing hero sections inside the actual product.
- Too many floating cards.

## Typography

Chosen platform font:

```text
IBM Plex Sans Arabic
```

Why:

- Professional and modern without feeling cold.
- Works well for Arabic dashboards and dense tables.
- Good numeric readability for analytics.
- Has a serious "intelligence platform" feel.

Fallback stack:

```css
font-family: "IBM Plex Sans Arabic", "Noto Sans Arabic", "Segoe UI", sans-serif;
```

Optional display accent for selected large headings only:

```text
Noto Kufi Arabic
```

Rule:

Use IBM Plex Sans Arabic for almost everything. Add Noto Kufi Arabic only if the product needs a stronger brand moment, not inside dense tables.

## Product Shell

Build one shared shell for client and admin experiences.

Layout:

- RTL sidebar on the right.
- Top bar with workspace name, live status, last update, and account menu.
- Main content area with dense operational layout.
- Detail drawer on the left for selected content.

Client navigation:

```text
نظرة عامة
التغطيات
المصادر
الروابط واللقطات
التقارير
التصدير
```

Admin navigation:

```text
لوحة الرصد
الاستيراد
استكمال الروابط
المراجعات
التقارير
المصادر
الإعدادات
```

Viewer must never see admin tools.

## Client Report Experience

Primary screen:

```text
رصد هداية هاكاثون
```

The first screen should communicate:

- This is live.
- This is private.
- The client can understand the media situation quickly.
- The client can inspect original content, links, and screenshots.

Top bar elements:

- Workspace: `رصد هداية هاكاثون`
- Live badge.
- Date range filter.
- Last update time.
- Export PDF.
- Share report, if available for owner/editor only.

Hero intelligence band:

- Total coverage.
- X posts.
- News/articles.
- Original links completed.
- Screenshots available.
- Top source.
- Peak day.

Main dashboard sections:

- Activity timeline by day.
- Source distribution.
- Coverage type breakdown.
- Top posts/articles by engagement or importance.
- Latest monitored items.
- Items missing original links.

Content feed:

- Use a dense table/list hybrid, not oversized cards.
- Show source, type, date, status, headline/text, original link, screenshot, and tags.
- Each row opens a detail drawer.

Detail drawer:

- Full text.
- Original link.
- Screenshot preview.
- Source metadata.
- Review status.
- Notes.
- Copy/open actions.

## Admin Experience

Admin pages should use the same shell but expose operational tools.

Key pages:

- `/`: command overview.
- `/feed`: monitored content feed.
- `/imports`: imported report batches.
- `/imports/backfill`: missing links and screenshots workflow.
- `/ops`: system health and data operations.
- `/reports/*`: report review and sharing.

Admin UX principles:

- Make status obvious.
- Make next action obvious.
- Keep dangerous actions visually separated.
- Use tables and drawers for repeated operational work.
- Keep the design quieter than the client dashboard.

## Components To Build

Core shell:

- `AppShell`
- `SidebarNav`
- `TopBar`
- `LiveStatusBadge`
- `WorkspaceSwitcher`, future-ready
- `UserMenu`

Data display:

- `MetricStrip`
- `MetricTile`
- `ActivityTimeline`
- `SourceDistribution`
- `CoverageTypeChart`
- `CoverageFeed`
- `CoverageDetailDrawer`
- `ScreenshotPreview`
- `OriginalLinkButton`
- `StatusBadge`
- `DateRangeControl`
- `ExportMenu`

Admin:

- `AdminActionBar`
- `ImportBatchTable`
- `BackfillQueue`
- `ReviewStateControl`
- `SystemHealthPanel`

## Interaction Rules

- Filters should be sticky and easy to scan.
- Table rows should have hover and selected states.
- Detail drawer should preserve the user position in the list.
- Original links open in a new tab.
- Screenshots should be previewable without leaving the page.
- Export actions should be visible but not visually dominant.
- Empty states must be helpful, not decorative.
- Loading states should use skeletons shaped like real content.

## Mobile Rules

Desktop is the primary workflow, but mobile must not break.

Mobile layout:

- Sidebar collapses into bottom or top menu.
- Metric strip becomes horizontal scroll.
- Feed rows become compact stacked rows.
- Detail drawer becomes full-screen sheet.
- Text must not overlap buttons or badges.

## Implementation Phases

Phase 1: Foundation

- Add platform design tokens in CSS variables.
- Add IBM Plex Sans Arabic.
- Build shared shell.
- Update login/unauthorized pages to match the new identity.

Phase 2: Client platform

- Redesign `/client-report` as the executive dashboard.
- Add metric band, timeline, feed, and detail drawer.
- Improve screenshots and original links experience.
- Hide admin-only affordances for viewer.

Phase 3: Admin shell

- Move admin pages into the same shell.
- Redesign `/imports`, `/imports/backfill`, `/feed`, `/ops`, and `/reports/*`.
- Make review and backfill workflows faster.

Phase 4: Polish

- Loading states.
- Empty states.
- Responsive pass.
- Visual QA on production.
- Accessibility pass for contrast, focus, and keyboard navigation.

## Acceptance Criteria

The redesign is successful when:

- The client immediately feels this is a private professional intelligence platform.
- The first screen answers "what is happening now?"
- Original links and screenshots are easy to inspect.
- Admin tools are invisible to viewers.
- Owner/editor workflows are faster than before.
- The visual system feels green/yellow, premium, and serious without looking loud.
- The platform works well in Arabic RTL.

