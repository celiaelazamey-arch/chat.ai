import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, it, expect, vi } from 'vitest';
import type { GitHubRequestOptions, GitHubResponse, GitHubTransport } from '@aok/github';
import { createGithubRunner } from './github-runner';
import {
  assertInteractiveTerminalForGithubWrites,
  buildGithubRunPlan,
  createInteractiveApproval,
  createStdinInteractiveApproval,
  hasGithubWriteSteps,
  parseGithubSteps,
  summarizeGithubOutput,
} from './github-run';

describe('celia run --github argument and plan parsing', () => {
  it('uses a read-only inspection plan by default', () => {
    const plan = buildGithubRunPlan(['--github', '--repo', 'o/r', 'inspect', 'it'], {});

    expect(plan).toMatchObject({ owner: 'o', repo: 'r', intent: 'inspect it' });
    expect(plan.steps.map((step) => step.action)).toEqual(['github.repo.read', 'github.repo.file.read']);
    expect(hasGithubWriteSteps(plan.steps)).toBe(false);
  });

  it('uses repository defaults/overrides and supports --repo=owner/repo', () => {
    expect(buildGithubRunPlan(['--github'], {})).toMatchObject({ owner: 'elazamey', repo: 'chat.ai' });
    expect(buildGithubRunPlan(['--github'], { CELIA_E2E_OWNER: 'me', CELIA_E2E_REPO: 'mine' })).toMatchObject({
      owner: 'me',
      repo: 'mine',
    });
    expect(buildGithubRunPlan(['--github', '--repo=o/r'], {})).toMatchObject({ owner: 'o', repo: 'r' });
  });

  it('accepts explicit steps restricted to the seven GitHub actions', () => {
    const plan = buildGithubRunPlan(
      [
        '--github',
        '--repo',
        'o/r',
        '--steps',
        JSON.stringify([{ action: 'github.repo.read', input: { owner: 'o', repo: 'r' } }]),
        'explicit',
        'intent',
      ],
      {},
    );

    expect(plan.intent).toBe('explicit intent');
    expect(plan.steps).toEqual([{ action: 'github.repo.read', input: { owner: 'o', repo: 'r' } }]);
    expect(parseGithubSteps('[{"action":"github.pull_request.read"}]')).toEqual([
      { action: 'github.pull_request.read', input: {} },
    ]);
  });

  it('rejects malformed, empty, or out-of-scope steps before execution', () => {
    expect(() => parseGithubSteps('not json')).toThrow('must be valid JSON');
    expect(() => parseGithubSteps('[]')).toThrow('non-empty');
    expect(() => parseGithubSteps('[{"action":"shell.execute","input":{}}]')).toThrow('must be one of');
    expect(() => parseGithubSteps('[{"action":"github.repo.read","input":[]}]')).toThrow('input must be an object');
  });

  it('rejects unknown options but preserves free-form intent after --', () => {
    expect(() => buildGithubRunPlan(['--github', '--yes'], {})).toThrow("unknown run option '--yes'");
    expect(buildGithubRunPlan(['--github', '--', '--literal-intent'], {}).intent).toBe('--literal-intent');
  });
});

describe('interactive write approval', () => {
  it('accepts only an affirmative answer, separately for each request', async () => {
    const answers = ['  YES  ', '', 'n', 'approved'];
    const ask = vi.fn(async (_prompt: string) => answers.shift() ?? '');
    const approve = createInteractiveApproval(ask);

    await expect(approve({ action: 'github.repo.file.write', reason: 'policy' })).resolves.toBe(true);
    await expect(approve({ action: 'github.git.commit', reason: 'policy' })).resolves.toBe(false);
    await expect(approve({ action: 'github.pull_request.create', reason: 'policy' })).resolves.toBe(false);
    await expect(approve({ action: 'github.repo.branch.create', reason: 'policy' })).resolves.toBe(false);
    expect(ask).toHaveBeenCalledTimes(4);
    expect(ask.mock.calls[0]?.[0]).toContain("github.repo.file.write");
  });

  it('uses stdin lines and treats EOF as denial rather than hanging', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let promptText = '';
    output.on('data', (chunk: Buffer) => {
      promptText += chunk.toString('utf8');
    });
    const session = createStdinInteractiveApproval(input, output);

    const first = session.onApprovalRequired({ action: 'github.repo.branch.create', reason: 'policy' });
    input.write('y\n');
    await expect(first).resolves.toBe(true);
    expect(promptText).toContain('github.repo.branch.create');

    const second = session.onApprovalRequired({ action: 'github.pull_request.create', reason: 'policy' });
    input.end();
    await expect(second).resolves.toBe(false);
    session.close();
  });

  it('does not print full file contents in CLI summaries', () => {
    expect(summarizeGithubOutput({ path: 'README.md', content: '12345', sha: 's' })).toBe(
      '{"path":"README.md","content":"<5 chars>","sha":"s"}',
    );
  });
});

