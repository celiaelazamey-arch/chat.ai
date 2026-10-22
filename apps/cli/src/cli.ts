#!/usr/bin/env node
/**
 * celia — واجهة CLI من الدرجة الأولى (ADR-0014).
 * MVP: mode / run / ledger / tools / models — بدون أي تبعية خارجية.
 */
import { ImmuneRuntime } from '@aok/immune';
import { createLocalSmokeRunner, LocalRunner } from './local-runner';
import { buildOwnershipProof } from './ownership-prove';
import { createGithubRunnerFromEnv } from './github-runner';
import {
  buildGithubRunPlan,
  createStdinInteractiveApproval,
  hasGithubWriteSteps,
  summarizeGithubOutput,
} from './github-run';
import {
  formatConnectionReport,
  githubTransportFromEnv,
  parseOwnerRepo,
  verifyGithubConnection,
} from './github-connect';

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

    case 'tools': {
      // عند وجود اعتماد GitHub تظهر الأدوات الحقيقية المسجّلة في مسار التنفيذ، وإلا إرشاد للاتصال.
      const githubRunner = createGithubRunnerFromEnv();
      const tools = githubRunner ? githubRunner.executors.list() : runner.executors.list();
      console.log(tools.join('\n') || '(no executors registered)');
      if (!githubRunner) console.log('(github: not connected — set GH_TOKEN, then: celia runner connect)');
      return;
    }

    case 'run': {
      // المسار الافتراضي يبقى Smoke المحلي العديم الأثر تمامًا كما كان؛
      // لا يفعّل GitHub الحقيقي إلا العلم الصريح --github.
      if (!args.includes('--github')) {
        const intent = args.join(' ') || 'demo task';
        const outcome = await runner.run(intent);
        console.log(`verdict: ${outcome.verdict}`);
        console.log(`usage: ${JSON.stringify(outcome.usage.total)}`);
        console.log(`evidence: ${outcome.verification.evidence.length} item(s)`);
        return;
      }

      let approvalSession: ReturnType<typeof createStdinInteractiveApproval> | undefined;
      try {
        const plan = buildGithubRunPlan(args);
        // جلسة تفاعلية فقط عند وجود كتابة مخططة؛ كل كتابة تُعرض وتُسأل عنها منفردة.
        approvalSession = hasGithubWriteSteps(plan.steps)
          ? createStdinInteractiveApproval()
          : undefined;
        const githubRunner = createGithubRunnerFromEnv(process.env, {
          onApprovalRequired: approvalSession?.onApprovalRequired,
        });
        if (!githubRunner) {
          console.log('github: NOT CONNECTED — no credential found');
          console.log('set GH_TOKEN (or GITHUB_TOKEN) in the environment — never commit it — then rerun: celia runner connect');
          process.exitCode = 1;
          return;
        }

        console.log(`github repo: ${plan.owner}/${plan.repo}`);
        const outcome = await githubRunner.run(plan.intent, { steps: plan.steps });
        plan.steps.forEach((step, index) => {
          const result = outcome.results[index];
          console.log(
            `${step.action}: ${result?.status ?? 'missing'} ${summarizeGithubOutput(result?.output)}`,
          );
        });
        console.log(`verdict: ${outcome.verdict}`);
        console.log(`usage: ${JSON.stringify(outcome.usage.total)}`);
        console.log(`evidence: ${outcome.verification.evidence.length} item(s)`);
        if (outcome.verdict !== 'PASSED') process.exitCode = 1;
        return;
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
        return;
      } finally {
        approvalSession?.close();
      }
    }

    case 'ledger': {
      for (const e of runner.ledger.all) {
        console.log(`${e.seq}\t${e.type}\t${e.hash.slice(0, 8)}`);
      }
      return;
    }

    case 'runner': {
      if (args[0] === 'start') {
        console.log('celia runner started (local) — $0');
        return;
      }
      if (args[0] === 'connect') {
        // تحقق حقيقي: مصادقة GitHub + صلاحية المستودع وصلاحيات الاعتماد عليه — دون طباعة السر أبدًا.
        const rest = args.slice(1);
        const json = rest.includes('--json');
        const repoArg = rest.find((a) => !a.startsWith('--'));
        const fromEnv = githubTransportFromEnv();
        if (!fromEnv) {
          console.log('github: NOT CONNECTED — no credential found');
          console.log('set GH_TOKEN (or GITHUB_TOKEN) in the environment — never commit it — then rerun: celia runner connect [owner/repo]');
          process.exitCode = 1;
          return;
        }
        let target: { owner: string; repo: string };
        try {
          target = parseOwnerRepo(repoArg);
        } catch (err) {
          console.error(err instanceof Error ? err.message : String(err));
          process.exitCode = 1;
          return;
        }
        const report = await verifyGithubConnection({ transport: fromEnv.transport, ...target });
        console.log(json ? JSON.stringify(report, null, 2) : formatConnectionReport(report, fromEnv.source));
        if (!report.connected) process.exitCode = 1;
        return;
      }
      console.log('usage: celia runner <start|connect [owner/repo] [--json]>');
      return;
    }

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
      console.log('usage: celia <mode|run [--github [--repo o/r] [--steps JSON]]|ledger|tools|models|runner connect|health|safe-mode|emergency-lock|ownership prove>');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
