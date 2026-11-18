---
description: Run the real build, lint, test and audit checks for what changed and record exact exit codes
---

Run the checks that cover the current branch's changes (`git diff --name-only origin/main...HEAD`).
Record every command with its exit code. Never report a check as passed unless it ran and exited 0.

## Backend (any change under backend/)

```bash
dotnet tool restore
dotnet restore backend/DigitalMenu.slnx --locked-mode
dotnet build backend/DigitalMenu.slnx -c Release --no-restore
dotnet format backend/DigitalMenu.slnx --verify-no-changes --no-restore
dotnet ef migrations has-pending-model-changes --project backend/src/DigitalMenu.Infrastructure
dotnet list backend/DigitalMenu.slnx package --vulnerable --include-transitive
```

SQL-backed tests need a disposable SQL Server (same image as CI):

```bash
export MSSQL_SA_PASSWORD="Local!$(openssl rand -hex 16)"
docker run -d --name dm-sql -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD -p 127.0.0.1:1433:1433 \
  mcr.microsoft.com/mssql/server@sha256:2b5b581621126574f3d1f75e78d3eebe8d05aedb59ad0cfdf9aa42cb0634d726
# wait for "SQL Server is now ready for client connections" in `docker logs dm-sql`
export F02_SQL_CONNECTION="Server=localhost,1433;User ID=sa;Password=$MSSQL_SA_PASSWORD;Encrypt=false"
dotnet test backend/DigitalMenu.slnx -c Release --no-build
docker rm -f dm-sql
```

If Docker is unavailable, mark SQL tests NOT RUN and rely on the `sql-integrity` CI job.

## Frontend (any change under frontend/)

```bash
cd frontend
npm ci
npm audit --audit-level=high
npm run lint
npm test -- --watch=false
npm run build
npm run test:design
npm run test:security
```

Public routes (/r, /m, sitemap, robots, marketing) also need the SEO/SSR gates:
`npm run test:html`, `npm run test:e2e`, and `npm run test:lighthouse` (mobile performance
median must stay >= 90; SEO, accessibility and best practices stay at their current level).
The full SQL -> API -> SSR harness runs through
`S01_FRONTEND_GATES=1 dotnet test backend/DigitalMenu.slnx -c Release --no-build --filter FullyQualifiedName~PublicSsrTests`.

## Always

- `git diff --check`
- Search the diff for secrets, connection strings, tokens and real emails; there must be none.
- Summarize results as a table: check | command | exit code | notes.
