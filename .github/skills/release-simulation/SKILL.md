---
name: release-simulation
description: Validate and simulate a production release without deploying to an environment.
---

# Release simulation skill

1. Confirm the linked Azure Boards work item is tagged `ai-sdlc-lab`, `status:triaged`, `ready-for-building`, `ready-for-qa`, and explicitly approved with `release-to-production`.
2. Validate the main branch, not unmerged pull request code.
3. Confirm an independently approved, linked pull request was merged into the checked-out main commit.
4. Run API and automation tests, frontend lint, and the production web build.
5. Produce a manifest containing repository, commit, work item, pipeline run, UTC timestamp, and `environment: simulation`.
6. Publish the manifest and web assets as a pipeline artifact; add `released` and work item history only after validation and publication succeed.
7. Never add cloud credentials, infrastructure, or an actual deployment target.
