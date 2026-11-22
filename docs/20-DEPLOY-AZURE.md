# 20 — Azure free-tier deploy runbook (demo)

Target shape for the demo deployment (parts 1-4, media excluded). One public
origin (Angular SSR proxies `/api` to the API, docs/09-DEVOPS), Azure SQL
Database free tier, two apps on one App Service Free (F1) Linux plan. Monthly
cost: $0 within the free allowances; see "Limits and failure modes" before
relying on it for anything but a demo.

```
browser ──https──> menusaas-web.azurewebsites.net (Node SSR, F1)
                        │ /api/* proxied with cookie/XSRF passthrough
                        ▼
              menusaas-api.azurewebsites.net (.NET 10, F1)
                        │ Pooling=false, Connect Timeout=120
                        ▼
              Azure SQL Database free tier (serverless, auto-pause)
```

## Prerequisites (operator checklist)

- Azure account (free account; card used for identity verification only).
- `az` CLI 2.6x+ (`az login`).
- A SQL login password (16+ chars), the demo owner password (12+ chars) and
  a proxy shared secret (32+ chars, e.g. `openssl rand -hex 32`). Generate
  all three fresh; store them in the vault; never commit them.
- This repo at the approved commit (parts 1-4 stack tip), built locally or in CI.

## 1. Resource group

```bash
az group create -n menusaas-demo -l westeurope
```

## 2. Azure SQL free tier

Portal-first (the CLI flag for the free offer is newer; verify with
`az sql db create --help | grep free` before scripting it):

1. Open https://aka.ms/azuresqlhub → Create → "Start free" (free offer:
   100,000 vCore-seconds + 32 GB per month, lifetime of the subscription).
2. Server: new, name `menusaas-demo-sql`, region `westeurope`,
   auth: SQL login `menusaasadmin` + the generated SQL password.
3. Database name `menusaas`. Behavior at limit: **Auto-pause** (default).
4. Firewall: add rule `allow-azure` 0.0.0.0-0.0.0.0 so App Service reaches it:
   `az sql server firewall-rule create -g menusaas-demo -s menusaas-demo-sql -n allow-azure --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0`
   (Opens to any Azure-hosted client; the strong SQL password is the barrier.
   Private endpoints need a paid tier - revisit on the paid move.)

Connection string (note Pooling=false and the long timeout):

```
Server=tcp:menusaas-demo-sql.database.windows.net,1433;Initial Catalog=menusaas;User ID=menusaasadmin;Password=<SQL_PASSWORD>;Encrypt=True;Connect Timeout=120;ConnectRetryCount=3;ConnectRetryInterval=10;Pooling=false
```

Why: the free database auto-pauses after 15 idle minutes and takes up to ~1
minute to resume. SqlClient connect-retry + a 120s timeout ride out the
resume; `Pooling=false` closes each connection so the database can actually
pause. With pooling left on, the app's idle pool pins the database awake and
the 100k vCore-second allowance (~28 vCore-hours) drains in days.

## 3. App Service plan + apps (one F1 plan, two apps)

```bash
az appservice plan create -g menusaas-demo -n menusaas-demo-plan --sku F1 --is-linux
az webapp create -g menusaas-demo -p menusaas-demo-plan -n menusaas-demo-api --runtime "DOTNETCORE:10.0"
az webapp create -g menusaas-demo -p menusaas-demo-plan -n menusaas-demo-web --runtime "NODE:24-lts"
# az webapp create defaults --https-only to false; enforce it on BOTH apps
# and verify the resource property before handover.
az webapp update -g menusaas-demo -n menusaas-demo-api --https-only true
az webapp update -g menusaas-demo -n menusaas-demo-web --https-only true
az webapp show -g menusaas-demo -n menusaas-demo-api --query httpsOnly   # expect: true
az webapp show -g menusaas-demo -n menusaas-demo-web --query httpsOnly   # expect: true
```

If either runtime name is rejected (`az webapp list-runtimes --os linux` is
the source of truth), fall back to container deploys from the two Dockerfiles
at the repo root. ghcr.io is the no-cost registry for this public repo;
Azure Container Registry is NOT free (per-day registry charge) - do not
create one for the demo. The names come from app settings below, so keep
them as created or substitute consistently.

### API app settings

```bash
az webapp config appsettings set -g menusaas-demo -n menusaas-demo-api --settings \
  ASPNETCORE_ENVIRONMENT=Production \
  ConnectionStrings__MenuDatabase='<connection string from step 2>' \
  MigrateOnStart=true \
  Media__LocalRoot=/home/media \
  Proxy__TrustPlatform=true \
  DemoSeed__Enabled=true \
  DemoSeed__OwnerEmail='<his real email>' \
  DemoSeed__OwnerPassword='<DEMO_OWNER_PASSWORD>' \
  DemoSeed__Slug=demo-restaurant \
  DemoSeed__RestaurantName='مطعم تجريبي' \
  Proxy__SharedSecret='<PROXY_SHARED_SECRET>' \
  WEBSITES_ENABLE_APP_SERVICE_STORAGE=true
az webapp config set -g menusaas-demo -n menusaas-demo-api --startup-file 'dotnet DigitalMenu.Api.dll'
```

