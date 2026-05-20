# RASD Auth and Deployment Settings

Local-only operations note for the RASD Hidayathon deployment.

Last updated: 2026-05-20

## Current Production App

- Vercel project: `rasd`
- Vercel team: `samawah's projects`
- Production URL: `https://rasd-gamma.vercel.app`
- Login URL: `https://rasd-gamma.vercel.app/login`
- Client report URL: `https://rasd-gamma.vercel.app/client-report`
- Vercel dashboard: `https://vercel.com/samawahs-projects/rasd`
- Latest verified production deployment: `READY`

## Supabase Project

- Project ref: `ewunxfttbpqisspqthiz`
- Supabase URL: `https://ewunxfttbpqisspqthiz.supabase.co`
- Auth settings: `https://supabase.com/dashboard/project/ewunxfttbpqisspqthiz/settings/auth`
- Auth providers: `https://supabase.com/dashboard/project/ewunxfttbpqisspqthiz/auth/providers`
- Users: `https://supabase.com/dashboard/project/ewunxfttbpqisspqthiz/auth/users`
- SQL editor: `https://supabase.com/dashboard/project/ewunxfttbpqisspqthiz/sql`

Required Supabase Auth URL settings:

```text
Site URL:
https://rasd-gamma.vercel.app

Redirect URLs:
https://rasd-gamma.vercel.app/auth/callback
http://localhost:3000/auth/callback
http://127.0.0.1:3000/auth/callback
```

Google provider status:

- Verified on 2026-05-20: Supabase `/auth/v1/authorize?provider=google` returns `302 Found` to Google.
- This means the previous `Unsupported provider: provider is not enabled` issue is resolved on the Supabase project currently used by production.

## Google Cloud OAuth

- Google Cloud credentials page: `https://console.cloud.google.com/apis/credentials`
- OAuth Client ID:

```text
741372106588-1a4b0q714fu1eesmp4r85h4hcrefu6nl.apps.googleusercontent.com
```

Required Authorized JavaScript origins:

```text
https://rasd-gamma.vercel.app
http://localhost:3000
```

Required Authorized redirect URIs:

```text
https://ewunxfttbpqisspqthiz.supabase.co/auth/v1/callback
```

Important security note:

- The Google OAuth Client Secret was pasted into chat on 2026-05-20.
- Treat that secret as exposed.
- Rotate/reset it in Google Cloud, then paste the new secret directly into Supabase Google Provider.
- Do not store the Google Client Secret in this Markdown file.

## Vercel Environment Variables

These variables were added to Vercel for `production`, `preview`, and `development`:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
RASD_ADMIN_IMPORT_TOKEN
```

Local `.env.local` also contains:

```text
SUPABASE_PROJECT_REF
SUPABASE_DB_PASSWORD
SUPABASE_DB_URL
```

Secret storage rule:

- Public values with `NEXT_PUBLIC_` are intentionally visible in the browser.
- `SUPABASE_SERVICE_ROLE_KEY`, `RASD_ADMIN_IMPORT_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`, and OAuth client secrets must not be committed, pasted in chat, or placed in regular Markdown docs.
- Keep actual secret values in Vercel Environment Variables, Supabase Dashboard, Google Cloud, and local `.env.local` only.

## Local Project State

- Vercel project link file: `.vercel/project.json`
- Linked Vercel project ID: `prj_laMp4JGdIZAq8AXWgGOtLCQgi18K`
- Linked Vercel org/team ID: `team_V2DB7cQmTZIGATfviARQwq4j`
- Local folder is not currently a Git repository.

## Verification Checklist

1. Open `https://rasd-gamma.vercel.app/login`.
2. Click Google login.
3. If Google consent page opens, provider and redirect setup are working.
4. Complete login with invited owner email `samawah.pod@gmail.com`.
5. Confirm owner lands on admin area.
6. Confirm unauthenticated `/client-report` redirects to `/login?next=/client-report`.
7. Confirm viewer accounts can access `/client-report` but cannot access `/imports`, `/ops`, `/feed`, or `/reports/*`.

## Common Google Login Loop Cause

If Google lets the user choose an email and then the app returns to `/login`, the most likely cause is invite-only auth:

- Supabase signups are disabled.
- The selected Google email does not exist yet in Supabase Auth Users, or has not accepted an invitation.
- Supabase returns an OAuth error such as `signup_disabled` instead of an auth code.

Fix:

1. Open `https://supabase.com/dashboard/project/ewunxfttbpqisspqthiz/auth/users`.
2. Click `Invite user`.
3. Invite the exact Google email that will log in, for example `samawah.pod@gmail.com`.
4. The user must accept the invite.
5. Try Google login again.

The app now surfaces this reason on the login page instead of silently returning to the same screen.

## Known Non-Blocking Notes

- Another Vercel project named `rasd-platform` exists in the team. It was not modified or deleted.
- Firebase domains `rasd-b99df.web.app` and `rasd-b99df.firebaseapp.com` are no longer the primary production target unless intentionally reused later.
- The next product task after auth verification is upgrading the client-facing UI into the final professional platform experience.
