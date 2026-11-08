---
applyTo: "azure-pipelines.yml,.azuredevops/pipelines/**/*.yml,.azuredevops/scripts/**/*.js"
---

# Automation instructions

- Preserve the human gates: `ready-for-building`, `develop-with-ai`, `ready-for-qa`, and `release-to-production`.
- Use a protected, least-privilege Azure DevOps credential only in trusted main-branch jobs. Never run application or pull request code in a job containing that credential.
- Restrict work item automation to the exact `ai-sdlc-lab` tag, preserve unrelated tags, and use revision checks for writes.
- Route tags recommend human-led local tools; they do not assign or start a cloud agent.
- A release remains a simulation that validates an approved merged pull request, runs tests, and uploads an artifact. Do not add a cloud deployment.
- Add deterministic tests when classification, ranking, routing, or release gates change.
