export interface ExplicitGithubE2ETarget {
  owner: string;
  repo: string;
}

/** No repository defaults: a real E2E run must name its target explicitly. */
export function explicitGithubE2ETarget(
  owner: string | undefined,
  repo: string | undefined,
): ExplicitGithubE2ETarget | undefined {
  const normalizedOwner = owner?.trim();
  const normalizedRepo = repo?.trim();
  if (!normalizedOwner || !normalizedRepo) return undefined;
  return { owner: normalizedOwner, repo: normalizedRepo };
}
