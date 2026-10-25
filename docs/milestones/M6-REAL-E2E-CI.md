# M6 — Real E2E + CI

## Scope

M6 proves the real GitHub boundary using the AOK execution path:

`repo.read → branch.create → file.read → file.write → git.commit → pull_request.create → pull_request.read → verification`

Every side effect is policy-checked and recorded in the ledger. The test exports the verdict, PR, commit, checks, executed actions, chain validity, and Merkle root.

## Local execution

The test is opt-in and does not run during ordinary `pnpm test`:

```bash
CELIA_E2E_REAL=1 GH_TOKEN="$GH_TOKEN" \
  pnpm exec vitest run apps/cli/src/github-e2e.real.test.ts
```

Required when `CELIA_E2E_REAL=1` and a token is present:

- `CELIA_E2E_OWNER` and `CELIA_E2E_REPO` explicitly select the target repository; there is no default target.

Optional:

- `CELIA_E2E_REPORT_DIR` selects the evidence directory (default: `.e2e-artifacts`).

The token must be able to read repository metadata and create branches, commits, files, and pull requests. Use a disposable test repository or a fine-grained token limited to that repository.

## Manual CI workflow

`.github/workflows/real-e2e.yml` is `workflow_dispatch` only and runs only when dispatched from `main`. The job targets the `github-e2e` Environment; configure that Environment in GitHub Settings with required reviewers, deployments limited to `main`, and environment-scoped `E2E_GH_TOKEN` and `CELIA_E2E_ALLOWED_REPOSITORY` secrets (not repository-level secrets). The workflow's own `GITHUB_TOKEN` is read-only (`contents: read`); `E2E_GH_TOKEN` is the separate credential used by the test for the allowlisted disposable target.

The workflow uploads `report.json`, `report.md`, and the ledger evidence as the `real-github-e2e-report` artifact. It is intentionally separate from pull-request CI so normal builds never require credentials or create external resources.

**Safety controls added locally:** owner/repo inputs have no defaults, the job is gated to `main` and the `github-e2e` Environment, workflow `GITHUB_TOKEN` is read-only, and a guard requires an exact target match to `CELIA_E2E_ALLOWED_REPOSITORY` while refusing the source repository. Before use, configure required Environment reviewers, restrict deployments to `main`, and create environment-scoped `CELIA_E2E_ALLOWED_REPOSITORY` and narrowly scoped `E2E_GH_TOKEN` secrets for a disposable repository. These GitHub settings and a real E2E run remain unverified/unperformed; the environment name in YAML alone does not enforce protection.

## M6 Definition of Done

- The real GitHub E2E test is opt-in and passes through the same LocalRunner, policy, capability, and ledger path as production execution.
- The manual workflow runs type-safe tests against a selected repository and preserves evidence as an artifact.
- Standard CI remains secret-free and continues to run typecheck, Vitest, and the offline container smoke tests.
- Failed runs leave an auditable report identifying the last completed action and should be cleaned up manually by closing the generated PR and deleting its temporary branch.
