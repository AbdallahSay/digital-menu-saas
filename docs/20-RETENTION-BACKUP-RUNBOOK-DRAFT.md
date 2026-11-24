# Retention and backup runbook (DRAFT, unverified)

Status: draft for owner review. Nothing here has been executed against a production target. It is not legal advice and not a customer-facing promise. Every value marked OWNER is a business decision that is not made yet.

## Inputs the owner must supply
| Input | Status |
|---|---|
| Lead / personal-data retention period (days) | OWNER, unset |
| Backup frequency and backup retention | OWNER, unset |
| Recovery point / recovery time targets | OWNER, unset |
| Hosting target backup features (MonsterASP is a Windows lead, not confirmed) | Unverified |
| Who performs restores and who approves them | OWNER, unset |

## Backups (to be verified on the real target)
1. Take full SQL Server backups on the schedule the owner chooses. Confirm what the host actually offers before promising anything.
2. Store backups outside the database host's failure domain. Encrypt them. Limit access to named people.
3. Media files (uploads) need their own backup. The DB backup does not cover them.
4. Backups must not hold secrets in plain text. Keep connection strings and keys out of backup scripts and logs.

## Restore test (acceptance AC-13, NOT RUN)
1. Restore the latest backup into a fresh, isolated database (never over production).
2. Apply no new migrations first, then run the migration check; confirm the migration history matches.
3. Run the tenant-isolation and public menu test classes against the restored copy.
4. Record date, backup used, duration, and result. A restore that was never done is not a backup.

## Retention
1. Lead data is deleted after the owner-approved period. The current expiry job deletes about 15 minutes after expiry, at a fixed UTC hour; it is not instant. Notice text must say so.
2. Backups hold deleted data until they age out. The notice must not claim immediate erasure while backups exist.
3. Restoring a backup must re-run the deletion job before the restored system takes traffic.

## Open items
- No production target, so no real evidence for Q01/Q02/R01.
- Retention days, notice approval and controller identity are owner inputs.
