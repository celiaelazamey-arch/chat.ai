import { describe, expect, it } from 'vitest';
import { explicitGithubE2ETarget } from './github-e2e-config';

describe('explicit GitHub E2E target safety', () => {
  it('refuses missing or blank owner/repo rather than using a default repository', () => {
    expect(explicitGithubE2ETarget(undefined, undefined)).toBeUndefined();
    expect(explicitGithubE2ETarget('owner', undefined)).toBeUndefined();
    expect(explicitGithubE2ETarget('   ', 'repo')).toBeUndefined();
    expect(explicitGithubE2ETarget('owner', '  ')).toBeUndefined();
  });

  it('trims and returns an explicitly configured owner and repository', () => {
    expect(explicitGithubE2ETarget(' owner ', ' repo ')).toEqual({ owner: 'owner', repo: 'repo' });
  });
});