- `Proxy__TrustPlatform=true`: App Service is the only ingress and stamps
  X-Forwarded-Proto/For; the app fails HTTPS enforcement without this.
- `MigrateOnStart=true`: applies migrations at boot. The first boot after
  the database paused can take ~1 minute (resume) - expected.
- `/home/media` is App Service persistent storage. It survives restarts but
  is NOT backed up - acceptable for the demo, revisit for production.

### Web app settings

```bash
az webapp config appsettings set -g menusaas-demo -n menusaas-demo-web --settings \
  PUBLIC_ORIGIN=https://menusaas-demo-web.azurewebsites.net \
  PUBLIC_API_ORIGIN=https://menusaas-demo-api.azurewebsites.net \
  PROXY_TRUST_PLATFORM=true \
  PROXY_SHARED_SECRET='<PROXY_SHARED_SECRET>'
az webapp config set -g menusaas-demo -n menusaas-demo-web --startup-file 'node dist/digital-menu/server/server.mjs'
```

- `PUBLIC_API_ORIGIN` is the API's own public https hostname: F1 has no
  VNet integration, so the web app reaches the API through the same Azure
  front end a browser would. No insecure-origin opt-in is needed (or valid)
  here.
- `PROXY_TRUST_PLATFORM=true`: the request chain is browser → Azure front
  end → web app → Azure front end → api app, so the web app is a second
  proxy hop. With this on, the SSR `/api` proxy forwards only the LAST
  (front-end-stamped) X-Forwarded-For entry and the stamped
  X-Forwarded-Proto; with it off the API could not recover the original
  scheme at all.
- `PROXY_SHARED_SECRET` (web) + `Proxy__SharedSecret` (api), SAME generated
  value on both: the source-authenticated forwarding boundary. The API's
  own public front end appends the web app's outbound IP to the forwarded
  chain, so position alone cannot name the visitor (and raising the forward
  limit would let any direct caller prepend a forged IP). The web app
  authenticates itself with the secret and passes the visitor IP in a
  dedicated header pair; the API adopts it only on a fixed-time secret
  match and always strips both headers. A direct caller on the API hostname
  cannot forge the secret, so the forwarded policy keeps only the
  front-end-stamped rightmost address for them. The same pair is sent on
  the SSR server-to-server menu fetch, so public traffic is attributed to
  the visitor too. Azure's front end is always in the path, including for a
  client hitting the API hostname directly, so position-based trust holds
  as the fallback.
- Degraded mode: with `PROXY_SHARED_SECRET` unset on the web app (or
  `Proxy__SharedSecret` unset on the API) everything still works, but all
  proxied visitors share the web app's outbound IP for per-IP rate
  limiting - one visitor can exhaust the bucket for everyone. Acceptable
  only for a private smoke test; never hand over the demo without the pair.
- `PUBLIC_API_ALLOW_INSECURE_ORIGIN` stays unset: plain-HTTP upstreams are
  for the private compose network only.

## 4. Build + deploy (zip deploy)

```bash
# API
dotnet publish backend/src/DigitalMenu.Api/DigitalMenu.Api.csproj -c Release -o /tmp/publish-api
(cd /tmp/publish-api && zip -qr /tmp/api.zip .)
az webapp deploy -g menusaas-demo -n menusaas-demo-api --src-path /tmp/api.zip --type zip

# Frontend (build locally; Oryx builds on F1 would burn the CPU quota)
cd frontend && npm ci && npm run build && npm prune --omit=dev
zip -qr /tmp/web.zip dist node_modules package.json
az webapp deploy -g menusaas-demo -n menusaas-demo-web --src-path /tmp/web.zip --type zip
```

## 5. Verify

```bash
curl -fsS https://menusaas-demo-api.azurewebsites.net/api/health/ready
curl -fsS https://menusaas-demo-web.azurewebsites.net/r/demo-restaurant   # SSR menu page
curl -fsS 'https://menusaas-demo-api.azurewebsites.net/api/v1/public/restaurants/by-slug/demo-restaurant'
```

Edge smoke tests (prove the two-hop forwarding chain end to end):

