---
description: Review ready Azure Boards work items and recommend a local Copilot or human lane.
---

Review open work items tagged `ai-sdlc-lab`, `status:triaged`, and `ready-for-building`. Rank priority first, then complexity, then age. Select at most one work item per tool and custom-agent lane:

- High-complexity full-stack: `agent:vscode` and a human maintainer using the `fullstack` agent in VS Code.
- Low-complexity frontend: `agent:vscode` using the frontend custom agent.
- Documentation-only: `agent:vscode` using the documentation custom agent.
- Script or workflow: `agent:copilot-cli` and a human maintainer using Copilot CLI.
- Logging or low-complexity backend fix: `agent:vscode` using the clean-code custom agent.
- Ambiguous or risky work: `agent:human`.

Explain the route and custom agent in work item history. Never begin Copilot implementation until a human adds `develop-with-ai`. Do not route work items already tagged `ready-for-qa` or `released`. Routing is a recommendation, not an assignment or remote agent start. A human starts the `clean-code` and `qa` agents locally and obtains an independent Azure Repos review.
