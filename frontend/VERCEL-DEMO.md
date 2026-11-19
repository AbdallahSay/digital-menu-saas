# Vercel demo preview (frontend only)

Human-requested demo preview so the owner can view the UI online. **Not** a production
hosting decision: P0 hosting (Node SSR + .NET API + SQL Server + durable media under one
origin) remains open per `docs/11-ADR-AND-RISKS.md`.

- URL: https://digital-menu-demo-nine.vercel.app (project `digital-menu-demo`)
- Works: `/` (prerendered marketing), `/r/demo` (SSR built-in fixture, `?lang=en`),
  `/admin` (CSR shell), 404 pages, `/m/demo-code` -> 302 `/r/demo`.
- Not available: the .NET API is not deployed (Vercel has no .NET/SQL Server runtime), so
  real restaurants `/r/{slug}` return 503 and admin login/data does not work.
- Whole site is sent with `X-Robots-Tag: noindex, nofollow` (demo must not be indexed).
- Known limitation: canonical/robots/sitemap still use the F01 `http://localhost:4000`
  constants (`src/app/demo.ts`, `src/server.ts`); fixing requires a reviewed SEO-gate change.

## Redeploy

```bash
cd frontend
npm ci
npx ng build
DEMO_HOST=digital-menu-demo-nine.vercel.app node scripts/vercel-prebuilt.mjs
npx vercel@65.11.0 deploy --prebuilt --prod --yes --token "$VERCEL_TOKEN"
```

`frontend/.vercel/` (generated output + project link) is git-ignored. Never commit tokens.
The local `F01_LOCAL_ONLY` guard is unchanged: the Vercel function imports `reqHandler`
and never calls `listen`.
