# Atomic task tracker — setup and import

**One backlog, one live board.** Versioned task catalog in this repository; after import choose **Linear or ClickUp** as the operational source of truth (do not maintain two competing live boards). GitHub is the code/PR evidence store.

## Inventory

- [tasks.json](tasks.json): **144** tasks, complete AC/verification/dependency graph/status/agent role; checked for duplicates and cycles.
- [planning-backend.json](planning-backend.json), [frontend.json](frontend.json), [qa-operations.json](qa-operations.json): original curated slices.
- [clickup-import.csv](clickup-import.csv): 144 task rows, `Task Name`, `Task ID`, `Task Description`, `Status`, numerical `Priority`, tags and custom field columns.
- [linear-import.csv](linear-import.csv): 144 issues with Title, Description, Priority, Status, Labels, Estimate and empty user columns; align team workflow status names during import.
- [TASK-PACKET.md](TASK-PACKET.md): exact subagent execution and evidence rules.

## ClickUp

1. Create Space **MenuSaaS Development** with folders or Lists: Planning, Backend, Frontend, QA, Operations.
2. Configure status values: BACKLOG, READY, IN_PROGRESS, IN_REVIEW, BLOCKED, DONE. Suggested import mapping: CSV `Backlog` → BACKLOG, `Ready` → READY.
3. ClickUp Workspace → Settings → Imports / Exports → Spreadsheet importer; upload `clickup-import.csv`. Map **Task Name** (required), Task ID, Task Description, Priority, Status and Tags. Map extra columns as Custom Fields when desired. Every row becomes one task; do not import twice.
4. Use Workstream/Area to group views, and manually establish **Blocked by** dependencies from the IDs in the task description or automate post-import using a separately approved authenticated app integration.
5. Validate 144 task records, one initial READY record (PM-001), 0 DONE. Review the import report for discarded/custom fields.

Official preparation docs: https://help.clickup.com/hc/en-us/articles/6310821748759-Prepare-a-spreadsheet-for-import

## Linear (connected provider alternative)

1. Create one project **MenuSaaS — Atomic Delivery**, and use team workflow statuses Backlog, Todo/Ready, In Progress, In Review, Blocked, Done.
2. The separate `linear-import.csv` has documented Linear export-compatible headers (Title, Description, Priority, Status, Assignee, Labels, Estimate, Created, Completed). The recommended method is Linear Settings → Import/Export → use the supported importer/CLI **following current docs and obtaining their exported CSV template**. A workspace admin may be required.
3. Map `READY` to Todo if the team's workflow lacks Ready. Keep exact stable IDs in titles/descriptions, and map labels Workstream and mode. After import, confirm 144 created and no duplicates.
4. Dependencies in `depends_on` are **not guaranteed to import as native blocked-by relationships from CSV**: link them explicitly in Linear or with a future approved authenticated connector action. Do not call the graph configured until you verify it.
5. The `tasks.json` graph remains a deterministic dependency reference until true board issue links are confirmed.

Official guide: https://linear.app/docs/import-issues and https://linear.app/docs/cli-importer

## Distinguish old GitHub milestones

Legacy issues #4–#23 and the larger `automation/tasks.json` describe F/S/U milestone work and are intentionally untouched. **Do not** blindly import/close/reopen the old milestone issues or run the dormant automation dispatcher. For verified existing code, a new atomic task may be accepted as **AUDIT ONLY**, recording test evidence and a reviewer link rather than duplicating code.

## Status updates

- The board issue is authoritative after import. Record status updates there, not by editing the source CSV for every PR.
- Set `IN_PROGRESS` only when agent assignment and branch lease exist.
- Set `IN_REVIEW` only with actual PR and test/evidence links.
- Set `DONE` only after human-reviewed merge or approved evidence-only audit/decision.
- For BLOCKED: include explicit dependency or failing check, reproduce, and link to risk/ADR.
- The coordinator moves dependents to READY only after all linked dependency IDs have DONE evidence.

## Project dashboard / recommended saved views

- READY NOW (only one at the initial snapshot: PM-001)
- FRONTEND: READY or IN_PROGRESS
- BACKEND: READY or IN_PROGRESS
- BLOCKED / NEEDS DECISION (especially PM-004, PM-005, PM-007 etc)
- IN REVIEW (PR required)
- COMPLETED BY MILESTONE / BY REVIEWER

## Why this is resource-efficient

Backend has zero Figma screenshot requirement. Tiny frontend refactors use component tests, source inspection, and targeted browser checks, not 10+ screenshots. Only whole component-family checkpoints and affected final regression need representative visual captures. Never skip authorization, tenant separation, SSR raw HTML or release tests to save credits.