/** أصغر نقل وهمي يكفي لإثبات خطة CLI من التحليل حتى حدود GitHub. */
class MiniGitHub implements GitHubTransport {
  requests: { method: string; path: string }[] = [];

  async request(method: string, path: string, opts?: GitHubRequestOptions): Promise<GitHubResponse> {
    this.requests.push({ method, path });
    if (method === 'GET' && path === '/repos/o/r') {
      return { status: 200, json: { full_name: 'o/r', default_branch: 'main' } };
    }
    if (method === 'GET' && path.includes('/git/ref/heads/')) {
      return { status: 200, json: { object: { sha: 'sha-main' } } };
    }
    if (method === 'POST' && path.endsWith('/git/refs')) {
      const body = opts?.body as { ref: string; sha: string };
      return { status: 201, json: { ref: body.ref, object: { sha: body.sha } } };
    }
    throw new Error(`unexpected ${method} ${path}`);
  }
}

describe('celia run --github plan through the real LocalRunner path', () => {
  const argv = [
    '--github',
    '--repo',
    'o/r',
    '--steps',
    JSON.stringify([
      { action: 'github.repo.read', input: { owner: 'o', repo: 'r' } },
      {
        action: 'github.repo.branch.create',
        input: { owner: 'o', repo: 'r', branch: 'from-cli', from: 'sha-main' },
      },
    ]),
    'run a branch step',
  ];

  it('denies the planned write when the interactive answer is no', async () => {
    const plan = buildGithubRunPlan(argv, {});
    const transport = new MiniGitHub();
    const runner = createGithubRunner({
      transport,
      onApprovalRequired: createInteractiveApproval(async () => 'n'),
    });

    expect(hasGithubWriteSteps(plan.steps)).toBe(true);
    const outcome = await runner.run(plan.intent, { steps: plan.steps });

    expect(outcome.verdict).toBe('FAILED');
    expect(transport.requests.some((request) => request.method === 'POST')).toBe(false);
  });

  it('rejects a planned write without a TTY before creating/using any GitHub transport path', () => {
    const plan = buildGithubRunPlan(argv, {});
    const transport = new MiniGitHub();

    expect(() => assertInteractiveTerminalForGithubWrites(plan.steps, false)).toThrow(
      'GitHub writes require an interactive terminal (TTY)',
    );
    expect(transport.requests).toEqual([]);
  });

  it('exits 1 at the actual CLI process boundary when stdin is a pipe, even with y queued', () => {
    const result = spawnSync(
      join(process.cwd(), 'node_modules', '.bin', 'tsx'),
      ['apps/cli/src/cli.ts', 'run', ...argv],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        input: 'y\n',
        timeout: 30_000,
        env: {
          ...process.env,
          GH_TOKEN: 'dummy-token-must-not-be-reached',
          GITHUB_TOKEN: '',
        },
      },
    );
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

    expect(result.status).toBe(1);
    expect(output).toContain('GitHub writes require an interactive terminal (TTY)');
    // يُطبع هذا السطر فقط بعد إنشاء Runner؛ غيابه يؤكد الرفض قبل مسار التنفيذ وTransport.
    expect(output).not.toContain('github.repo.read:');
  }, 35_000);

  it('allows and executes a read-only plan without a TTY', async () => {
    const plan = buildGithubRunPlan(
      [
        '--github',
        '--repo',
        'o/r',
        '--steps',
        JSON.stringify([{ action: 'github.repo.read', input: { owner: 'o', repo: 'r' } }]),
        'read only',
      ],
      {},
    );
    const transport = new MiniGitHub();
    assertInteractiveTerminalForGithubWrites(plan.steps, false);
    const runner = createGithubRunner({ transport });

    const outcome = await runner.run(plan.intent, { steps: plan.steps });

    expect(outcome.verdict).toBe('PASSED');
    expect(transport.requests).toEqual([
      { method: 'GET', path: '/repos/o/r' },
      { method: 'GET', path: '/repos/o/r/git/ref/heads/main' },
    ]);
  });

  it('executes the planned write with a simulated TTY only after an affirmative answer', async () => {
    const plan = buildGithubRunPlan(argv, {});
    assertInteractiveTerminalForGithubWrites(plan.steps, true);
    const transport = new MiniGitHub();
    const ask = vi.fn(async (_prompt: string) => 'y');
    const runner = createGithubRunner({
      transport,
      onApprovalRequired: createInteractiveApproval(ask),
    });

    const outcome = await runner.run(plan.intent, { steps: plan.steps });

    expect(outcome.verdict).toBe('PASSED');
    expect(ask).toHaveBeenCalledTimes(1);
    expect(transport.requests).toContainEqual({ method: 'POST', path: '/repos/o/r/git/refs' });
  });
});
