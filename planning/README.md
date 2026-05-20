# RASD Planning Hub

This folder contains the living planning documents for the RASD platform.

Use this folder for product direction, remaining work, deployment notes, UI direction, and future decision logs.

## Files

### `remaining-platform-workplan.md`

The main execution plan.

Use it to track:

- What still blocks real production testing.
- Priority phases.
- Critical tasks for persistence, ingestion, review, client reporting, and role protection.
- The next recommended sprint.

Update this file whenever priorities change or a phase is completed.

### `ui-redesign-plan.md`

The visual and UX direction.

Use it to track:

- Platform design direction.
- Color system.
- Typography.
- Client dashboard structure.
- Admin shell structure.
- Components to build.
- Redesign acceptance criteria.

Do not start full redesign work until the critical operational loop in `remaining-platform-workplan.md` is testable.

### `auth-deployment-settings.md`

Deployment and authentication reference.

Use it to track:

- Vercel project and production URL.
- Supabase project and auth URLs.
- Google OAuth settings.
- Environment variable names.
- Security notes.
- Production auth checklist.

Never store actual secrets in this file.

### `qa-checklist.md`

Repeatable production smoke tests.

Use it to track:

- What the owner must verify manually after deployment.
- What can be verified automatically from the local machine.
- Which Priority A checks are done before UI redesign begins.

### `content-screenshot-pipeline-plan.md`

Plan for turning legacy report evidence into useful content images.

Use it to track:

- PDF crop extraction from existing report pages.
- Small live screenshot trials.
- Storage/Supabase mapping for visual evidence.
- Client report image fallback behavior.

## Suggested Future Files

Create these as the project grows:

- `decision-log.md`: architecture/product decisions and why we made them.
- `data-model-notes.md`: Supabase tables, RLS, and persistence rules.
- `source-integrations.md`: X, RSS, news, and manual URL details.
- `client-feedback.md`: notes from testing with real users.

## Update Rule

When a meaningful task is completed, update the relevant planning file in the same commit as the code change.

This keeps the project memory fresh and prevents the plan from becoming a museum piece.
