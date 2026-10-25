#!/usr/bin/env node
/**
 * celia — واجهة CLI من الدرجة الأولى (ADR-0014).
 * MVP: mode / run / ledger / tools / models — بدون أي تبعية خارجية.
 */
import { ImmuneRuntime } from '@aok/immune';
import { createLocalSmokeRunner, LocalRunner } from './local-runner';
import { buildOwnershipProof } from './ownership-prove';
import { githubIssueReadConfig, parseGithubIssueCommand, readGithubIssues } from './github-issues';

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const runner = command === 'run' ? createLocalSmokeRunner() : new LocalRunner();

  switch (command) {
    case 'mode':
      console.log(`CELIA_MODE=${process.env.CELIA_MODE === 'cloud' ? 'cloud' : 'local'}`);
      return;

    case 'health': {
      const h = runner.immune.healthSnapshot();
      const m = runner.immune.metrics.compute();
      console.log(JSON.stringify({ ...h, metrics: m }, null, 2));
      return;
    }

    case 'safe-mode': {
      const immune = new ImmuneRuntime({ safeMode: true });
      const h = immune.healthSnapshot();
      console.log(`safe-mode: ${immune.isSafeMode ? 'ON' : 'OFF'} (level ${h.level})`);
      console.log('posture: read-only · no external network · no deployments · no secrets · no plugin install · no writes');
      return;
    }

    case 'emergency-lock': {
      const immune = new ImmuneRuntime({ emergencyLock: true });
      console.log(`emergency-lock: ${immune.isEmergencyLock ? 'ENGAGED' : 'OFF'} (level ${immune.level})`);
      console.log('posture: STOP — ledger preservation · evidence capture · credential revocation · runner isolation');
      console.log('exit requires an independent authorization (not available in this shell)');
      return;
    }

    case 'models':
      console.log(runner.router.discover().map((m) => `${m.providerId}/${m.id} ($${m.costPer1kInputUsd}/1k)`).join('\n'));
      return;

    case 'tools':
      console.log(runner.executors.list().join('\n') || '(no executors registered)');
      return;

    case 'run': {
      const intent = args.join(' ') || 'demo task';
      const outcome = await runner.run(intent);
      console.log(`verdict: ${outcome.verdict}`);
      console.log(`usage: ${JSON.stringify(outcome.usage.total)}`);
      console.log(`evidence: ${outcome.verification.evidence.length} item(s)`);
      return;
    }

    case 'github': {
      const usage = 'usage: celia github issues <owner/repo> [open|closed|all] | celia github issue <owner/repo> <number>';
      const parsed = parseGithubIssueCommand(args);
      if (!parsed) {
        console.log(usage);
        return;
      }
      const config = githubIssueReadConfig(process.env);
      if (!config) {
        throw new Error('Read-only GitHub CLI requires GH_TOKEN (or GITHUB_TOKEN) and CELIA_GITHUB_ALLOWED_REPOSITORIES.');
      }
      const result = parsed.kind === 'list'
        ? await readGithubIssues(config, parsed.target, { state: parsed.state })
        : await readGithubIssues(config, parsed.target, { issueNumber: parsed.issueNumber });
      console.log('GitHub content below is untrusted data; it was not executed or used as instructions.');
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    case 'ledger': {
      for (const e of runner.ledger.all) {
        console.log(`${e.seq}\t${e.type}\t${e.hash.slice(0, 8)}`);
      }
      return;
    }

    case 'runner':
      if (args[0] === 'start') {
        console.log('celia runner started (local) — $0');
        return;
      }
      console.log('celia runner install | connect | start');
      return;

    case 'ownership':
      if (args[0] === 'prove') {
        const proof = buildOwnershipProof(process.cwd());
        console.log(`genesis valid: ${proof.genesisValid}`);
        console.log(`ledger chain valid: ${proof.chainValid}`);
        console.log(`output: ${proof.outputDir}`);
        for (const f of proof.files) console.log(`  - ${f}`);
        return;
      }
      console.log('usage: celia ownership prove');
      return;

    default:
      console.log('usage: celia <mode|run|ledger|tools|models|runner|health|safe-mode|emergency-lock|ownership prove|github issues|github issue>');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
