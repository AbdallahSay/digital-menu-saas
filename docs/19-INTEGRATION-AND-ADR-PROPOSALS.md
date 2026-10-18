# Controlled S01 integration and architecture proposals

Status: **PROPOSED**, 2026-10-18. None of the ADR proposals below is accepted.
No implementation, hosting selection, purchase, merge or production access is
authorized by this document. Supplements [the review plan](18-S01-REVIEW-AND-S02-PLAN.md);
does not change `automation/tasks.json`, milestone ownership or dependencies.

Integration update: the owner separately authorized merging PR #43 ONLY.
It merged as `211e28f7aa6a7931bfc8ec713d70aa11435c61e9`; its exact reviewed head
is an ancestor of main. A normal merge brought main into this documentation branch,
preserving all proposals and patched Pkcs9.0.21 without conflicts or force-push.
Synchronization was prepared while post-merge CI ran; readiness remains conditional
on main and synchronized-head CI, not the mere completion of the Git merge.
Final head/run results are recorded in PR #44's delivery comment. PR #44 remains
unmerged, and all four ADRs remain proposals. No S02 or deployment authorization.

## Integration checkpoint A: S01

Independently rechecked PR #43 head
`045c0ae89e59195ae9e8c0771192747b1513f13b`: all three project CI checks successful;
SQL 91/91 with zero skips; M02 security 59/59; HTML 7/7, including malformed QR400
versus valid absent404. Pkcs9.0.21 and npm/NuGet audit gates remain present.
The human COMMENT review covers this head; no later commits, changes-requested
reviews or review threads were present when checked. The PR is Draft and mergeable.
Evidence URLs are in document18. These are inspected executed CI results, not a
new local test run. Acceptance is strictly the local milestone.

**READY FOR OWNER-AUTHORIZED MERGE** of PR #43, subject to rechecking head/checks
immediately before any future authorized action. This is not merge authorization.
Draft readiness and any repository review requirements must be satisfied without
bypass. The legacy branch-protection endpoint returns404, but the effective
repository ruleset **does** require Planning, foundation and sql-integrity, prevents
deletion/non-fast-forward updates and requires a PR. All three required contexts
are green on the exact S01 head. The ruleset currently requires zero approving
reviews and does not enforce thread resolution; human permission remains required
by this task regardless. Strengthening review enforcement is a separate owner
decision; do not change permissions/rules in this increment.

This checkpoint was satisfied by the subsequent explicit authorization of **PR #43**.
For any future integration, stop until that specific authorization is obtained. Never
interpret approval of the plan or S02 as permission to merge either PR.

## Synchronization runbook B (execution status above)

Only after PR #43 is actually merged by an authorized action:

1. Verify GitHub reports MERGED, record merge SHA/method and final reviewed head;
   fetch main and both remote branches. Require clean working tree. Confirm the
   merge SHA is an ancestor of origin/main. For squash/rebase, inspect equivalent
   S01 changes and original PR metadata rather than requiring original SHA ancestry.
2. Verify post-merge main Foundation/SQL workflows succeeded on the integration
   commit, including SQL counts and audits. Pending/failure blocks synchronization
   readiness; diagnose the actual logs without assuming the old Pkcs cause.
3. Check out existing `codex/s01-review-s02-plan`, fast-forward from its remote and
   merge origin/main. Prefer an ordinary merge so there is no force-push/rewrite.
   Record the pre-merge documentation head for recovery; abort on ambiguity.
4. Resolve docs conflicts by retaining the risk register and updating historical
   observations to dated evidence. Preserve S01's implementation, all three patched
   Pkcs lockfiles and 9.0.21 reference, audits, SQL fixture and security/performance
   gates. Do not use blanket ours/theirs or restore old main dependency files.
5. Inspect the diff against updated main: only intended documentation should remain.
   Verify merge ancestry/equivalence, package resolution, unchanged milestone graph,
   clean diff and all local Markdown references. Update stale main-base/CI-blocker
   wording in documents18/19 with the actual merge/run SHAs; retain history clearly.
6. Run locked restore, Release build, format, EF model/idempotent script checks,
   dependency audits and full real SQL suite without skips. Run frontend locked
   install, lint/unit/design/build, raw HTML, e2e/security and Lighthouse through
   the real SQL-to-SSR harness. Use the exact reproducible commands in S01's
   verification report. Windows symlink limits do not waive required Linux tests.
