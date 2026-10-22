# GitHub Integration — Status & Operator Guide

**Effective date:** 2026-10-22 · **Scope:** `apps/cli` + `plugins/tools/github` · **PR:** [elazamey/chat.ai#19](https://github.com/elazamey/chat.ai/pull/19)

The GitHub plugin (7 operations) is wired into the agent's real execution path,
gated by an explicit-approval policy, and verifiable with a real connection check.
This document records how it works, how to operate it, and the verification evidence.

## 1. Verify the connection (real, secret-safe)

```bash
export GH_TOKEN=…            # or GITHUB_TOKEN — environment only, never commit
pnpm exec tsx apps/cli/src/cli.ts runner connect [owner/repo] [--json]
```

- Verifies the authenticated user (`GET /user`) and, for a repo, access plus the
  token's effective `pull/push/admin` permissions (`GET /repos/{owner}/{repo}`).
- Default repo: `elazamey/chat.ai` (override with the argument or `CELIA_E2E_OWNER`/`CELIA_E2E_REPO`).
- Exit code: `0` connected, `1` not connected / no credential.
- The verifier receives a pre-configured transport and never sees the raw token, so
  reports cannot leak it (proven by a sentinel-token test).

## 2. Execution-path wiring

`LocalRunner` stays deny-by-default. GitHub is enabled **explicitly**:

```ts
import { createGithubRunner, createGithubRunnerFromEnv } from './github-runner';

// explicit transport…
const runner = createGithubRunner({ transport, onApprovalRequired });
// …or from the environment (undefined when no credential is configured)
const envRunner = createGithubRunnerFromEnv(process.env, { onApprovalRequired });
```

Enabling registers all 7 actions (`github.repo.read`, `github.repo.branch.create`,
`github.repo.file.read`, `github.repo.file.write`, `github.git.commit`,
`github.pull_request.create`, `github.pull_request.read`) in the same
`ExecutorRegistry` traversed by `execute()` + Policy + Immune Gate, and grants only
those capabilities to the principal (default `coder`). `createLocalSmokeRunner`
(the $0 side-effect-free deployment path) is unchanged. `celia tools` lists the
GitHub tools only when a credential is configured.

## 3. Approval policy (reads auto, writes explicit)

| Action | Policy |
| --- | --- |
| `github.repo.read`, `github.repo.file.read`, `github.pull_request.read` | `auto` |
| `github.repo.branch.create`, `github.repo.file.write`, `github.git.commit`, `github.pull_request.create` | `approval` — per operation, via `onApprovalRequired`; absent handler = denied |

Defined centrally in `apps/cli/src/github-policy.ts` with a compile-time coverage
check over all `github.*` actions. There is **no** default auto-approval anywhere in
the real execution path (the previous `async () => true` in `runGithubE2E` and the
old `auto` write policy were removed).

## 4. Real E2E (operator-gated)

Runs against live GitHub only with the operator's double opt-in — the last flag is
the explicit human pre-approval for real writes (branch, file, empty commit, PR):

```bash
CELIA_E2E_REAL=1 CELIA_E2E_APPROVE_WRITES=1 GH_TOKEN=… \
  pnpm exec vitest run apps/cli/src/github-e2e.real.test.ts
# target override: CELIA_E2E_OWNER=… CELIA_E2E_REPO=…
```

Reports are written to `.e2e-artifacts/` (git-ignored).

## 5. Verification log (2026-10-22)

| Check | Result |
| --- | --- |
| Offline suite (full) | **320 passed · 1 skipped** (Node 24) — baseline before this change: 283 passed on Node 20, 3 files unloadable there due to `node:sqlite` (environment, pre-existing) |
| New tests | 19 (`github-connect.test.ts`, `github-integration.test.ts`) incl. secret non-leakage and "no write reaches the transport without approval" |
| Typecheck | `pnpm -r run typecheck` clean |
| Live connect | `runner connect elazamey/chat.ai` → connected as `celiaelazamey-arch`, `pull=true push=false admin=false`, exit 0 (token never printed) |
| Live E2E | **PASSED** against `celiaelazamey-arch/chat.ai` (fork; the authorized account is read-only on upstream): branch `e2e/m2-1792710656212`, PR [celiaelazamey-arch/chat.ai#1](https://github.com/celiaelazamey-arch/chat.ai/pull/1), commit `0dbe8915`, ledger chain valid, Merkle root `303eadc7…a6e58`, all 7 verification checks PASSED, exactly 4 approval requests (writes only) |
| Integration PR | [elazamey/chat.ai#19](https://github.com/elazamey/chat.ai/pull/19) from `celiaelazamey-arch:feat/github-integration` (cross-fork, `main` untouched) |

## 6. Known remaining limitation

GitHub grants use scope `*` because `LocalRunner` evaluates policy per capability,
not per resource. Pinning grants to `repo:owner/name` requires deriving the scope
from each step's input during policy evaluation — proposed follow-up, out of scope
for this task.

To run the real E2E directly against `elazamey/chat.ai`, use a credential whose
account has `push` there (owner account or a `Write` collaborator); no code changes
are required — `runner connect` will report `push=true`.