```bash
# Spoofed forwarding headers must not survive either hop: the SSR proxy
# replaces the whole client-supplied chain with the last stamped entry, and
# the API's platform trust keeps only the rightmost address. A forged proto
# must not unlock HTTPS-required endpoints.
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'X-Forwarded-For: 203.0.113.9' -H 'X-Forwarded-Proto: http' \
  https://menusaas-demo-web.azurewebsites.net/api/v1/auth/login
# Expect 400/401 (request processed as https with the real client IP), never
# a scheme-related bypass.

# Direct http:// access must redirect or fail, never serve:
curl -sS -o /dev/null -w '%{http_code}\n' http://menusaas-demo-web.azurewebsites.net/r/demo-restaurant

# Rate limiting partitions by the real client IP through both public hops:
# burst the login endpoint from one source and expect 429s attributable to
# that source, not a global bucket. A direct caller on the API hostname
# cannot prepend a forged X-Forwarded-For or X-Menu-Client-IP: without the
# shared secret only the Azure-stamped rightmost address is used.
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'X-Forwarded-For: 203.0.113.9' -H 'X-Menu-Client-IP: 203.0.113.9' \
  https://menusaas-demo-api.azurewebsites.net/api/v1/auth/login
# The forged address must NOT appear in any 429 partition; observe with a
# burst from a second network if partitioning proof is needed.
```

Then hand over: demo menu at
`https://menusaas-demo-web.azurewebsites.net/r/demo-restaurant`,
admin at `https://menusaas-demo-web.azurewebsites.net/admin` with the seeded
owner email + vault-stored password.

## 6. After the first sign-in

The app's password-reset delivery is intentionally unconfigured outside
Development (owner signup is a local/test boundary, see Provisioning), so the
seeded owner password CANNOT be rotated in-app. Treat it as a demo credential:
clear it after seeding -

```bash
az webapp config appsettings set -g menusaas-demo -n menusaas-demo-api \
  --settings DemoSeed__Enabled=false DemoSeed__OwnerPassword=''
```

(the seed is idempotent and skips existing tenants, but the password should
not stay in configuration). Owner self-signup and password reset stay 503 in
this deployment until the reviewed production delivery increment lands.

## Limits and failure modes (read before demoing)

- F1: 60 CPU-minutes/day PER APP (each app has its own quota), 1 GB RAM, no
  Always-On. Idle unload + first-hit cold start (a few seconds) are normal.
- SQL free: 100k vCore-seconds + 32 GB/month; auto-pauses after 15 idle
  minutes; resume takes up to ~1 minute (the connection string above rides
  it out). If the monthly allowance runs out the database pauses until the
  1st of next month (chosen behavior).
- Cold-start behavior after a database pause, honestly:
  - Public menu pages: the SSR fetch to the API is capped at 5 seconds, far
    shorter than a resume. The FIRST hit after a pause serves the bounded
    "temporarily unavailable" page; the database resumes underneath and a
    refresh within about a minute serves the menu. This is deliberate -
    public traffic fails fast instead of hanging.
  - Admin/owner sign-in and mutations: the SSR proxy allows identity calls
    up to 90 seconds, so the first sign-in after a pause rides out the
    resume instead of failing. Worst case it still ends in a bounded 502.
- Media: `/home/media` persists across restarts but is not backed up.
- No custom domain on F1; the *.azurewebsites.net hostnames are the demo URLs.

## Teardown

```bash
az group delete -n menusaas-demo --yes --no-wait
```

## Move to paid later

The same build artifacts run anywhere Docker runs: `Dockerfile.api`,
`Dockerfile.web`, `Caddyfile` and `compose.yaml` give the one-VPS shape
(Hetzner CX23, ~€4/mo) with SQL Server in a container - swap `PUBLIC_ORIGIN`
and the connection string, keep everything else.

## Local production-shape run (compose.yaml)

```bash
SA_PASSWORD='<16+ chars>' DEMO_OWNER_PASSWORD='<12+ chars>' \
  PROXY_SHARED_SECRET='<32+ chars>' docker compose up --build
```

Then open https://localhost. The Caddy edge issues a certificate from its
local internal CA; `docker compose exec edge caddy trust` installs trust
INSIDE the container only. To trust it in the host browser, copy the root
certificate out and import it into the OS/browser trust store:

```bash
docker compose cp edge:/data/caddy/pki/authorities/local/root.crt /tmp/caddy-root.crt
# Linux:   sudo cp /tmp/caddy-root.crt /usr/local/share/ca-certificates/caddy-local.crt && sudo update-ca-certificates
# macOS:   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /tmp/caddy-root.crt
# Windows: certutil -addstore -f ROOT C:\path\to\caddy-root.crt
```

(or accept the browser warning once). Demo menu at /r/demo-restaurant, admin
at /admin with the seeded owner credentials. Only the edge publishes a port;
the API trusts platform forwarding headers (`Proxy__TrustPlatform=true`)
because the edge is the sole ingress inside the compose network - never set
that variable on a directly reachable host. The proxy shared secret is
required here too so the local run exercises the same authenticated web hop
as Azure.

For a real domain on the VPS move, set BOTH `PUBLIC_DOMAIN` (Caddy's
automatic-https name in the Caddyfile) and `PUBLIC_ORIGIN` (the SSR app's
public URL) to https://menu.example.com-style values - `PUBLIC_ORIGIN` does
not reconfigure Caddy, and `PUBLIC_DOMAIN` alone leaves the app's origin
pointing at localhost.
