# P11 — SEO completion (S02) and safe slug renames

> ملخص: Google يلاقي منيوهات المطاعم صح: sitemap حقيقي، robots، بيانات منظمة، وتغيير رابط المطعم من غير ما الروابط القديمة تبوظ.

Depends on: P04, P10 · Decisions: D8 · Size: large

## Context
`server.ts` serves hardcoded localhost robots/sitemap with only `/r/demo`. Open PR #45 (S02-I01) adds
metadata/structured data; P00 decided whether to merge it or fold it in here. Proposals P-RENAME and
P-SLUG in `docs/19-INTEGRATION-AND-ADR-PROPOSALS.md` define the slug history design.

## Scope
1. `robots.txt` and `sitemap.xml` generated from trusted `PUBLIC_ORIGIN`; sitemap lists marketing pages
   and every Active + published restaurant (`lastmod` from real public changes); excludes demo, history
   slugs, admin, platform, preview, API. Cached briefly, invalidated by PublishedMenuVersion.
2. Restaurant JSON-LD (`Restaurant` + `hasMenu` with sections/items and offers in EGP) built only from
   visible facts; parsed and validated in tests.
3. Slug rename (PlatformAdmin, per P-RENAME): `PATCH /api/v1/platform/restaurants/{id}/slug` with a shared
   unique namespace for current + historical slugs, transactional, audited, rowVersion. Old slugs 301
   directly to the current slug (no chains); hidden/missing -> 404; PublicCode unchanged; reserved slugs rejected.
4. Wire the rename into the P09 restaurant edit screen with a warning about printed links.

## Acceptance criteria
- SEO gate in AGENTS.md rule 15 passes for every public route; A->B->C rename resolves A and B to C in one hop.
- Concurrency test: two tenants racing for the same slug -> exactly one wins.
- Host-header injection cannot change canonical, sitemap or robots URLs.
