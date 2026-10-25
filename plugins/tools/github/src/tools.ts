import { z } from 'zod';
import type { CapabilityExecutor, ExecutionContext } from '@aok/execution';
import type { Result } from '@aok/contracts';
import { SchemaRegistry } from '@aok/registry';
import { dispatch, GITHUB_ACTIONS, type GithubAction } from './operations';
import type { GitHubTransport } from './transport';

/** عقود الأدوات (Zod) — لا تنفيذ بدون عقد. */
const githubIssueSummarySchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullable(),
  bodyTruncated: z.boolean(),
  state: z.string(),
  url: z.string(),
  author: z.string().nullable(),
  labels: z.array(z.string()),
  updatedAt: z.string(),
});

export const GITHUB_TOOL_SCHEMAS = {
  'github.repo.read': {
    input: z.object({ owner: z.string().min(1), repo: z.string().min(1) }),
    output: z.object({
      owner: z.string(),
      repo: z.string(),
      fullName: z.string(),
      defaultBranch: z.string(),
      defaultBranchSha: z.string(),
    }),
  },
  'github.issue.list': {
    input: z.object({
      owner: z.string().min(1),
      repo: z.string().min(1),
      state: z.enum(['open', 'closed', 'all']).default('open'),
      page: z.number().int().min(1).max(1_000).default(1),
      perPage: z.number().int().min(1).max(100).default(30),
      labels: z.array(z.string().min(1).max(100)).max(10).optional(),
    }),
    output: z.object({ issues: z.array(githubIssueSummarySchema), page: z.number(), perPage: z.number() }),
  },
  'github.issue.read': {
    input: z.object({ owner: z.string().min(1), repo: z.string().min(1), number: z.number().int().positive() }),
    output: githubIssueSummarySchema,
  },
  'github.repo.branch.create': {
    input: z.object({ owner: z.string().min(1), repo: z.string().min(1), branch: z.string().min(1), from: z.string().min(1) }),
    output: z.object({ ref: z.string(), sha: z.string() }),
  },
  'github.repo.file.read': {
    input: z.object({ owner: z.string().min(1), repo: z.string().min(1), path: z.string().min(1), ref: z.string().optional() }),
    output: z.object({ path: z.string(), content: z.string(), sha: z.string() }),
  },
  'github.repo.file.write': {
    input: z.object({
      owner: z.string().min(1),
      repo: z.string().min(1),
      path: z.string().min(1),
      branch: z.string().min(1),
      content: z.string(),
      message: z.string().min(1),
    }),
    output: z.object({ commitSha: z.string(), contentSha: z.string() }),
  },
  'github.git.commit': {
    input: z.object({ owner: z.string().min(1), repo: z.string().min(1), branch: z.string().min(1), message: z.string().min(1) }),
    output: z.object({ sha: z.string() }),
  },
  'github.pull_request.create': {
    input: z.object({
      owner: z.string().min(1),
      repo: z.string().min(1),
      title: z.string().min(1),
      head: z.string().min(1),
      base: z.string().min(1),
      body: z.string().optional(),
    }),
    output: z.object({
      number: z.number(),
      url: z.string(),
      headSha: z.string(),
      headRef: z.string(),
      baseRef: z.string(),
      state: z.string(),
    }),
  },
  'github.pull_request.read': {
    input: z.object({ owner: z.string().min(1), repo: z.string().min(1), number: z.number().int().positive() }),
    output: z.object({
      number: z.number(),
      state: z.string(),
      headSha: z.string(),
      headRef: z.string(),
      baseRef: z.string(),
      title: z.string(),
      url: z.string(),
      files: z.array(z.object({ filename: z.string(), status: z.string() })),
    }),
  },
} as const;

export type GithubToolName = keyof typeof GITHUB_TOOL_SCHEMAS;

/**
 * GitHub كـplugin خارجي بالكامل:
 *   Kernel → Capability → ToolContract → GitHubAdapter → GitHub API
 * لا يكتسب الـplugin أي صلاحية بمجرد تثبيته (ATOMICITY PRINCIPLE 012):
 * كل استدعاء يمر عبر الـPolicy من الـKernel قبل الوصول إلى هنا.
 */
export class GitHubPlugin {
  readonly schemaRegistry = new SchemaRegistry();

  constructor(private transport: GitHubTransport) {
    for (const name of GITHUB_ACTIONS) {
      this.schemaRegistry.registerCapability(
        name,
        GITHUB_TOOL_SCHEMAS[name].input,
        GITHUB_TOOL_SCHEMAS[name].output,
      );
    }
  }

  /** الـCapabilityExecutor للـaction (يُسجَّل في ExecutorRegistry الخاص بالـRunner). */
  executor(action: GithubAction): CapabilityExecutor {
    return {
      canExecute: async () => Boolean(this.transport),
      execute: async (input, _ctx: ExecutionContext): Promise<Result> => {
        try {
          const parsedInput = this.schemaRegistry.validateCapabilityInput(action, input);
          const { output, evidence } = await dispatch(action, parsedInput, this.transport);
          this.schemaRegistry.validateCapabilityOutput(action, output);
          return { status: 'success', output, evidence };
        } catch (err) {
          return {
            status: 'failure',
            output: { error: err instanceof Error ? err.message : String(err) },
            evidence: [],
          };
        }
      },
    };
  }

  /** يسجّل كل عمليات GitHub في سجل المنفّذين. */
  register(registry: { register(action: string, executor: CapabilityExecutor): void }): void {
    for (const action of GITHUB_ACTIONS) {
      registry.register(action, this.executor(action));
    }
  }
}
