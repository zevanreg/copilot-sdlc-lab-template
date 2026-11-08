---
description: Verify an Azure Boards work item is ready for the simulated release pipeline.
agent: qa
---

Use the release-simulation and testing skills. Verify the linked work item is triaged and has `ready-for-building` and `ready-for-qa`, the independently approved pull request is merged into `main`, all acceptance criteria have evidence, and `main` passes API tests, automation tests, frontend lint, and frontend build. Report blockers; do not add `release-to-production` or perform a real deployment.
