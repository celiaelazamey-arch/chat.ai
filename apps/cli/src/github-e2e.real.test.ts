import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { GithubE2EError, runGithubE2E, runRepoTests } from './github-e2e';

/**
 * E2E حقيقي ضد GitHub (M2 — REAL EXTERNAL EXECUTION).
 * يعمل فقط عند الطلب الصريح المزدوج من المشغّل:
 *   CELIA_E2E_REAL=1 + GH_TOKEN + CELIA_E2E_APPROVE_WRITES=1
 * العالم الأخير هو الموافقة البشرية الصريحة على كتابات حقيقية (فرع وملف
 * وcommit وPR بتوقيت فريد) — بدونه لا يبدأ الاختبار أصلًا.
 * (لا يعمل في CI الافتراضي حتى لا ننشئ PRs عشوائية.)
 */
const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
const writesApprovedByOperator = process.env.CELIA_E2E_APPROVE_WRITES === '1';
const enabled = Boolean(token) && process.env.CELIA_E2E_REAL === '1' && writesApprovedByOperator;
const reportDir = process.env.CELIA_E2E_REPORT_DIR ?? '.e2e-artifacts';

function writeReport(outcome: Awaited<ReturnType<typeof runGithubE2E>>): void {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(`${reportDir}/report.json`, JSON.stringify(outcome, null, 2));
  const checks = outcome.checks.map((check) => `- ${check.verdict}: ${check.name}${check.detail ? ` — ${check.detail}` : ''}`).join('\n');
  writeFileSync(
    `${reportDir}/report.md`,
    [
      '# Real GitHub E2E Report',
      '',
      `- Verdict: **${outcome.verdict}**`,
      `- PR: ${outcome.prUrl ?? 'not created'}`,
      `- Commit: ${outcome.commitSha ?? 'not created'}`,
      `- Chain valid: **${outcome.chainValid}**`,
      `- Merkle root: \`${outcome.merkleRoot}\``,
      '',
      '## Verification checks',
      checks || '- No checks recorded',
      '',
      '## Executed actions',
      outcome.executedActions.map((action) => `- \`${action}\``).join('\n') || '- None',
    ].join('\n'),
  );
}

function failureReport(error: unknown): Awaited<ReturnType<typeof runGithubE2E>> {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    verdict: 'FAILED',
    checks: [{ name: 'run failure', verdict: 'FAILED', detail }],
    ledgerEventTypes: [],
    executedActions: [],
    chainValid: false,
    merkleRoot: 'unavailable',
    usage: { total: {} },
  };
}

describe.skipIf(!enabled)('REAL GitHub E2E (M2)', () => {
  it(
    'inspects the repo, opens a PR changing a specific file, and verifies with evidence',
    async () => {
      const stamp = Date.now();
      let outcome: Awaited<ReturnType<typeof runGithubE2E>>;
      try {
        outcome = await runGithubE2E({
          token: token!,
          // الموافقة هنا ليست افتراضية: الاختبار نفسه لا يعمل إلا إذا ضبط المشغّل
          // CELIA_E2E_APPROVE_WRITES=1 صراحة، وكل موافقة تُسجَّل قبل منحها.
          onApprovalRequired: async (req) => {
            console.warn(`[real-e2e] operator-approved write: ${req.action} (${req.reason})`);
            return true;
          },
          owner: process.env.CELIA_E2E_OWNER ?? 'elazamey',
          repo: process.env.CELIA_E2E_REPO ?? 'chat.ai',
          branch: `e2e/m2-${stamp}`,
          readPath: 'README.md',
          writePath: `docs/e2e/M2-${stamp}.md`,
          fileContent: `# M2 E2E verification\n\nCreated by AOK LocalRunner + GitHub Adapter at ${new Date().toISOString()}.\n`,
          commitMessage: 'M2 E2E verification',
          prTitle: 'M2 E2E verification (auto)',
          prBody: 'This PR was created programmatically by the AOK kernel to prove the real external boundary (M2).',
          evidenceDir: reportDir,
          runTests: () => runRepoTests(),
        });
      } catch (error) {
        writeReport(error instanceof GithubE2EError ? error.outcome : failureReport(error));
        throw error;
      }
      writeReport(outcome);

      // معيار القبول M2
      expect(outcome.verdict).toBe('PASSED');
      expect(outcome.chainValid).toBe(true); // 100% side effects ledgered + chain intact
      expect(outcome.checks.find((c) => c.name === 'expected diff')?.verdict).toBe('PASSED');
      expect(outcome.ledgerEventTypes).toContain('ApprovalRequired');
      expect(outcome.ledgerEventTypes).toContain('ApprovalGranted');
      expect(outcome.executedActions).toContain('github.pull_request.create');
      expect(outcome.executedActions).toContain('github.repo.file.write');
      expect(outcome.ledgerEventTypes).toContain('VerificationCompleted');
    },
    180_000,
  );
});
