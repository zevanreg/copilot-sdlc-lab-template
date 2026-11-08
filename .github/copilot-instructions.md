# Northstar Hotel repository instructions

## Product intent

This repository demonstrates a human-governed AI software delivery lifecycle. Keep the sample small, understandable, local-first, and safe to complete during a 90-minute workshop.

## Architecture

- `src/HotelBooking.Api`: ASP.NET Core 8 minimal API, EF Core 8, and SQLite.
- `src/hotel-booking-web`: React, TypeScript, and Vite single-page client.
- `tests/HotelBooking.Api.Tests`: xUnit API integration tests.
- `azure-pipelines.yml` and `.azuredevops`: Azure Pipelines validation, Azure Boards triage and routing, and simulated release.
- `.github`: repository-local Copilot instructions, agents, prompts, and skills used in VS Code.
- `docs`: attendee, facilitator, setup, and lifecycle guidance.

The browser calls `/api`. In local development, Vite proxies requests to `http://localhost:5050`.

## Hotel booking rules

- A stay uses an inclusive check-in and exclusive check-out date.
- Check-out must be after check-in, and check-in cannot be in the past.
- A room cannot have overlapping bookings: `newCheckIn < existingCheckOut && newCheckOut > existingCheckIn`.
- Prices are decimal currency values. Total price is nightly rate multiplied by the number of nights.
- Validate every business rule at the API boundary even when the UI also validates it.
- Keep SQLite seeding idempotent. Never delete attendee data during normal startup.

## Change rules

1. Read the Azure Boards work item, acceptance criteria, and relevant path instructions before editing.
2. Make the smallest complete vertical change. Avoid unrelated refactors or new infrastructure.
3. Reuse existing models, contracts, styles, workflow helpers, and terminology.
4. Add or update tests for behavior changes. Do not weaken an assertion to make a test pass.
5. Update documentation when commands, behavior, configuration, or lifecycle labels change.
6. Never commit tokens, generated databases, build output, or personal information.
7. Link pull requests to their Azure Boards work item using the pull request's **Work items** control.
8. A human owns `ready-for-building`, `develop-with-ai`, `ready-for-qa`, and `release-to-production`. Routing does not start an agent.

## Validation and definition of done

Run:

```text
dotnet test HotelBooking.slnx
cd src/hotel-booking-web
npm ci
npm run lint
npm run build
```

For workflow changes also run:

```text
node --test .azuredevops/scripts/automation.test.js
```

A change is done only when acceptance criteria are met, tests and builds pass, documentation is current, and the pull request explains its outcome and review focus.
