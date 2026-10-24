# Linxova Launch Handoff — Oct 13, 2026

## Status: code complete & pushed; blocked on 3 user-provided credentials

Git state: `main` and `deploy-restore` both at `943915e` (clean working tree).
Live Render deploy is still frozen at `427269d` until the Render GitHub App is re-granted at github.com/apps/render → Configure → add `SandAstro-137/Linxova`.

## What changed (commits 27f1f0b + 943915e)

1. **Zoho Mail SMTP is the primary email provider** (`server/lib/resend-client.ts`):
   - `smtppro.zoho.com:465` TLS, from `support@linxova.com`
   - SendGrid/Resend remain fallbacks
   - Verified: SMTP auth check passed; two real end-to-end sends through the app flow (HTTP 200 each, no server errors).
2. **Demo mode fully disabled in production** (`server/routes.ts`, `server/index.ts`):
   - `/api/auth/dev-login` → 404 in prod (was an open hole: anyone could become founder)
   - `/api/auth/demo-accounts` → 401 in prod
   - Demo seeding skipped when `NODE_ENV=production`
   - Production requires a real `SESSION_SECRET` (hard exit otherwise) and uses secure HTTPS-only cookies
   - Login page (`client/src/pages/login.tsx`) renders "Continue with Google" plus demo buttons ONLY when the server offers demo accounts (dev).
3. **Google OAuth sign-in** (`server/routes.ts`):
   - `/api/auth/google` + `/api/auth/google/callback` (state CSRF, code exchange, verified emails marked verified)
   - Google account id stored in the existing external-ID column (`discordId`), same pattern as Discord users

## Verified locally this session

- `npm run build` (vite + esbuild) passes; dist serves in prod mode
- Prod simulation (port 3100): `/` 200, demo-accounts 401, dev-login 404, google route exists (500 while unconfigured — expected)
- Dev mode (port 5006): demo login still works, `/api/auth/google` present (500 unconfigured — expected)
- Render env vars set (values never printed): `ZOHO_SMTP_USER/PASSWORD/FROM_EMAIL/HOST/PORT`, `SESSION_SECRET` (new random 32-byte)

## Missing for launch (user actions in progress)

1. **MongoDB Atlas connection string** → save one line to Downloads `MongoUri.txt`.
   Without it the app silently runs in-memory: all data lost on restart (this is WHY prod was a "demo").
2. **Google OAuth credentials** → Downloads `GoogleCreds.txt` (one line: `CLIENT_ID,CLIENT_SECRET`).
   Redirect URIs to register: `https://linxova.com/api/auth/google/callback` and `http://localhost:5006/api/auth/google/callback`; origins `https://linxova.com`, `http://localhost:5006`.
3. **Render GitHub App re-grant** → github.com/apps/render → Configure → repo access `SandAstro-137/Linxova`.

Once provided: ingest creds to `.env` + Render (`GOOGLE_REDIRECT_URI=https://linxova.com/api/auth/google/callback`), deploy, then E2E test on linxova.com: Google login, dashboard, verification email via Zoho, restart → data persists.

## Known limitations / notes

- Render plan unknown: free tier sleeps after ~15 min idle (cold starts, sessions lost on wake). Sessions are memory-backed — deploys log users out. Consider DB-backed sessions later.
- Zoho free/standard SMTP has daily send limits (fine for verification emails).
- CoinGecko rate-limiting occasionally shows price = 0 for seconds (cosmetic).
- `tsc --noEmit` has one PRE-EXISTING error in `client/src/pages/current-job.tsx` (useQuery `enabled` typing), unrelated to this work.
- The `resend-client.ts` Replit-connector fallback is legacy; safe to ignore while Zoho/SendGrid are configured.
