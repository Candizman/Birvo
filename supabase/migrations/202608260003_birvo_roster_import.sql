-- Birvo roster import: staged preview, then atomic commit.
--
-- Corrected on 2026-08-29 during first execution against PostgreSQL. The original
-- revision had never been run. It wrote audit_events(user_id, resource_type,
-- resource_id, details) -- none of which exist -- and inserted into public.teams
-- without course_id, which is NOT NULL and is also enforced by the
-- ensure_tenant_consistency trigger. Both would have raised at runtime.

-- 1. Preview Roster Import RPC
create or replace function public.preview_roster_import(
  p_import_id uuid,
  p_course_id uuid,
  p_league_id uuid,
  p_actor_id uuid,
  p_source_name text,
  p_total_rows integer,
  p_valid_rows integer,
  p_invalid_rows integer,
  p_rows jsonb
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_record jsonb;
begin
  insert into public.roster_imports (
    id, course_id, league_id, uploaded_by_user_id, source_name, total_rows, valid_rows, invalid_rows
  ) values (
    p_import_id, p_course_id, p_league_id, p_actor_id, substring(p_source_name from 1 for 180), p_total_rows, p_valid_rows, p_invalid_rows
  );

  for row_record in select * from jsonb_array_elements(p_rows)
  loop
    insert into public.roster_import_rows (
      import_id, course_id, row_number, raw_data, normalized_name, normalized_email, handicap, validation_status, validation_message
    ) values (
      p_import_id,
      p_course_id,
      (row_record->>'rowNumber')::integer,
      row_record,
      row_record->>'name',
      case when (row_record->>'email') = '' then null else (row_record->>'email') end,
      (row_record->>'handicap')::numeric,
      row_record->>'status',
      row_record->>'message'
    );
  end loop;

  insert into public.audit_events (
    course_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    p_course_id, p_actor_id, 'roster.import.previewed', 'roster_import', p_import_id::text, 
    jsonb_build_object('totalRows', p_total_rows, 'validRows', p_valid_rows, 'invalidRows', p_invalid_rows)
  );

  return true;
end;
$$;

grant execute on function public.preview_roster_import(uuid, uuid, uuid, uuid, text, integer, integer, integer, jsonb) to service_role;

-- 2. Commit Roster Import RPC
create or replace function public.commit_roster_import(
  p_import_id uuid,
  p_course_id uuid,
  p_actor_id uuid,
  p_credentials jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_import public.roster_imports;
  row_record public.roster_import_rows;
  new_team_id uuid;
  pin_hash text;
  imported_count integer := 0;
begin
  select * into target_import from public.roster_imports
  where id = p_import_id and course_id = p_course_id and status = 'preview'
  for update;

  if not found then
    raise exception 'Import preview not found or already committed.';
  end if;

  for row_record in select * from public.roster_import_rows where import_id = p_import_id and validation_status = 'valid' order by row_number
  loop
    if exists (select 1 from public.teams where league_id = target_import.league_id and status = 'active' and lower(name) = lower(row_record.normalized_name)) then
      raise exception 'Team "%" was added after preview. Generate a new preview.', row_record.normalized_name;
    end if;

    pin_hash := p_credentials->>(row_record.row_number::text);
    if pin_hash is null then
      raise exception 'Credential not provided for row %', row_record.row_number;
    end if;

    insert into public.teams (course_id, league_id, name, contact_email, current_handicap, low_handicap_365, pin)
    values (
      target_import.course_id,
      target_import.league_id,
      row_record.normalized_name,
      row_record.normalized_email,
      coalesce(row_record.handicap, 0),
      coalesce(row_record.handicap, 0),
      pin_hash
    )
    returning id into new_team_id;

    update public.roster_import_rows set created_team_id = new_team_id where id = row_record.id;
    imported_count := imported_count + 1;
  end loop;

  if imported_count = 0 then
    raise exception 'This preview has no valid rows to import.';
  end if;

  update public.roster_imports set status = 'committed', committed_at = now() where id = p_import_id;

  insert into public.audit_events (
    course_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    p_course_id, p_actor_id, 'roster.import.committed', 'roster_import', p_import_id::text, 
    jsonb_build_object('importedRows', imported_count, 'leagueId', target_import.league_id)
  );

  return jsonb_build_object('importedRows', imported_count);
end;
$$;

grant execute on function public.commit_roster_import(uuid, uuid, uuid, jsonb) to service_role;

update public.app_metadata set schema_version=6,
  migration_name='202608260003_birvo_roster_import',updated_at=now()
  where key='database';
