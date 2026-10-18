# S01 acceptance review and S02 preparation

Review date: 2026-10-18. **Planning proposal, not implementation authorization.**
Documentation branch starts at main `18b555b07f18205d153b2f8a886a58404aba0ae5`.
S01 remains separate, Draft and unmerged. No production system was accessed.

## 1. Acceptance and independently checked evidence

Accept S01's **local-only milestone evidence**; recommend project-owner review,
not production release. [PR #43](https://github.com/AbdallahSay/digital-menu-saas/pull/43)
head independently rechecked as `045c0ae89e59195ae9e8c0771192747b1513f13b`.
Its owner-authored COMMENT review reports no confirmed blocking defect within that
scope; it is not an APPROVED review, merge instruction or deployment approval.

| Evidence on exact S01 head | Observed result |
|---|---|
| [Foundation](https://github.com/AbdallahSay/digital-menu-saas/actions/runs/39113914752) | SUCCESS; raw HTML 7/7, browser 6/6, M02 security 59/59, including symlink/race cases |
| [SQL integrity](https://github.com/AbdallahSay/digital-menu-saas/actions/runs/39113914732) | SUCCESS; 91 passed, zero failures/skips; EF consistency passed |
| [Planning](https://github.com/AbdallahSay/digital-menu-saas/actions/runs/39113914729) | SUCCESS |
| Foundation real-menu and demo mobile Lighthouse | Performance 98/98/98; Accessibility, Best Practices and SEO 100 |
| Previous final local verification | SQL 91/91; unit 8/8; design 8/8; locked restore, Release build, lint, format, EF script/model and audits passed |

CI conclusions, head and human review were fetched again for this review. Detailed
counts and Lighthouse figures were inspected in the preceding final-fix session's
actual CI logs; they are not a newly executed test suite for this documentation PR.
The Foundation preliminary non-SQL run skips SQL facts by design; the separate
full SQL job above executes all 91 without skips. Do not confuse these runs.
Reproducible commands, failed diagnostic attempts and lab limitations remain in the
[exact S01 verification report](https://github.com/AbdallahSay/digital-menu-saas/blob/045c0ae89e59195ae9e8c0771192747b1513f13b/frontend/S01-VERIFICATION.md).

Code review covered F09 public projections/rate limiter; F04 provisioning;
S01 trusted-origin fetch, DTO projection, SSR context/TransferState, route statuses,
escaping and demo routing; and the unchanged M02 static delivery boundary.
Malformed QR/invalid locale remains 400; valid absent/hidden/suspended remains
404; valid published QR is one relative 302; upstream failure is generic 503.
Existing SQL/SSR tests cover A/B isolation and published/available filtering.
Production hosting, media, proxy behavior, database inventory, regional capacity,
backup recovery, real phones and field CWV are **NOT RUN/NOT VERIFIED**.

Documentation-branch validation: the planning manifest/DAG/approval invariants,
relative Markdown links, fence balance and `git diff --check` passed locally using
Node; Python is unavailable locally. GitHub's actual Python Planning check passed
on the initial documentation commit. Its
[Foundation](https://github.com/AbdallahSay/digital-menu-saas/actions/runs/39124660980)
and [SQL](https://github.com/AbdallahSay/digital-menu-saas/actions/runs/39124660967)
checks failed at restore: current main still resolves Pkcs 9.0.11, producing
NU1902/NU1903. The patched 9.0.21 reference is in unmerged S01, not in this docs-only
branch. This is an inherited main dependency blocker, not a passing runtime
verification for this PR. Do not suppress audits or copy S01 code here. After an
owner-authorized S01 merge, update this documentation branch against main and
rerun CI; no merge is authorized by this plan.

## 2. Sources and scope reconciliation

Source of truth: [backlog](10-BACKLOG.md), [architecture](02-ARCHITECTURE.md),
[security](06-SECURITY.md), [performance](07-PERFORMANCE.md),
[test acceptance matrix](08-TEST-PLAN.md), [operations](09-DEVOPS.md),
[ADRs](11-ADR-AND-RISKS.md), [SEO strategy](12-SEO-STRATEGY.md),
[SEO gates](13-SEO-PERFORMANCE-GATES.md), [API contract](04-API-CONTRACT.md),
and `automation/tasks.json`. Issues [18](https://github.com/AbdallahSay/digital-menu-saas/issues/18),
[22](https://github.com/AbdallahSay/digital-menu-saas/issues/22) and
[23](https://github.com/AbdallahSay/digital-menu-saas/issues/23) defer acceptance
to the backlog and require human approval. S02 is assigned Antigravity there;
Codex implementation ownership must not be inferred from this planning request.

The prose backlog groups S01/S02/S03 and Q01/Q02 broadly. The automation graph is
more specific: S01 -> S02 -> S03 -> U04 -> Q01 -> Q02 -> R01, with U03 also feeding
U04. Automation remains bootstrap-only, not activated. This review does not edit
that graph, close issues, move ownership or silently approve new dependencies.

Historical slug 301s are established in ADR-008, architecture and SEO strategy;
the S01 contract explicitly defers them to S02. Implementing them there is a
completion of an existing requirement, not a new SEO promise. No rename API or
historical-slug table exists today: S01's rename test edits its disposable SQL
fixture directly. The authorized mutation contract/schema still needs review.

## 3. Architectural risk register and ownership

Severity describes public-release impact, not a newly failing local S01 gate.

| Risk | Severity / impact | Recommended owner and exit evidence |
|---|---|---|
| Main retains vulnerable Pkcs 9.0.11 while S01 contains the fix | High dependency risk; new main-based PRs fail locked restore audit | Owner reviews S01's existing 9.0.21 fix; after authorized integration, update dependent branches and rerun audits/CI without suppression |
| SSR aggregates visitors into F09's 120/min remote-IP bucket | High availability: legitimate visitors can receive generic 503 after backend 429 | F09 security follow-up implements trusted internal boundary; R01 defines ingress topology; Q02 verifies multi-visitor load and abusive clients |
| F04 accepts `demo`, S01 reserves `/r/demo` | High routing/integrity: real tenant URL can show illustrative data; its QR deliberately fails 503 | F04 follow-up reserves routes and plans legacy remediation before real indexing; S02 verifies sitemap/alias exclusions |
| Hardcoded localhost robots/sitemap, no real tenant structured data | High release SEO: wrong URLs and incomplete discovery/indexing policy | S02, AC-15/17/18 and lifecycle source tests |
| Slug history/rename operation absent | High URL continuity: old links become 404, no safe namespace ownership after reuse | S02 alias design plus approved F04/admin rename contract; AC-07/16 and SQL concurrency |
| Production media provider/reconciliation absent | High durability/availability: local files cannot be treated as production storage | Existing F08 follow-up, consumed by S03; R01 verifies durability/recovery |
| Production SSR host/TLS/proxy/session routing undecided | High security/availability: forwarded-header spoofing, wrong canonical/redirects or unusable auth | P0 architecture decision and R01 operational implementation/evidence |
| Local laboratory results extrapolated to launch | High capacity/operations risk | Q02 representative regional load; R01 monitoring/restore/rollback; post-launch field CWV |

No new milestone is recommended. F04/F09/F08 follow-ups retain their original
feature/security ownership; closed implementation issues are not proof of release
readiness. Q02's current scope is tests/docs: putting backend rate-limit code into
Q02 would silently expand it. R01 is after Q02 in the current graph, so its early
proxy design is a prerequisite input, not an assertion that R01 has completed.
Owner approval is needed to schedule these feature follow-ups and early R01/P0
decisions; no existing milestone is reopened by this document.

## 4. Proposed SSR abuse-control design (not an accepted ADR)

Prefer distinct ingress and internal service boundaries over trusting forwarded
visitor headers in the anonymous F09 endpoint:

1. A reviewed reverse proxy terminates TLS, removes inbound forwarding/internal
   identity headers and supplies authoritative connection metadata. Configure exact
   trusted proxy addresses/networks, bounded hop count and normalized IPv4/IPv6;
   restrict direct origin access. No wildcard proxy trust or arbitrary XFF parsing.
2. Apply bounded per-client rate limits and global concurrency/queue limits at
   public ingress, covering SSR, QR, direct public API and sitemap. Requests from
   the same NAT still need fair documented budgets; an IP is not a unique person.
3. Distinguish SSR-to-API traffic with an authenticated service boundary: preferably
   platform-supported mTLS/private service identity plus network restriction.
   Loopback/private IP or a client-supplied header alone is insufficient. Strip
   internal markers at ingress; fail closed if service authentication is absent.
4. Trusted SSR requests use a separate bounded aggregate service budget and SQL
   concurrency cap. Do not charge every visitor to the anonymous 120/min bucket,
   and do not create an unlimited privileged bypass. Keep the same public-only
   projection and visibility rules, never an admin/session credential path.
5. Direct public API clients keep abuse protection. Untrusted requests cannot
   select the internal policy. Define 429/Retry-After and exhaustion/timeout
   behavior before changing contracts; S01 currently maps upstream 429 to 503.
   Do not silently change that mapping in this planning increment.

The exact service-auth mechanism, budgets, replica topology and any multi-instance
limiter coordination depend on the chosen host. Do not add Redis or credentials
as a speculative shortcut. Rotation, expiry, replay/transport protections and
secret-free logs must be reviewed if a token alternative is selected.

Required follow-up tests: **at least 150 distinct simulated visitors within one
minute through a controlled trusted ingress**, plus concurrent A/B traffic; no
spurious shared-bucket 429/503 at the agreed service capacity. Simulate visitors
using trusted fixture/proxy connection metadata, not arbitrary internet XFF.
Separately exceed one client's budget and assert 429; forge XFF/Forwarded/internal
markers, connect directly, omit/expire service identity, exhaust concurrency and
test multiple SSR replicas. Preserve tenant isolation, bounded memory, API failure
behavior and all existing security regressions. These tests are planned, NOT RUN.

## 5. Reserved routes and existing records

Keep the approved illustrative `/r/demo` reservation. The immediate F04 follow-up
should reject normalized reserved slugs before provisioning writes; use one reviewed
registry shared with future slug mutation/alias allocation. Only actual collisions
in the tenant namespace require reservation: do not ban legitimate `/r/admin` or
`/r/api` merely because unrelated top-level routes exist. Test trim/case variants,
reserved history, concurrent allocations and transaction/audit rollback.

Existing production records were **not inspected**. Before a constraint or data
migration, an authorized operator must run a read-only reserved-slug inventory on
each intended environment, report collision counts and privately verify affected
tenants/printed QRs. Do not export credentials or contacts into planning evidence.
First deploy validation that blocks new collisions without deleting/renaming old
rows; do not add a constraint that fails on unremediated existing records.

For a legacy `demo` tenant, prefer an explicitly approved, tenant-coordinated rename
to a unique safe slug using the reviewed mutation path: retain immutable PublicCode,
update current slug/version/timestamp and audit atomically, then verify its existing
printed `/m/{code}` points directly to the real new page. No new QR code required.
There is no safe `/r/demo` historical redirect while that route remains illustrative;
document this exception and agree replacement direct links with the tenant. Until
remediation its QR stays fail-closed 503, never redirected to mock data. No automatic
bulk rename, production edit, URL takeover or silent relocation of the demo.

## 6. Exact proposed S02 scope and acceptance

All entries are traced to existing sources; proposed implementation details still
require approval. S02 must start from merged, verified S01 only after explicit
authorization. It is not authorized by accepting this document.

| Deliverable / source | Acceptance evidence |
|---|---|
| Real per-restaurant metadata: backlog S02, SEO sections 1/2, AC-15 | Raw HTML 200 has one H1, visible real menu text, unique title/description, exact trusted-origin canonical; malicious/long tenant text remains escaped; no private fields |
| Restaurant JSON-LD: SEO structured-data section, AC-18 | Parse raw script as JSON; truthful Restaurant name/url/menu matching visible public data; safely escape `<`, `</script>` and Unicode separators; no executable tenant payloads |
| Dynamic sitemap: API contract, SEO lifecycle, AC-17 | Anonymous explicit public projection enumerates only active published canonical restaurants; bounded/paged generation, stable ordering, XML escaping, trusted HTTPS origin; no QR/history/demo/admin/draft/suspended/private fields; publish/unpublish/status/slug edits reflected on next generation |
| Honest modification dates: SEO lifecycle/gates | Use transactionally maintained public-change time only if semantics are verified; current F09 DTO lacks this field. Add a reviewed public sitemap projection or omit optional lastmod until truthful; never use request time. Review timestamp/version behavior and concurrent publish changes |
| Sitemap scale: SEO lifecycle | Split/index before exceeding 50,000 URLs or 50 MB uncompressed; boundary tests and bounded memory/query count, GET/HEAD and compression correctness |
| Robots/index policy: API contract, AC-17 | Production configuration has trusted HTTPS Sitemap URL, no localhost leakage; valid syntax; private routes protected/noindex and absent from sitemap. Blocking crawl is not proof of deindexing. Staging/demo noindex policy explicitly reviewed and tested |
| Canonical and locale truth: ADR-009, SEO section 3, AC-18 | Retain single Arabic canonical, valid `lang`/`dir` and English fallback/toggle; no fabricated hreflang or separate English index URLs. Query/filter variants are not new canonical pages. Independent locale URLs require separate owner decision |
| Historical aliases: ADR-008, SEO section 5, AC-16, S01 deferred contract | Persist globally protected current/history namespace; old owned slug -> latest canonical in one 301, QR -> current in one 302. A->B->C has no chain/loop; history cannot be reassigned to another tenant. Atomic rename/version/audit, SQL uniqueness/rowversion and race tests; reserved-demo exception documented |
| Unavailable lifecycle and isolation: security, AC-05/20 | Current and historical URLs of suspended/unpublished/missing restaurants return generic 404/no private content and no redirect; malformed input400, API failure503/noindex, active published200/302/301 as applicable. No new410 without explicit deletion/tombstone policy. Concurrent A/B metadata/JSON-LD/sitemap tests and freshness after edits |

Optional contact/address/hours/image fields are emitted only if accurate, explicitly
public, and visibly represented; they are not required to invent missing data.
No owner SEO editor/new profile schema, ratings/reviews, image URLs, new locales,
category/product SEO pages, remote fetches, ordering or third-party scripts are
implicitly authorized. F08 private object keys must never become URLs. Use the
existing public restaurant name for metadata unless a separate field contract is
approved. External Rich Results/Schema checks supplement automated JSON parsing
when accessible; Google indexing/rich results cannot be certified in local CI.

## 7. Dependency map, order and test strategy

Existing implementation graph, unchanged:

```text
F09 + U01 -> S01 -> S02 -> S03 -> U04 -> Q01 -> Q02 -> R01
F08 -> U03 (also depends on U02) --------> U04
```

Proposed additional readiness conditions (not automated DAG edits):

1. Owner reviews S01 and this plan separately. No merge is performed here.
2. Approve F04 reserved-name/legacy plan and S02 rename/alias contract. Resolve
   collisions before real tenants can be indexed; synthetic local S02 development
   can proceed after authorization without production records or credentials.
3. Approve P0/R01 host and trusted-ingress design; implement F09 abuse-control
   follow-up before Q02's representative SSR load acceptance, not after launch.
4. Implement approved S02 in small reviewed increments: metadata/JSON-LD,
   sitemap/robots lifecycle, then alias/rename integration after its contract/schema
   approval. Keep API docs and migration reviews synchronized; no production apply.
5. F08 production follow-up supplies durable storage, delivery/reconciliation and
   safe public URL contract before S03 production-image acceptance. S03 retains
   hydration freshness, performance and tenant-safe cache gates; U04 retains UX.
6. Q01 verifies full owner/public journeys. Q02 runs 100 tenants x 200 items,
   20/100 VUs, warmup and five-minute profiles, cold/warm rendering, p50/p95/p99,
   errors, query plans/waits, Node/native memory and >=3 mobile LH runs per relevant
   locale/large-menu scenario. Preserve median Performance>=90, existing A11y/SEO
   gates, 180KiB gzip JS budget and M02 security gates. Field CWV remains separate.
7. R01 verifies production-like staging, backup-to-fresh-DB restore, rollback and
   synthetic smoke/real-device QR after separate authorization. Production release
   and subsequent Search Console/RUM observation need explicit human approval.

S02 negative tests come first: real SQL A/B + hidden/deleted fixtures, hostile names,
XML/script delimiters, forged Host/proxy headers, cross-tenant alias claims and
simultaneous slug allocation. Then raw GET/HEAD gzip/identity HTML/XML/status tests,
JS-disabled/enabled browser hydration/RTL, publication lifecycle and no stale cache.
Run locked restore/Release/full SQL without skips, EF model/script checks for schema
work, npm locked install/lint/unit/design/build/e2e/security/Lighthouse and dependency
audits. Never replace SQL with InMemory for uniqueness/isolation evidence.

## 8. Production dependency checklist (all remain open)

| Area / owner | Required evidence before release |
|---|---|
| F08 follow-up + R01 storage | Maintained provider/least-privilege credentials, durable immutable tenant keys, safe public delivery, quotas, retry/reconciliation after ambiguous commit/crash, cleanup without new uploads, restore/retention, native license/SBOM and host profiling |
| P0/R01 SSR hosting | Approved Node/.NET/SQL region/cost/runtime compatibility, process lifecycle/scaling, same-origin route map; replace local-only harness through reviewed work, not disabling its guard |
| R01 TLS/proxies/auth | Valid TLS, exact trusted proxies, rejected forged/direct-origin traffic, secure cookies/CSRF, persistent Identity keys, real admin routing rather than the credential-dropping local public adapter; F04 production onboarding delivery remains a separate dependency |
| R01 headers | Verify HTML/API/media-specific CSP, frame protections, nosniff/referrer policy, TLS/HSTS rollout, no-store/private boundaries; no blanket API CSP copied to hydrated HTML, no CSP relaxation to mask XSS |
| R01 deploy/rollback | Approved staging/production separation, secret management, backup/restore drill, reviewed expand/contract migrations, compatible rollback/forward-fix, health-based smoke and explicit human release checkpoint |
| R01 monitoring | Minimal liveness, dependency readiness without secrets, graceful drain, request correlation/redaction, alerts on 429/503, latency, SQL exhaustion, Node/native memory, media failures and backup failures; no tenant payload logs |
| Q02 + R01 performance | Region/device/environment described, separate load client, realistic media, cold/warm/replica results and failure recovery; avoid equating loopback LH with capacity |
| Q02 readiness / after-launch RUM | Privacy/consent decision, real collection of mobile p75 LCP/INP/CLS and TTFB with enough traffic; no invented field scores. Search Console only after owned-domain release authorization |

## 9. Decisions requiring the project owner

- Accept S01 within local scope and decide separately whether/when to merge #43.
- Approve this follow-up ownership/order without duplicating milestones; approve
  any later task-DAG/scope changes separately. Confirm S02 implementer (currently
  Antigravity) and explicitly authorize its start after S01 dependency completion.
- Select SSR host/proxy topology and service authentication; approve budgets from
  measurement, 429 semantics and any multi-replica coordination, not an unlimited bypass.
- Approve reserved-name registry, operator inventory and any legacy remediation;
  confirm the intentional exception that `/r/demo` cannot be a tenant history alias.
- Approve rename authorization/API, alias namespace/retention and non-destructive
  schema design. No existing public slug may be silently reassigned or bulk-renamed.
- Confirm retaining Arabic canonical and current404 lifecycle; independent language
  routes or410 tombstones require explicit policy decisions before contract changes.
- Select durable media/operational ownership and grant separate staging/deployment
  access when ready. No production credentials or paid services are requested here.

توصية: قبول أدلة S01 المحلية ومراجعة هذا التخطيط، ثم اعتماد متابعة F04/F09/F08
وقرارات الاستضافة والتسمية قبل التنفيذ. لا يُعد نجاح CI موافقة إنتاجية؛ لا دمج أو
نشر أو تعديل بيانات أو تنفيذ S02 ضمن هذا الطلب.
