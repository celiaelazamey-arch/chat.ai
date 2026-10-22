# GitHub Integration — Status & Operator Guide

**Effective date:** 2026-10-22 · **Scope:** `apps/cli` + `plugins/tools/github` · **PR:** [elazamey/chat.ai#19](https://github.com/elazamey/chat.ai/pull/19)

The GitHub plugin (7 operations) is wired into the agent's real execution path,
available from the ordinary CLI through `celia run --github`, gated by a
non-downgradable write-approval policy, and verifiable with a real connection check.
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

### Ordinary CLI execution

`celia run` without `--github` keeps using the side-effect-free local smoke path.
The explicit GitHub mode uses the real runner and API:

```bash
# Real read-only inspection (repo metadata + README)
celia run --github --repo owner/repo "inspect this repository"

# Explicit operations; JSON steps are restricted to the 7 GitHub actions
celia run --github --repo owner/repo \
  --steps '[{"action":"github.repo.read","input":{"owner":"owner","repo":"repo"}}]' \
  "inspect with an explicit plan"
```

Without `--steps`, the plan is read-only (`github.repo.read` + README
`github.repo.file.read`). With `--steps`, every action still goes through the
grant/policy/schema/immune execution path. If any planned action writes, the CLI
asks **separately before each write** on stderr (`[y/N]`); empty input, EOF, or
any answer other than `y`/`yes` denies that write. There is no `--yes` option.

## 3. Approval policy (reads auto by default, writes approval-locked)

| Action | Policy |
| --- | --- |
| `github.repo.read`, `github.repo.file.read`, `github.pull_request.read` | `auto` by default (callers may tighten to `approval`) |
| `github.repo.branch.create`, `github.repo.file.write`, `github.git.commit`, `github.pull_request.create` | `approval` — **hard policy lock**; consulted per operation via `onApprovalRequired`; absent handler = denied |

Defined centrally in `apps/cli/src/github-policy.ts` with a compile-time coverage
check over all `github.*` actions. `enforceGithubApprovalPolicy` applies the write
lock *after* caller-supplied `approvalPolicy`, so ordinary configuration cannot
downgrade a write to `auto` (regression-tested through `LocalRunner`).

This guarantee is precise in scope: the runner always *requests* an approval
decision before each write and blocks when the answer is absent or negative. The
source of a positive answer is the caller's handler. The built-in
`celia run --github` handler is interactive per write; the real E2E handler uses
operator pre-approval (see §4). There is no default answer in the runner itself.

## 4. Real E2E (operator-gated)

Runs against live GitHub only with the operator's double opt-in. The last flag is
an **up-front operator pre-approval** for this test's specific real writes
(branch, file, empty commit, PR). During the run, each write still produces its
own approval request, log line, and ledger events; the test handler then answers
yes based on that pre-approval. This is intentionally **not** evidence of
interactive per-operation human approval — use `celia run --github` for the
interactive mode described in §2.

```bash
CELIA_E2E_REAL=1 CELIA_E2E_APPROVE_WRITES=1 GH_TOKEN=… \
  pnpm exec vitest run apps/cli/src/github-e2e.real.test.ts
# target override: CELIA_E2E_OWNER=… CELIA_E2E_REPO=…
```

Reports are written to `.e2e-artifacts/` (git-ignored).

## 5. Verification log (2026-10-22)

| Check | Result |
| --- | --- |
| Offline suite (full) | **334 passed · 1 skipped** (Node 24) — baseline before the GitHub work: 283 passed on Node 20, 3 files unloadable there due to `node:sqlite` (environment, pre-existing) |
| GitHub-focused tests | 33 across `github-connect.test.ts`, `github-integration.test.ts`, and `github-run.test.ts`, including secret non-leakage, "no write reaches the transport without approval", caller-`auto` downgrade regression tests, and ordinary `celia run --github` plan/interactive-approval cases |
| Typecheck | `pnpm -r run typecheck` clean |
| Live connect | `runner connect elazamey/chat.ai` → connected as `celiaelazamey-arch`, `pull=true push=false admin=false`, exit 0 (token never printed) |
| Live ordinary CLI | `celia run` without `--github` still returns the original smoke result (3 fake tool results, no GitHub API). `celia run --github --repo celiaelazamey-arch/chat.ai` performed real repo + README reads and PASSED. In separate disposable-branch checks against the fork, stdin EOF denied creation (the ref remained 404), while a stdin `y` supplied by the validation pipeline created the branch at `cde0fd77`; it was deleted immediately and confirmed 404. These prove the prompt/deny/approve code path with operator-supplied stdin, not an unattended auto-approval |
| Live E2E | **PASSED** against `celiaelazamey-arch/chat.ai` (fork; the authorized account is read-only on upstream): branch `e2e/m2-1792710656212`, PR [celiaelazamey-arch/chat.ai#1](https://github.com/celiaelazamey-arch/chat.ai/pull/1), commit `0dbe8915`, ledger chain valid, Merkle root `303eadc7…a6e58`, all 7 verification checks PASSED. Exactly 4 per-write approval requests/grants were ledgered and answered under the operator's up-front `CELIA_E2E_APPROVE_WRITES=1` pre-approval — not through interactive prompts |
| Integration PR | [elazamey/chat.ai#19](https://github.com/elazamey/chat.ai/pull/19) from `celiaelazamey-arch:feat/github-integration` (cross-fork, `main` untouched) |

## 6. Known remaining limitation

GitHub grants use scope `*` because `LocalRunner` evaluates policy per capability,
not per resource. Pinning grants to `repo:owner/name` requires deriving the scope
from each step's input during policy evaluation — proposed follow-up, out of scope
for this task.

To run the real E2E directly against `elazamey/chat.ai`, use a credential whose
account has `push` there (owner account or a `Write` collaborator); no code changes
are required — `runner connect` will report `push=true`.
