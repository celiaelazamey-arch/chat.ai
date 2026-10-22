import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { GITHUB_ACTIONS } from '@aok/github';
import { parseOwnerRepo } from './github-connect';
import { GITHUB_WRITE_ACTIONS } from './github-policy';
import type { ApprovalRequest, RunStep } from './local-runner';

const GITHUB_ACTION_SET: ReadonlySet<string> = new Set(GITHUB_ACTIONS);
const GITHUB_WRITE_SET: ReadonlySet<string> = new Set(GITHUB_WRITE_ACTIONS);

export interface GithubRunPlan {
  intent: string;
  owner: string;
  repo: string;
  steps: RunStep[];
}

/** خطة الفحص الافتراضية لـ`celia run --github`: قراءات فقط، بلا أي أثر كتابي. */
export function githubInspectSteps(owner: string, repo: string): RunStep[] {
  return [
    { action: 'github.repo.read', input: { owner, repo } },
    { action: 'github.repo.file.read', input: { owner, repo, path: 'README.md' } },
  ];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * يحلّل خطوات JSON صريحة من --steps ويقيّدها حصريًا بعمليات GitHub السبع.
 * كل خطوة ما تزال تمر لاحقًا عبر منح الـPolicy ومخططات الإضافة والـImmune Gate.
 */
export function parseGithubSteps(value: string): RunStep[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('--steps must be valid JSON: an array of {action, input} objects');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('--steps must be a non-empty JSON array of {action, input} objects');
  }

  return parsed.map((entry, index) => {
    if (!isPlainObject(entry)) throw new Error(`--steps[${index}] must be an object`);
    const action = entry.action;
    if (typeof action !== 'string' || !GITHUB_ACTION_SET.has(action)) {
      throw new Error(`--steps[${index}].action must be one of: ${[...GITHUB_ACTIONS].join(', ')}`);
    }
    const input = entry.input ?? {};
    if (!isPlainObject(input)) throw new Error(`--steps[${index}].input must be an object`);
    return { action, input };
  });
}

function optionValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

/**
 * يبني خطة `celia run --github [--repo owner/repo] [--steps JSON] [intent...]`.
 * غياب --steps يعني فحصًا قرائيًا افتراضيًا للمستودع، لا تنفيذ Smoke وهمي ولا كتابة.
 */
export function buildGithubRunPlan(args: string[], env: NodeJS.ProcessEnv = process.env): GithubRunPlan {
  let repoArg: string | undefined;
  let stepsArg: string | undefined;
  const intentParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--') {
      intentParts.push(...args.slice(i + 1));
      break;
    }
    if (arg === '--github') continue;
    if (arg === '--repo') {
      repoArg = optionValue(args, i, arg);
      i++;
      continue;
    }
    if (arg.startsWith('--repo=')) {
      repoArg = arg.slice('--repo='.length);
      if (!repoArg) throw new Error('--repo requires owner/repo');
      continue;
    }
    if (arg === '--steps') {
      stepsArg = optionValue(args, i, arg);
      i++;
      continue;
    }
    if (arg.startsWith('--steps=')) {
      stepsArg = arg.slice('--steps='.length);
      if (!stepsArg) throw new Error('--steps requires a JSON array');
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`unknown run option '${arg}' (supported: --github, --repo, --steps)`);
    intentParts.push(arg);
  }

  const { owner, repo } = parseOwnerRepo(repoArg, env);
  const steps = stepsArg === undefined ? githubInspectSteps(owner, repo) : parseGithubSteps(stepsArg);
  const intent =
    intentParts.join(' ').trim() ||
    (stepsArg === undefined
      ? `Inspect GitHub repository ${owner}/${repo}`
      : `Run explicit GitHub steps for ${owner}/${repo}`);

  return { intent, owner, repo, steps };
}

export function hasGithubWriteSteps(steps: readonly RunStep[]): boolean {
  return steps.some((step) => GITHUB_WRITE_SET.has(step.action));
}

export type ApprovalAsk = (prompt: string) => Promise<string>;

/**
 * موافقة تفاعلية حقيقية لكل عملية كتابة على حدة:
 * تُعرض العملية وسبب طلب الموافقة، ولا تُقبل إلا إجابة y/yes؛
 * الفراغ، أي إجابة أخرى، الخطأ، أو انقطاع الإدخال تعني الرفض.
 */
export function createInteractiveApproval(
  ask: ApprovalAsk,
): (req: ApprovalRequest) => Promise<boolean> {
  return async (req) => {
    let answer: string;
    try {
      answer = await ask(`Approve GitHub write '${req.action}' (${req.reason})? [y/N] `);
    } catch {
      return false;
    }
    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  };
}

export interface InteractiveApprovalSession {
  onApprovalRequired: (req: ApprovalRequest) => Promise<boolean>;
  close(): void;
}

/**
 * جلسة موافقة من stdin مع كتابة المطالبات على stderr حتى يبقى stdout للنتيجة.
 * قائمة انتظار أسطر صريحة تجعل إغلاق الإدخال/EOF حسمًا فوريًا بالرفض لا تعليقًا.
 */
export function createStdinInteractiveApproval(
  input: Readable = process.stdin,
  output: Writable = process.stderr,
): InteractiveApprovalSession {
  const rl = createInterface({ input, terminal: false });
  const lines: string[] = [];
  const waiters: Array<(line: string) => void> = [];
  let closed = false;

  rl.on('line', (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else lines.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length > 0) waiters.shift()?.('');
  });

  const ask: ApprovalAsk = async (prompt) => {
    output.write(prompt);
    const queued = lines.shift();
    if (queued !== undefined) return queued;
    if (closed) return '';
    return new Promise<string>((resolve) => waiters.push(resolve));
  };

  return {
    onApprovalRequired: createInteractiveApproval(ask),
    close: () => rl.close(),
  };
}

/** ملخص آمن للمخرجات في CLI: لا يُطبع محتوى ملف كامل، فقط طوله وبقية البيانات الوصفية. */
export function summarizeGithubOutput(output: unknown): string {
  if (isPlainObject(output) && typeof output.content === 'string') {
    return JSON.stringify({ ...output, content: `<${output.content.length} chars>` });
  }
  return JSON.stringify(output) ?? String(output);
}
