# F06/F07 — Catalog API (Codex preferred)

Read AGENTS and docs 01/03/04/06/08. Plan and implement **only F06 first**, obtain review; then F07 in a separate PR. Preserve strict server-derived tenant context and composite-FK integrity. Implement explicit DTO validation, pagination, sorting, category visibility, item visibility and price decimal constraints, soft deletion, optimistic concurrency handling.

Prove: owner A cannot access B's category/item by ID; foreign-category product request fails without mutation; admin/public DTOs separate; invalid price and max lengths rejected; concurrent edit conflict; deleting category with items produces safe conflict. Add integration tests against SQL Server. Update OpenAPI and docs with actual endpoint signatures. No image upload, UI or ordering in this task.