7. Push normally to the same PR #44. Wait for Planning, Foundation and SQL Integrity
   on its exact new head, not stale checks. Inspect counts, vulnerabilities and
   Lighthouse artifacts. Investigate every failure from logs; preserve the 90 median
   Performance gate and all existing security/quality assertions. Report exact SHA
   and run URLs. Do not claim skipped/unexecuted tests passed.

Checkpoint C: only after these checks pass, report **READY FOR OWNER REVIEW** for
PR #44. Do not merge it. A successful S01 merge does not authorize merging #44,
starting S02 or deploying. Current docs-branch restore failures are documented in
document18; they are not evidence of a future post-integration failure's cause.

## ADR proposal P-SSR: service trust and abuse budgets

Owner: F09 feature follow-up; P0/R01 approve trust topology; Q02 validates load.

| Alternative | Security / compatibility | Operations / cost |
|---|---|---|
| Preserve shared anonymous bucket | Existing behavior; legitimate visitors aggregate at 120/min; unsuitable release capacity | Low operational cost; unacceptable unresolved availability limit |
| Trust browser XFF or an arbitrary internal header | Spoofable identity/policy bypass; rejected | Low apparent cost hides abuse risk |
| Authenticate internal service using mTLS/workload identity; separate ingress and service budgets | Proposed preferred direction, not selected mechanism. Strip inbound markers; restrict direct origins; public-only projection remains; no owner cookies | Certificate/identity lifecycle, bounded service/SQL concurrency, replica-aware limits and monitoring; host support must be established |
| Short-lived audience-bound service token over TLS plus network restriction | Possible reviewed fallback; not user auth. Must validate issuer/audience/expiry, rotate keys and prevent leakage/replay within the threat model | Secret/issuer lifecycle and rotation burden; no static shared header shortcut |
| Move resolver/rendering boundary into another runtime | May avoid the internal hop, but changes established Angular SSR architecture | Larger rewrite and compatibility/performance proof; separate architecture approval |

Ingress retains client abuse controls; internal identity only selects a bounded
service budget, never a tenant/admin authorization bypass. Do not raise or remove
120/min blindly. Define 429/Retry-After versus S01's current429->503 mapping before
contract changes. NAT fairness, trusted hop count/IP normalization, global caps,
failure mode and multiple replicas require explicit decisions. No speculative Redis.

Acceptance: >=150 distinct trusted simulated visitor connections/minute without
shared-bucket denial at agreed capacity; abusive single-client429; forged XFF and
internal markers rejected; direct-origin/expired or absent service identity denied;
bounded overload behavior and A/B isolation under concurrency. Observe SQL/Node
resources and rates. Tests and operational costs remain estimates/NOT RUN.

## ADR proposal P-SLUG: reserved registry and legacy demo

Owner: F04 follow-up, with S02 route/index integration.

| Alternative | Compatibility/security | Operations / cost |
|---|---|---|
| Shared normalized reserved registry, initially demo | Proposed direction consistent with approved illustrative route; check provisioning, rename and alias allocation before mutation | Small maintained registry plus SQL/service enforcement and tests; no unnecessary global ban on unrelated top-level route names |
| Relocate illustrative demo outside tenant namespace | Can free /r/demo for real tenants, but changes approved behavior and existing demo links/tests | Coordinated route/document/link migration; requires separate owner approval |
| Automatically rename old demo rows or redirect them to fixture | Breaks tenant links or serves fabricated content; rejected | Hidden support/data-integrity cost |

Authorized operator inventory is read-only and NOT RUN. Prevent new collisions
first; do not apply a constraint incompatible with legacy rows. Any legacy rename
requires tenant coordination and explicit data-change approval, retains PublicCode
and atomically updates slug/version/timestamp/audit. Existing printed QR remains
usable after remediation. While `/r/demo` stays illustrative it cannot redirect as
a real tenant historical alias; agree replacement direct links, keep QR503 until
remediated and exclude fixture URLs from real tenant sitemap. No production edits.

Acceptance: normalized case/trim collisions, legitimate neighboring slugs,
provisioning/rename/alias races, no partial owner/tenant/audit writes, unchanged QR
code and no real-data/demo mixing. Inventory/remediation/rollback evidence required
before tightening production constraints; retention of reservations needs approval.

## ADR proposal P-RENAME: atomic slug/history namespace

Owner: S02 historical-route work and approved F04/admin mutation contract.

