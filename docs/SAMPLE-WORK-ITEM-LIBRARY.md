# Sample Azure Boards work item library

Choose one example for an individual run. Create it as the indicated Agile **User Story** or **Bug**, add `ai-sdlc-lab`, and run **Northstar Boards**. Facilitators can create several examples to compare the selected tool and custom-agent lanes.

## Full-stack - VS Code Copilot with `fullstack`

**Type:** User Story

**Title:** Let guests amend booking dates

**Description:** Guests currently cancel and recreate a booking when travel dates change. Update the React page, .NET API, and SQLite database so guests can change dates without losing the room.

**Acceptance Criteria:**

- Existing booking dates can be edited from the bookings list.
- Check-out remains after check-in and check-in is not in the past.
- Conflicting dates return a clear message without changing the database.
- The new total uses the nightly price and updated night count.
- API integration tests cover successful and conflicting amendments.

**Constraints:** Preserve inclusive check-in and exclusive check-out behavior. Do not add authentication or a new UI framework.

**Expected evidence:** `area:full-stack`, `complexity:high`, and, after approval and routing, `agent:vscode` with role `fullstack`.

## Frontend - VS Code Copilot with `frontend`

**Type:** User Story

**Title:** Show an occupancy badge on each room

**Description:** Update the React room page so guests can tell whether a room suits their party. Reuse the existing room-card capacity value and styles.

**Acceptance Criteria:**

- Capacity 1 shows `Solo`.
- Capacity 2 shows `Couples`.
- Capacity 3 or more shows `Family`.
- The badge is readable on mobile and by a screen reader.

**Expected evidence:** `area:frontend`, `complexity:low`, and, after approval and routing, `agent:vscode` with role `frontend`.

## Script - Copilot CLI

**Type:** User Story

**Title:** Add a safe local database reset script

**Description:** Workshop attendees need a PowerShell script to reset only the local hotel database. Restarting the API should let the existing seeder recreate the rooms.

**Acceptance Criteria:**

- The script resolves the database path from the repository root.
- It refuses paths outside the API project.
- It removes only known SQLite database and sidecar files.
- Documentation includes the exact command and a data-loss warning.

**Constraints:** Support Windows PowerShell. Do not delete directories or use wildcard deletion.

**Expected evidence:** `area:automation`, `kind:script`, and, after approval and routing, `agent:copilot-cli`.

## Logging - VS Code Copilot with `clean-code`

**Type:** Bug

**Title:** Booking cancellation outcomes are not logged

**Repro Steps:** Cancel an existing booking, then request a nonexistent booking. Inspect the API logs. Neither outcome produces a structured diagnostic event.

**Acceptance Criteria:**

- A successful cancellation logs the booking ID and room ID without guest personal data.
- A missing booking logs the requested ID.
- HTTP behavior remains 204 for success and 404 when missing.
- Tests prove both HTTP outcomes.

**Expected evidence:** `area:backend`, `kind:logging`, `complexity:low`, and, after approval and routing, `agent:vscode` with role `clean-code`. Put no guest names or contact details in the work item.

## Documentation - VS Code Copilot with `documentation`

**Type:** User Story

**Title:** Add a guest cancellation troubleshooting section

**Description:** Documentation should explain successful and missing cancellations in guest-facing language.

**Acceptance Criteria:**

- Explain both outcomes and a next action.
- Match the implementation's status names.
- Include expected evidence and one recovery action.
- Do not include tokens, personal identifiers, or environment-specific URLs.

**Expected evidence:** `area:documentation`, `kind:docs`, and, after approval and routing, `agent:vscode` with role `documentation`.

## If a route differs

Confirm the work item text contains the example's signals and `ai-sdlc-lab`. Run `triage`, add `ready-for-building` after review, then run `route`. A higher-ranked work item can occupy the same tool-and-role lane. If the scope changed, clear the existing approval tags and `status:triaged` before re-triage.
