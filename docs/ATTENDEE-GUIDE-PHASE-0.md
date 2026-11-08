# Attendee guide - Setup and Phase 0

## Mission

Start with an empty Azure Repos repository and deliver one Northstar Hotel requirement through:

`Work item -> triage -> human approval -> route -> implementation -> human review -> QA -> simulated release`

The [workflow reference](WORKFLOW.md) describes the gates. Complete the administrator setup before the 90-minute clock starts.

## Before the clock - Administrator setup

### A. Prerequisites and project

1. Use **Azure DevOps Services** with permission to create an Agile-process project, Azure Repos repository, pipelines, branch policies, and a protected variable group. Arrange a second human reviewer and access to Microsoft-hosted pipeline parallelism; a new organization may need to request a hosted parallel job.
2. Install Git, VS Code, GitHub Copilot access in VS Code, Node.js 22.12 or later in the 22.x line, the .NET 10 SDK, and the .NET 8 runtime or SDK. The sample targets .NET 8; the .NET 10 SDK reads the solution format.
3. Create a project using the **Agile** process and an empty Git repository whose default branch will be `main`. Enable Boards, Repos, and Pipelines. This kit queries Agile **User Story** and **Bug** work items. Configure bugs to appear with requirements on the board if you plan to use the bug example.
4. Ensure the project and Microsoft-hosted agents can reach the package feed configured by the kit's `.npmrc`. Do not bypass organization package-security controls.

