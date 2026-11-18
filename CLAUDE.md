# MenuSaaS — Claude Code

@AGENTS.md

## Launch track (owner-approved, decision D9)

- Work is driven by `/nextphase`. The roadmap lives in `launch/state.json`, phase specs in
  `launch/phases/`, owner decisions in `launch/DECISIONS.md`, evidence in `launch/verification/`.
  `/phase-status` shows progress. Owner-facing guide: `launch/README.md`.
- Claude Code is the single implementer. Ignore Codex/Antigravity ownership in old issues and
  `automation/tasks.json`; the safety rules in AGENTS.md still apply in full.
- One phase per branch `claude/<id>-<slug>` and one PR. Never merge, never push to main.
- Evidence = `launch/verification/<id>.md` (commands + exit codes + NOT RUN). It replaces the
  long per-feature verification reports used earlier.
- Talk to the owner in Egyptian Arabic. Code, identifiers, commits, PRs and API terms in English.

## Design source of truth

- Figma file key `8kUunvUTX27tuIJcWLrXDe`. Approved direction: pages 01–03 + "Premium v2"
  (handoff on page 22, node 225:3). Page 06 (node 55:2) holds every MVP screen at 390 and 1440 px.
  Read frames through the Figma MCP before building a screen (`/figma-screen <node>`).
- Tokens: `frontend/design/tokens.css` / `tokens.json`. Themes: `grill` accent #0F766E,
  `cafe` accent #6B402B. Semantic status colors never reuse brand colors.
- Responsive contract: 320, 360, 375, 390, 412, 430, 768, 1024, 1440 px. RTL Arabic first.

## Architecture reminders

- Backend: .NET 10 minimal APIs in `backend/src/DigitalMenu.Api/<Area>/`, EF Core 10 + SQL Server,
  tenant access only through `ITenantDataSession` / `ITenantContext`. Additive migrations only.
- Frontend: Angular 22 standalone. `/r/:slug` SSR + hydration, marketing prerendered,
  `/admin` and `/platform` CSR + noindex. SSR talks to the API via trusted `PUBLIC_API_ORIGIN`.
- Public visibility: restaurant Active + published; category published + not deleted;
  item published + not deleted (+ available unless D11 says otherwise).

## Commands

- Full checklist: `/verify`.
- Backend: `dotnet restore backend/DigitalMenu.slnx --locked-mode && dotnet build backend/DigitalMenu.slnx -c Release --no-restore`
  then SQL tests with `F02_SQL_CONNECTION` set (see `/verify`).
- Frontend (in `frontend/`): `npm ci && npm run lint && npm test -- --watch=false && npm run build`;
  public routes also `npm run test:html`, `npm run test:security`, `npm run test:e2e`, `npm run test:lighthouse`.
