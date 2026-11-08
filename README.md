# Human-governed AI SDLC on Azure DevOps

Build and operate a small hotel booking system while Azure Boards, Azure Repos, Azure Pipelines, VS Code, and GitHub Copilot move a requirement from intake to a simulated production release.

This repository is both the **reference implementation** and the **automation kit** for a self-led 90-minute lab. Attendees begin with an empty Azure Repos repository, copy the kit, and use Copilot to create the application and deliver a change.

## What the lab proves

- Azure Boards work items are classified and ranked with explainable automation.
- A person approves scope with `ready-for-building` and AI-assisted work with `develop-with-ai`.
- Azure Pipelines recommends a human-led VS Code, Copilot CLI, or human lane; it does not start a remote agent.
- An Azure Repos pull request links to its work item, passes branch-policy validation, and receives independent human review and local Copilot-assisted QA.
- A person adds `ready-for-qa` and `release-to-production`; a separate pipeline verifies the merged pull request, tests `main`, and publishes an artifact without deploying.

Azure Repos does not provide the GitHub-hosted Copilot coding agent or automatic Copilot PR review used by the former GitHub workflow. Copilot remains available locally in VS Code or the CLI. See the [workflow reference](docs/WORKFLOW.md) for the exact gates and security boundaries.

## Reference application

Northstar Hotel is a small vertical slice with an ASP.NET Core 8 minimal API, EF Core and SQLite, a React/TypeScript/Vite client, and xUnit integration tests. It supports availability, bookings, conflict prevention, and cancellation.

### Run locally

Install the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) and the .NET 8 runtime (or .NET 8 SDK), [Node.js 22.12 or later in the 22.x line](https://nodejs.org/), Git, and VS Code. The application targets .NET 8; the newer SDK is needed for `HotelBooking.slnx`.

Terminal 1:

```powershell
dotnet run --project src\HotelBooking.Api --urls http://localhost:5050
```

Terminal 2:

```powershell
Set-Location src\hotel-booking-web
npm ci
npm run dev
```

Open `http://localhost:5173`. The API creates `hotel-booking.db` on first run and idempotently seeds six rooms.

### Run in a dev container

Install Docker Desktop (or a compatible Docker engine) and the VS Code **Dev Containers** extension. With Docker running, open this repository and run **Dev Containers: Reopen in Container** from the Command Palette.

The [dev container configuration](.devcontainer/devcontainer.json) installs the .NET 10 and .NET 8 SDKs and Node.js 22, and restores the API and web dependencies automatically. Run **Terminal > Run Task > app: run**, then open `http://localhost:5173`. Ports `5050` and `5173` are forwarded to the host.

**Recovery:** confirm Docker is running, then run **Dev Containers: Rebuild Container** if setup fails.

### Validate

```powershell
dotnet test HotelBooking.slnx
node --test .azuredevops\scripts\automation.test.js
Set-Location src\hotel-booking-web
npm run lint
npm run build
```

## Start the lab

1. Attendees, facilitators, and project administrators: complete [Setup and Phase 0](docs/ATTENDEE-GUIDE-PHASE-0.md).
2. Continue with [Phases 1 to 7](docs/ATTENDEE-GUIDE-PHASE-1-TO-7.md).
3. Use the [workflow reference](docs/WORKFLOW.md) and [sample work item library](docs/SAMPLE-WORK-ITEM-LIBRARY.md) during the lab.

The pipelines target **Azure DevOps Services**, not Azure DevOps Server. Triage and release use a protected, least-privilege credential; validation does not deploy or provision cloud resources.