For the complete reference application, the [dev container option](../README.md#run-in-a-dev-container) replaces the local Node.js and .NET installs. It requires Docker and the VS Code Dev Containers extension; run the version checks below in the container terminal. The empty-repository kit copy in section B continues to use the host toolchain.

**Expected evidence:** the Azure DevOps project opens with Boards, Repos, and Pipelines; `dotnet --list-sdks` includes 10, `dotnet --list-runtimes` includes `Microsoft.AspNetCore.App 8`, and `node --version` reports at least 22.12 in the 22.x line.

**Recovery:** request the missing project permission, runtime, hosted parallelism, or approved feed access from the facilitator before starting the timer.

### B. Copy the kit into the empty repository

Replace both placeholders with the clone URLs supplied by your facilitator. Authenticate with your normal Git credential manager; do not put a token in a URL.

```powershell
New-Item -ItemType Directory northstar-hotel | Out-Null
Set-Location northstar-hotel
git init -b main
git remote add origin <AZURE_REPOS_CLONE_URL>
git remote add workshop <KIT_REPOSITORY_CLONE_URL>
git fetch workshop main
git checkout workshop/main -- .azuredevops .github .vscode .editorconfig .gitignore .npmrc azure-pipelines.yml
git add .
git commit -m "Add Azure DevOps AI SDLC kit"
git push -u origin main
code .
```

Use the guide from the facilitator's copy of the kit; the command intentionally does not copy the reference application or its documentation. `.github` remains because VS Code discovers the repository's Copilot customizations there; it does not enable GitHub Actions.

**Expected evidence:** `main` contains `.azuredevops`, `.github`, `.vscode`, the configuration files, and `azure-pipelines.yml`, but no `src` folder. `npm config get registry` reports the feed in `.npmrc`.

**Recovery:** if the fetch fails, ask for the correct kit clone URL or copy those exact paths from the supplied kit. Do not copy an existing database or application into the empty repository.

### C. Isolate the board automation credential

The board and release pipelines need to update Azure Boards; ordinary CI must not receive that authority.

1. Use a dedicated, short-lived Azure DevOps identity restricted to this project. Grant it **View work items in this node** and **Edit work items in this node** on the lab area, permission to create tag definitions, and read access to the repository.
2. In **User settings > Personal access tokens**, create a short-lived token for that identity and organization with only **Work Items: Read & write** and **Code: Read** scopes. Follow your organization's credential policy.
3. In **Pipelines > Library**, create a variable group named `ai-sdlc-board`. Add a secret variable named `ADO_AUTOMATION_TOKEN` and paste the token. Never write it into a work item, prompt, screenshot, command, or file.
4. Restrict the variable group's user permissions to administrators. Do not enable access for all pipelines. In **Approvals and checks**, add a **Branch control** check that allows only `refs/heads/main`, requires branch protection, and fails when protection cannot be verified.
5. In **Project settings > Pipelines > Settings**, limit job authorization to the current project. On the lab area's security settings, deny **Edit work items in this node** to the project Build Service identity if it inherits that permission. The dedicated token identity is separate and retains its narrowly scoped work item permissions.

The protected token is used only by the board pipeline and the release pipeline's separate verification/finalization jobs. The build job executes application and package code on a fresh Microsoft-hosted agent without that token. Do not use a persistent self-hosted agent for these privileged jobs.

**Expected evidence:** the variable group displays `ADO_AUTOMATION_TOKEN` as a secret, has the branch check, and is not open to all pipelines. The ordinary Build Service cannot edit lab work items.

**Recovery:** if the organization blocks PATs, hosted agents, or protected-resource checks, stop and ask an administrator for an approved equivalent. Do not work around the protections by exposing a broader token to CI.

### D. Create the pipelines and protect `main`

1. Under **Pipelines > New pipeline**, choose **Azure Repos Git**, the new repository, and **Existing Azure Pipelines YAML file** on `main`. Create these three pipelines, saving each without running it if the UI offers that option:

   | Suggested name | YAML file |
   | --- | --- |
   | Northstar CI | `/azure-pipelines.yml` |
   | Northstar Boards | `/.azuredevops/pipelines/boards.yml` |
   | Northstar Release Simulation | `/.azuredevops/pipelines/release.yml` |

2. In the `ai-sdlc-board` variable group's **Pipeline permissions**, explicitly authorize **Northstar Boards** and **Northstar Release Simulation** only. Do not authorize **Northstar CI**.
3. In **Repos > Branches**, open `main` **Branch policies**. Require at least one reviewer and leave **Allow requestors to approve their own changes** disabled. Reset reviewer votes when new changes are pushed, and require linked work items. Turn on **Limit merge types** and allow only **Basic merge (no fast-forward)** so the release check has a merge commit to verify. Add **Northstar CI** as a required **Build validation** policy. Do not grant attendees policy-bypass permission.
4. Set an appropriate pipeline retention policy, such as seven days, for the simulated release artifact. Confirm the board pipeline's YAML schedule is enabled and no UI schedule overrides it.

Azure Repos PR validation is started by the **branch policy**, not a YAML `pr` trigger. The initial CI run may fail because the application has not been generated yet; the baseline PR in Phase 1 supplies it.

**Expected evidence:** the three pipelines exist; only the two board/release pipelines can use the variable group; and `main` shows required review, linked-work-item, and build-validation policies.

**Recovery:** if a pipeline cannot use the variable group, authorize that exact pipeline and inspect its branch-control check. If a PR does not start CI, inspect the `main` build-validation policy.

### E. Smoke-test Azure Boards and prepare the baseline

1. In **Boards > Work Items**, create an Agile **User Story** titled `Bootstrap Northstar Hotel`.
2. In **Description**, describe the React page, .NET API, SQLite database, and booking rules. Add at least four testable **Acceptance Criteria**. Add the exact tag `ai-sdlc-lab`.
3. Run **Northstar Boards** on `main` with **Board action** set to `all`. The scheduled run is daily at 07:00 UTC, but a manual run avoids waiting during the lab.
4. Refresh the work item. Check for `status:triaged`, one each of `area:*`, `kind:*`, `priority:*`, and `complexity:*`, and an **Automated triage** entry in History. No approval or agent starts automatically.

**Expected evidence:** the work item is triaged and remains in its normal Agile state. The board pipeline succeeds and its log identifies the work item.

**Recovery:** check the exact `ai-sdlc-lab` tag, the pipeline's protected `main` branch, its variable-group authorization, and the token identity's work item permissions. After the lab, revoke the token and remove the secret.

## Phase 0 - Ready check (0-10 minutes)

Open the empty repository in VS Code. Confirm the Copilot agent picker offers the repository's `fullstack`, `frontend`, `clean-code`, `documentation`, and `qa` agents.

**Checkpoint:** the bootstrap work item is triaged; a second reviewer is available; and the repository, three pipelines, protected variable group, and `main` branch policies are ready.

**Recovery:** reload VS Code after opening the repository root. Ask the facilitator to resolve missing permissions or hosted capacity before Phase 1.
