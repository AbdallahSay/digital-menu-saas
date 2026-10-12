# F01 executed checks — 2026-10-12

Windows 11 x64; .NET 10.0.400 SDK/10.0.11 runtime; Node 24.19.0/npm 11.17.0;
Chrome on localhost; production Angular 22.2.2 build, immutable one-item Arabic
fixture. All final checks below returned exit code **0**:

| Command | Observed result |
|---|---|
| dotnet restore backend/DigitalMenu.slnx --locked-mode | Locked restore passed |
| dotnet build backend/DigitalMenu.slnx -c Release --no-restore | 0 warnings, 0 errors |
| dotnet format backend/DigitalMenu.slnx --verify-no-changes --no-restore | No changes needed |
| dotnet test backend/DigitalMenu.slnx -c Release --no-build | 6 API integration tests passed |
| dotnet list backend/DigitalMenu.slnx package --vulnerable --include-transitive | No vulnerable packages reported |
| npm ci | Lockfile installation passed |
| npm run lint | Prettier check passed |
| npm test -- --watch=false | 2 Angular unit tests passed |
| npm run build | SSR bundles plus 1 prerendered route; initial estimated transfer 64.71 kB |
| npm audit --audit-level=high | 0 vulnerabilities |
| npm run test:html | 6 raw-response/budget tests passed; all browser JS gzip 74,619 bytes |
| npm run test:e2e | 2 mobile tests passed, JavaScript on and off, single canonical/schema |
| npm run test:lighthouse | 3 runs; median Performance 97, Accessibility/SEO/Best Practices 100 |
| curl.exe -i http://localhost:4000/r/demo | 200; menu text, title and canonical in raw source |
| curl.exe -I http://localhost:4000/m/demo-code | 302, Location /r/demo |
| curl.exe -i http://localhost:4000/r/missing | 404, noindex, no restaurant/item disclosure |

The three full Lighthouse JSON reports are gzip-compressed in lighthouse-*.json.gz.
lighthouse-mobile.html is the first full report; lighthouse-summary.json preserves
all three score/metric rows. Median LCP 2104.83 ms, CLS 0, median TBT 8.5 ms.
Performance score range: 97–97; LCP range: 2102.96–2105.24 ms. These use
Lighthouse's default simulated mobile profile, not field CWV or production SLA.

Ten sequential same-host warm SSR curl requests returned 200 with TTFB
206.23–230.61 ms (raw seconds in warm-ssr-ttfb.txt). No cold-start or regional
claim is made. CI uploads new full reports and logs per run.

Source HTML/HTTP headers and command outputs are included alongside this file.
Earlier failed attempts and NOT RUN launch checks are documented in
../../docs/17-F01-FOUNDATION.md. Human review is required before merge.
