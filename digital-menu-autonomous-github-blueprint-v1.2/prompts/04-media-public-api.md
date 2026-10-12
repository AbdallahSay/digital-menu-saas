# F08/F09 — Media and Public API (Codex preferred)

Read AGENTS, API, Security, Performance, Data Model and Test Plan. Do **F08 and F09 as separate PRs**, not one unreviewed blob.

F08: implement tenant-isolated image storage interface, safe MIME byte sniffing/decoding/normalization, file/pixel limits, random object keys, metadata stripping, optimized variants and secure serving. Reject SVG/script payload and foreign tenant upload. Local media storage is dev-only; prod storage choice must be documented.

F09: implement anonymous public menu read projection with only published restaurant+categories+available/published/non-deleted items; localization fallback; efficient SQL query and no N+1; publicCode stable; cache safe and coherent on edit with stated freshness behavior.

Tests: security uploads, cross-tenant access, suspended/unpublished tenant, price edit and fresh public GET, QR code identity stability, DTO response leaks, query count/profile. Show actual evidence, no claims without execution. Do not implement ordering or paid infrastructure. Ensure public API shapes support SEO-first SSR in the separate Angular public-menu route.
