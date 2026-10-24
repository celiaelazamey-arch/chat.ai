# Free Deployment Guide ($0 Policy)

> Staging checklist and approval-gated plan: [STAGING_CHECKLIST_AND_PLAN.md](STAGING_CHECKLIST_AND_PLAN.md). Operational examples: [STAGING_RUNBOOK.md](STAGING_RUNBOOK.md). Neither document performs remote actions.

## Deployment Routes
1. **Local Micro-Mode (`Celia Mode: local`)**: Executed locally using embedded runtimes and `MockProvider`.
2. **Isolated OCI Container**: Sandbox container execution verified in isolated environments.
3. **Cloud Free-Tier**: Deployed on zero-cost cloud providers within baseline quotas.

## Zero-Cost ($0) Policy
* Builds and tests rely strictly on `MockProvider` and local implementations.
* No paid API keys or cloud credentials are required during build, test, or deployment phases.

## Offline Verification
Verify offline compliance using isolated network flags:
```bash
docker run --rm --network none celia-agent:latest
```