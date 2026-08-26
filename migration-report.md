# Birvo Sprint 0.3.1 — Migration Correctness and Test Isolation

## Verified outcomes

- The working database is `birvo.db`; database files and backups are excluded from Git.
- `test/test-wrapper.js` records the working database size and modification time before the suite and verifies the same values afterward.
- Legacy migrations are transactional and advance `user_version` only after success.
- Foreign-key and integrity checks pass on clean and migrated test databases.
- Duplicate team/week records are reduced deterministically while preserving the latest valid score.
- Missing handicap snapshots remain `NULL` and are marked `needs_review` instead of being rewritten as zero.
- Orphaned legacy records fail and roll back rather than using a magic league identifier.
- Rapid score entry rolls back the full batch when any team is inactive, belongs to another league, or contains an invalid score.
- Historical `handicap_used` snapshots are preserved when a score is updated.

## Current verification command

```bash
npm test
```

The authoritative current product status is maintained in [BIRVO_STATUS.md](./BIRVO_STATUS.md).
