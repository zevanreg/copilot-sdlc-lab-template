---
name: work-item-delivery
description: Deliver an approved Azure Boards work item through implementation, documentation, tests, and an Azure Repos pull request.
---

# Work item delivery skill

1. Verify the work item is triaged and approved with `ready-for-building`; AI-assisted implementation also requires `develop-with-ai`.
2. Read acceptance criteria, repository instructions, and all path-specific instructions.
3. State a short implementation plan in the pull request or agent log.
4. Implement the smallest complete change across every required layer.
5. Invoke the documentation and testing skills before opening the pull request.
6. Link the Azure Repos pull request through its **Work items** control and identify risk or review focus.
7. Do not add `ready-for-qa`; a human adds that tag after reviewing the evidence.