| Alternative | Compatibility/security | Operations / cost |
|---|---|---|
| Shared unique slug namespace for current/history ownership | Proposed invariant; prevents cross-tenant reuse races. Aliases resolve identity -> current slug, not alias -> alias | Reviewed non-destructive schema/backfill/indexes, transactional mutation and retention; more schema work |
| Separate current and history tables with only independent unique indexes | Insufficient alone: allows a current slug to collide with another tenant's history | Needs a shared allocator/locking invariant across both tables, with real SQL concurrency proof |
| Transient redirect map, chains or reusing old slugs | Restart/replica loss, loops or cross-tenant URL takeover; rejected | Apparently cheap but incompatible with required continuity |

Approve the mutation actor/policy and endpoint/DTO/CSRF/rowversion contract first;
no production rename API currently exists. Changing slug, history ownership,
PublishedMenuVersion/timestamp and immutable audit must commit together or roll back.
PublicCode never changes. Resolve A->B->C history directly to C with one301; QR is
one302 to C. Check current publication/status before any history redirect: hidden
and missing404 without Location/content; upstream errors503. No new410 policy is
assumed. Reserved-demo exception remains explicit. Never return private owner IDs.

Acceptance: A/B foreign-history claims, normalized unique allocation under races,
stale rowversion/rollback, same-slug idempotency, reserved/current/history conflicts,
one-hop/no loop/open redirect, old-slug reuse denial, sitemap exclusion of history,
hide/reactivate lifecycle, GET/HEAD gzip/identity. Review alias retention and
tenant-deletion treatment before any cleanup/migration; no destructive backfill.

## ADR proposal P-HOST: SSR production boundary

Owner: P0 architecture decision and R01 delivery; no provider selected.

| Alternative | Security / compatibility | Operations / cost |
|---|---|---|
| One controlled host/proxy running pinned Node SSR and .NET, durable SQL/media external | Compatible candidate; same-origin TLS/router and private service boundary; single-host failure domain | Explicit patching, restart/drain, backups and capacity responsibility; measured regional cost needed |
| Managed Node/.NET runtimes behind one controlled origin | Compatible candidate if identities/proxy hops/runtime support are demonstrable | Potentially better lifecycle/scaling; cold starts, egress, service identity and log/secret configuration costs need measurement |
| Existing ASP.NET-only/static host | Does not establish Angular SSR capability; cannot silently ship CSR-only | Rejected unless Node capability is proven or a separately approved equivalent SSR architecture replaces it |

Choose region, availability/cost budget, TLS termination and internal transport
before selecting a provider. Require exact trusted proxies/hosts/hop count; reject
forged forwarded metadata and direct-origin access. Set configured canonical origin,
not browser Host. Review cookies/CSRF/Identity keys and real admin proxy routing;
the F01 credential-dropping adapter is public/local-only, not production auth routing.
Review HTML/API/media-specific CSP, HSTS rollout, health/readiness, graceful drains,
minimal redacted logs, alerts, backup/restore and compatible rollback. Durable F08
provider/delivery/reconciliation remains a release dependency; no invented images.

Acceptance: authorized production-like staging, trusted/forged proxy tests, real TLS
and cookies/CSRF, negative tenant tests, failure recovery, two-device QR, Q02 cold/warm
and regional load, retained lab artifacts; field CWV and Search Console require
actual authorized release/traffic. All infrastructure checks currently NOT RUN.

## Prepared S02 first increment (NOT STARTED)

Ownership remains **Antigravity**, Issue #18. Prerequisites: merged/verified S01,
owner acceptance of the S02 plan and explicit implementation authorization. Approve
applicable metadata/index/locale contracts; decisions affecting a later alias or
hosting increment are not implicitly approved by starting this bounded increment.

First proposed increment: real-tenant server-rendered title/description/canonical
and minimal truthful Restaurant JSON-LD, using existing F09 public fields only.
No new owner editor/profile fields, aliases/rename API/schema, image URLs, infrastructure
or language URL variants. Keep Arabic canonical, English toggle/fallback and trusted
origin. Do not mark all of S02 complete; dynamic sitemap/robots and aliases follow.

Write source-HTML tests first for A/B isolation, one H1, exact canonical, hostile
`</script>`/Unicode text safely serialized into parseable JSON-LD, missing/hidden
and failed-API noindex/non-200 responses, GET/HEAD and both encodings. Then implement
the smallest metadata increment after authorization and run all affected S01/M02
SQL/browser/security/Lighthouse and audit gates. No implementation branch/code has
been created here. No host/service authentication choice is silently finalized.
