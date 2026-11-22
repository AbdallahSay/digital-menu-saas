# F01 Angular foundation

See [the F01 runbook](../docs/17-F01-FOUNDATION.md) for startup, raw HTML,
unit/browser/Lighthouse checks, the local-only flag and production hosting limits.
The app uses Arabic-only fixture data. No restaurant CRUD or login exists yet.

## Vercel (preview/demo hosting)

`npm run build && node scripts/vercel-output.mjs` writes `.vercel/output` (Build Output API v3: one Node function that runs the same SSR server, so the app's own headers, `/api` router and asset rules apply unchanged). Deploy it with `vercel deploy --prebuilt --prod`. Set `PUBLIC_ORIGIN` (the site's own https origin) and `PUBLIC_API_ORIGIN` (the backend, https only) as Vercel environment variables. Known gap carried from S02: `robots.txt` and `sitemap.xml` still name localhost.

### Vercel profile limits (preview/demo only)

- **Uploads:** Vercel rejects any request body over about 4.5 MB (HTTP 413, before the app runs). The app's contract allows 5 MiB image uploads plus multipart overhead, so image uploads between roughly 4.4 MB and 5 MiB fail on this profile. Smaller images work as normal. Streaming does not lift this incoming cap. For the full contract, host the SSR server on a Node host (Docker/Compose or Azure) or send uploads straight to the backend; both would be a separate, reviewed change.
- **Responses:** the function enables response streaming, so large public-menu responses (the reader allows up to 16 MiB) are not stopped by the 4.5 MB buffered-response cap.
- **Duration:** `maxDuration` is 15 s; the app's own API proxy timeout is 5 s.
