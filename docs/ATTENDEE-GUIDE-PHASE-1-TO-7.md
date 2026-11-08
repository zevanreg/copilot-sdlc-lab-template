# Attendee guide - Phases 1 to 7

Complete [Setup and Phase 0](ATTENDEE-GUIDE-PHASE-0.md) before starting this guide.

## Phase 1 - Let VS Code Copilot create the baseline (10-30 minutes)

**Outcome:** the hotel application runs locally and is merged through an Azure Repos pull request.

1. On the triaged `Bootstrap Northstar Hotel` work item, review the scope and add `ready-for-building` and `develop-with-ai`. Set its Agile state to **Active**.
2. In the repository terminal, run `git switch -c feature/baseline`. In VS Code Copilot Chat, select the repository's **fullstack** agent. Provide the sanitized work item title, description, acceptance criteria, and confirmation that a human added both approval tags; the kit does not assume an Azure DevOps connection in Copilot. Then paste:

   ```text
   Implement the approved Bootstrap Northstar Hotel Azure Boards work item.
   Create HotelBooking.slnx, src/HotelBooking.Api, src/hotel-booking-web,
   and tests/HotelBooking.Api.Tests using the repository instructions.

   Use the frontend-design skill. First propose a compact visual plan for a
   boutique hotel: harbour green, warm coral, off-white space, restrained
   serif headings, compact room cards, and a prominent availability search.
   Keep the interface responsive and accessible, with clear loading, empty,
   validation, success, and error states. Avoid new UI or state frameworks.

   Build a .NET 8 minimal API with EF Core SQLite and an idempotent six-room
   seeder. Build a React TypeScript Vite client that lists and searches rooms,
   creates and lists bookings, and cancels bookings. Enforce all booking rules
   at the API boundary and add xUnit integration tests. Generate a package
   lock file, inspect desktop and mobile layouts, and run tests, lint, and
   production builds. Do not add authentication or a cloud deployment.
   ```

3. Review the visual plan and accept focused changes. Run **Terminal > Run Task > app: run** or the local commands in the reference README. Book a room and confirm it is unavailable for overlapping dates.
4. Run `dotnet test HotelBooking.slnx`, `node --test .azuredevops\scripts\automation.test.js`, and the frontend `npm run lint` and `npm run build`. Fix failures rather than bypassing them.
5. Commit and push the branch. Create an Azure Repos pull request into `main` and use its **Work items** control to link the bootstrap work item. Ask the second human to review and approve; wait for **Northstar CI** to pass, then complete the PR with **Merge (no fast forward)**.
6. Confirm the code is on `main` and set the bootstrap work item to **Closed**. This bootstrap is preparation, not the simulated release exercised in Phase 6.

**Checkpoint:** the UI shows rooms, a booking persists, validation passes, and the baseline PR is linked, approved, and merged.

**Recovery:** inspect the failing CI step and ask Copilot to correct it. If the branch policy rejects the PR, link the work item and obtain the second review; do not bypass the policy.

## Phase 2 - Create workload and observe triage (30-42 minutes)

**Outcome:** Azure Boards contains a classified, visible requirement.

1. Choose one example from the [sample work item library](SAMPLE-WORK-ITEM-LIBRARY.md).
2. In **Boards > Work Items**, create the indicated **User Story** or **Bug**. Copy its description and acceptance criteria into the matching fields, and add `ai-sdlc-lab`.
3. Run **Northstar Boards** on `main` with **Board action** `all`. Refresh the work item and inspect its tags and History.
4. Find it on the team's board or in **Work Items**. Its native Agile state is still **New**; the pipeline does not move board columns.

**Checkpoint:** the item has one `area:*`, `kind:*`, `priority:*`, `complexity:*`, and `status:triaged` tag, plus an explainable triage entry.

**Recovery:** confirm the exact lab tag and Agile work item type, then inspect the board pipeline's permissions and rerun it. For a bug missing from the board, configure bugs to appear with requirements or use **Work Items**.

## Phase 3 - Exercise human governance and routing (42-52 minutes)

**Outcome:** a person approves scope before a route is recommended.

