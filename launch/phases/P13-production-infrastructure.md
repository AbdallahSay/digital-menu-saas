# P13 — Production infrastructure (prepared, not deployed)

> ملخص: كل اللي محتاجينه علشان نرفع على سيرفر حقيقي: Docker، شهادة HTTPS، تخزين الصور، نسخ احتياطي، مراقبة، وخطوات نشر مكتوبة. من غير ما ننشر فعلًا.

Depends on: P02, P12 · Decisions: D1, D2, D3, D8 · Size: large

## Scope
1. Dockerfiles (multi-stage, non-root, pinned digests) for the API and the Angular SSR server;
   `deploy/docker-compose.yml` with Caddy (TLS, HSTS, CSP, security headers, strips inbound forwarding
   headers, routes `/api` + `/media` -> API, everything else -> SSR), SQL Server with a named volume,
   health checks, restart policies, resource limits.
2. `IImageStorage` S3-compatible adapter per D2 (private bucket, presigned or proxied delivery consistent
   with P02 URLs), configuration by environment variables only, local adapter kept for development.
3. Data Protection keys persisted and protected (shared across restarts), production logging without PII,
   correlation IDs, `/healthz` + `/readyz`.
4. Backups: nightly SQL backup to off-server storage with retention, plus a written restore drill
   executed against a local container (evidence in verification).
5. Migrations: idempotent script generated in CI as an artifact; applied manually by the owner per runbook.
6. `deploy/RUNBOOK-AR.md`: server sizing, first-time setup, secrets, DNS, first admin bootstrap
   (out-of-band password, forced rotation), deploy, rollback, restore, monitoring (uptime check + alerts).
7. GitHub Actions: build and push images on tag; deploy job behind a protected environment requiring
   manual approval. Do not run it.

## Acceptance criteria
- `docker compose up` locally serves the full app over HTTPS (local CA) with real SQL and S3-compatible
  storage (MinIO in compose for local only); e2e smoke passes against it.
- Restore drill restores a backup into a fresh container and the menu renders.
- No secret in the repo; `docker image` scan has no critical findings.

## Never
Create cloud resources, DNS records or run the deploy job. The owner does that in P16.
