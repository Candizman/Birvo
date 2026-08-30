# Database tests

The suites in `database/` are [pgTAP](https://pgtap.org/) and run against PostgreSQL, not against the Node test runner. `npm test` does not include them.

| Suite | Covers |
|---|---|
| `001_schema_contract.test.sql` | Tables, columns, RLS, the exposed RPC surface, role grants, schema version |
| `002_tenant_isolation.test.sql` | Two courses, adversarially: what one tenant can see and reach of the other |
| `003_scoring_rules.test.sql` | The business rules that live in SQL — score entry, handicaps, locking, ghosts, workspace creation |

## Running them

Paste a file into the Supabase SQL editor and run it. Each wraps itself in a transaction and ends in `rollback`, so nothing is left behind.

`pgtap` must be installed once per database:

```sql
create extension if not exists pgtap with schema extensions;
```

## Reading the result

This pgTAP build returns each assertion as a text row and does not materialise a results table, so a client that shows only the final result set will show only the last assertion. To see every failure at once, capture the assertions into a temp table:

```sql
begin;
set local search_path = public, extensions;
create temp table tap(seq serial, line text) on commit drop;
select plan(31);

-- prefix every assertion:  insert into pg_temp.tap(line) select is(...);
-- if the suite switches role, grant the temp table to it first:
--   grant insert on table pg_temp.tap to authenticated;
--   grant usage, select on all sequences in schema pg_temp to authenticated;

select
  count(*) filter (where line like 'ok %')     as passed,
  count(*) filter (where line not like 'ok %') as failed,
  coalesce(string_agg(line, ' ||| ' order by seq)
           filter (where line not like 'ok %'), '(no failures)') as failures
from pg_temp.tap;
rollback;
```

## When to update them

`001` asserts the schema version. Every migration that bumps `app_metadata.schema_version` must bump it here too, and add its new functions to the exposed-surface list. A stale version here is the first sign the suite no longer describes the database.
