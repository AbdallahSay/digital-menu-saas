# Launch decisions

Owner decisions that phases depend on. `/nextphase` asks for any decision a phase
needs while its status is `open`, records the answer here inside that phase's PR,
and never guesses. Status values: `open` | `decided`.

| ID | Status | Question | Recommended default | Owner answer |
| --- | --- | --- | --- | --- |
| D1 | open | Production hosting (P0). Node SSR + .NET API + SQL Server behind one HTTPS origin. | One VPS near Egypt (EU/Middle East region) running Docker Compose: Caddy -> Angular SSR + .NET API + SQL Server. Enough for the first 50-100 restaurants. | |
| D2 | open | Production image storage. | S3-compatible object storage (e.g. Cloudflare R2) behind a CDN, via a new `IImageStorage` adapter. | |
| D3 | open | Email provider for onboarding links / password reset. | Launch without email: platform admin copies the one-time onboarding link and sends it on WhatsApp. Add a transactional email provider later. | |
| D4 | open | Pricing and billing. | Manual collection (InstaPay / Vodafone Cash). Add admin-only `PlanName` + `PaidUntilUtc`; suspension stays a manual admin action. No automated billing. | |
| D5 | open | Free trial. | 14 days free; the admin provisions the restaurant and helps enter the first 10 dishes. | |
| D6 | open | Public themes. | Two themes only: `grill` (accent #0F766E) and `cafe` (accent #6B402B), plus the owner's primary color from the Figma brand palette. | |
| D7 | open | Ad tracking on the marketing page. | No Facebook Pixel at launch: WhatsApp CTA links with UTM parameters. If a Pixel is approved later: marketing page only, after cookie consent, never on /r, /m, /admin or /platform. | |
| D8 | open | Brand name and production domain (printed QR codes depend on it forever). | Pick one name (Figma uses both "منيو برو" and "MenuSaaS") and register the domain before printing any QR. | |
| D9 | decided | Governance. | Claude Code is the single implementer on the launch track; one PR per phase; review by Claude subagents + owner; owner merges. | Approved by choosing the /nextphase workflow. |
| D10 | open | GitHub write access for Claude. | Run Claude Code locally on the owner's machine with `gh auth login`, or install the Claude GitHub App on the repository. | |
| D11 | open | Unavailable (sold-out) dishes. PRD hides them; Figma OWNER-PUBLISH shows them with a "نفد" badge. | Show published-but-unavailable dishes with a "نفد" badge and no price emphasis; still hide unpublished/deleted ones. Requires a PRD + F09 contract update. | |