1. Review and clarify the acceptance criteria. Add `ready-for-building` only when the scope is approved.
2. Run **Northstar Boards** on `main` with **Board action** `route`.
3. Inspect the `agent:*` tag, route explanation in History, and pipeline log. Compare them with the [routing table](WORKFLOW.md#daily-routing).
4. If the requirement changes after approval, remove `ready-for-building`, `develop-with-ai`, `ready-for-qa`, `release-to-production`, and `status:triaged` as applicable. Run `triage`, review the new result, then explicitly approve again.

The router ranks priority, complexity, and age; it selects at most one item per tool and custom-agent lane on each run. Its score is an ordering value, not AI confidence. The daily schedule runs at 07:00 UTC; the manual run is for immediate workshop feedback.

**Checkpoint:** the item is approved, has exactly one route tag, and its route and score are visible. No AI implementation has started.

**Recovery:** if it is absent from the log, confirm `ai-sdlc-lab`, `status:triaged`, and `ready-for-building`, and ensure it is not already in QA or released. A higher-ranked item in the same lane may be selected instead.

## Phase 4 - Build with the selected Copilot surface (52-68 minutes)

**Outcome:** the approved work becomes a focused branch and linked pull request.

1. Assign the work item to a person and move it to **Active**. To use AI, a human must add `develop-with-ai`; this tag grants permission but does not invoke Copilot.
2. Update local `main`, create a feature branch, and choose the recommended surface:
   - `agent:vscode`: use Copilot Agent mode. The History entry names `fullstack`, `frontend`, `documentation`, or `clean-code`. Run `/implement-approved-work-item` or provide the work item and its acceptance criteria directly.
   - `agent:copilot-cli`: use Copilot CLI locally, providing the work item and sanitized acceptance criteria.
   - `agent:human`: resolve ambiguity or risk with a maintainer. If AI is subsequently used, add `develop-with-ai` first.
3. Review and validate the changes; push the branch and create an Azure Repos PR targeting `main`. Link the work item using the PR's **Work items** control. Record the outcome and review focus in the PR template.

Azure Boards' GitHub Copilot coding-agent integration requires a GitHub repository; it cannot start a coding agent for Azure Repos. This lab therefore uses local, human-led Copilot rather than pretending a remote assignment exists.

**Checkpoint:** an appropriately scoped PR is linked to the work item, and the required **Northstar CI** build is running.

**Recovery:** if the route is unsuitable, record the reason and choose a human-led alternative. If Copilot cannot access the work item, paste only the sanitized title and acceptance criteria into chat.

## Phase 5 - Review and promote to QA (68-78 minutes)

**Outcome:** evidence and independent review precede QA.

1. Wait for **Northstar CI** to pass. In VS Code, select **clean-code** and ask for a focused maintainability review of the PR; address required findings.
2. Select **qa** and ask it to compare the changes with the linked work item's acceptance criteria, run the relevant validation, and report a compact test matrix. Record the evidence in the PR.
3. Ask the second human to review and approve the PR. Address comments and rerun validation after changes. Copilot advice is not a human approval.
4. A human adds `ready-for-qa` to the work item and moves it to **Resolved** after accepting the evidence.
5. Complete the PR into `main` with **Merge (no fast forward)**. Leave any **Complete linked work items** option unchecked so the item remains in QA until release; confirm the linked work item and merged code are present.

**Checkpoint:** the PR has a linked work item, green build, independent approval, QA evidence, and a completed merge; the work item is tagged `ready-for-qa`.

**Recovery:** inspect the failed policy or CI log. If approval was reset by a new push, obtain a fresh review. Do not add `ready-for-qa` without the evidence.

## Phase 6 - Approve and simulate release (78-87 minutes)

**Outcome:** a final human decision validates the merged `main` commit and produces evidence without deployment.

1. Confirm the linked PR is completed into `main`, has an independent approval, and satisfies the acceptance criteria. A human adds `release-to-production`.
2. Run **Northstar Release Simulation** on `main`; enter the numeric work item ID as **Approved work item ID**.
3. Watch **Verify**, **Build**, and **Finalize**. Verify checks the tags, linked approved PR, and its merge commit; Build runs tests, lint, and the web build; Finalize rechecks the gates before updating the work item.
4. Open the `simulated-production-release` pipeline artifact. Inspect `manifest.json` and the `web` directory. Confirm the work item has `released` and a History entry linking to the run, then move it to **Closed**.

**Checkpoint:** the manifest names the selected `main` commit and work item, all stages pass, the artifact exists, and the work item is marked `released`.

**Recovery:** inspect the failed stage. Link and merge the independently approved PR, restore any missing human approval, or fix and merge failing tests before rerunning. If `main` advanced during the run, queue a new run at its latest commit. Never add `released` manually. A new simulation after a successful release requires removing `released` and obtaining fresh human approval.

## Phase 7 - Reflect (87-90 minutes)

Discuss where deterministic automation helped, where a human changed the decision, and what evidence supported the release. Revoke the temporary token after the event. No production resource was created or deployed.
