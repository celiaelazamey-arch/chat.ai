# Staging runbook — Celia Worker + Console

> Planning checklist, approval gates, validation matrix, and rollback guidance: [STAGING_CHECKLIST_AND_PLAN.md](STAGING_CHECKLIST_AND_PLAN.md). This runbook contains operational examples; neither document authorizes or performs remote actions.

## Goal and boundaries

Deploy an isolated Worker, D1 database, and Console preview protected by Cloudflare Access. This runbook is a preparation checklist; it does not apply remote migrations or deploy resources by itself.

**Important integration boundary:** `POST /run` currently invokes `createLocalSmokeRunner`; it does not route to the GitHub plugin. The real GitHub E2E is a separate CLI test (`apps/cli/src/github-e2e.real.test.ts`) which creates an actual branch/commit/PR in the configured test repository. Therefore, a successful hosted Console/Worker smoke test is not proof that `/run` performs GitHub operations. Run the GitHub E2E separately until a reviewed GitHub execution path is connected to the Worker API.

## Required Cloudflare setup

Use the project's authorized Cloudflare account locally or in protected CI. Never paste API tokens or GitHub tokens into this repository or chat.

1. Choose dedicated Staging hostnames for the API and Console. Protect both with Cloudflare Access; avoid using an unprotected `workers.dev` route as a bypass.
2. Create a separate Staging D1 database:
   ```bash
   cd apps/worker
   pnpm exec wrangler d1 create celia-runs-staging
   ```
   Copy the returned **Staging-only** database ID into a dedicated `[env.staging.d1_databases]` binding in `wrangler.toml`. Do not reuse the production database ID.
3. Define a Worker staging environment with `name = "celia-api-staging"`, `CELIA_MODE = "cloud"`, and these per-environment values:
   - `ACCESS_TEAM_DOMAIN`: Access team hostname, without scheme/path.
   - `ACCESS_AUD`: audience tag for the protected API Access application.
   - `CONSOLE_ORIGIN`: exact origin of the protected Console preview (scheme + host, no path). Worker CORS supports one extra exact origin through this setting.
4. Configure the D1 binding to `celia-runs-staging`, and ensure this env resolves to the Staging database ID. Check the rendered configuration before proceeding.
5. Set the Console build variable `VITE_API_BASE_URL` to the protected Staging API origin. Configure the matching Pages preview origin as the Worker `CONSOLE_ORIGIN`.
6. Ensure Access adds `Cf-Access-Jwt-Assertion` for requests that pass its policy. The Console API client sends browser credentials (`credentials: include`) and the Worker verifies the JWT cryptographically.

## Safe deployment sequence

From `apps/worker`, after completing the environment-specific config above:

1. Review config without publishing:
   ```bash
   pnpm exec wrangler deploy --env staging --dry-run
   ```
   Confirm Worker name, D1 binding/database ID, and `CELIA_MODE` are all Staging values.
2. Apply migrations only to the Staging database:
   ```bash
   pnpm exec wrangler d1 migrations apply celia-runs-staging --env staging --remote
   ```
   Migration `0002_run_ownership.sql` adds `owner_id`; legacy rows with no owner remain invisible to authenticated users. Migration `0003_request_limits.sql` creates D1-backed fixed-window counters. Defaults: 10 writes/minute, 100 writes/day, and 120 reads/minute per Access subject. Staging should use a fresh database unless legacy-data handling is explicitly reviewed.
3. Deploy the Worker:
   ```bash
   pnpm exec wrangler deploy --env staging
   ```
4. Build/deploy the Console preview with the Staging API URL and configured Access application. Do not point the staging UI at production D1/API.
5. Verify on deployed endpoints:
   - anonymous/no JWT → `401` on `/tasks`, `/runs`, `/runs/:id`, and `/run`;
   - wrong audience or forged/expired JWT → `401`;
   - valid Access session → `/health` and authenticated history endpoints respond;
   - user A cannot list or retrieve user B's records;
   - successful `/run` persists with the authenticated `sub` as owner;
   - response includes `Cache-Control: private, no-store` and correct credentialed CORS for the exact Console origin;
   - migrations and queries target only the Staging D1 database.

## GitHub real E2E (separate controlled step)

Run only against a dedicated test repository with a minimally scoped GitHub token and explicit approval to create a PR. The test falls back to a repository owner/name if env vars are omitted, so **always explicitly set and verify `CELIA_E2E_OWNER` and `CELIA_E2E_REPO`** before enabling it. Set `GH_TOKEN` (or `GITHUB_TOKEN`) in a protected local/CI secret store and `CELIA_E2E_REAL=1`; never commit or print the token. Set a report directory outside committed paths, then run the single real E2E test. Confirm the test PR, evidence bundle, chain validity, and cleanup policy. This test currently exercises the CLI GitHub adapter, **not** the hosted Worker `/run` route.

## Stop conditions

Do not run remote migration/deploy until the real Staging D1 ID, Access team domain/audience, API and Console hostnames, account authorization, and backup/rollback plan are confirmed. A dry-run build alone is not a live security check. The Worker can fail closed with `503` until Access configuration exists.
