-- Birvo multi-tenant production foundation (PostgreSQL / Supabase)
begin;
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, phone text,
  platform_role text not null default 'user' check (platform_role in ('user','superadmin')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.courses (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  address text not null default '', city text not null default '', state text not null default '',
  postal_code text not null default '', country_code text not null default 'US' check (country_code ~ '^[A-Z]{2}$'),
  timezone text not null default 'America/New_York', contact_email text, contact_phone text,
  primary_color text not null default '#176B45' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'), local_rules text,
  account_status text not null default 'setup' check (account_status in ('setup','trial','active','past_due','suspended','closed')),
  subscription_plan text not null default 'starter', stripe_customer_id text unique, stripe_subscription_id text unique,
  stripe_status text not null default 'not_configured', trial_ends_at timestamptz, onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.course_memberships (
  id uuid primary key default extensions.gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, email text not null,
  role text not null check (role in ('course_owner','course_admin','assistant_admin','scorekeeper')),
  status text not null default 'active' check (status in ('active','suspended','removed')),
  joined_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(course_id,user_id)
);
create unique index course_memberships_course_email_active_idx on public.course_memberships(course_id,lower(email)) where status <> 'removed';
create index course_memberships_user_status_idx on public.course_memberships(user_id,status);
create table public.course_invitations (
  id uuid primary key default extensions.gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  email text not null, role text not null check (role in ('course_admin','assistant_admin','scorekeeper')),
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired','failed')),
  invited_by_user_id uuid not null references auth.users(id), auth_user_id uuid references auth.users(id) on delete set null,
  external_invitation_sent_at timestamptz, expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz, revoked_at timestamptz, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index course_invitations_pending_idx on public.course_invitations(course_id,lower(email)) where status='pending';

create table public.course_holes (
  id uuid primary key default extensions.gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  layout_name text not null default 'Main Course', hole_number smallint not null check (hole_number between 1 and 36),
  par smallint not null check (par between 3 and 6), stroke_index smallint not null check (stroke_index between 1 and 36),
  notes text, is_under_maintenance boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(course_id,layout_name,hole_number), unique(course_id,layout_name,stroke_index)
);
create table public.course_tee_boxes (
  id uuid primary key default extensions.gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  layout_name text not null default 'Main Course', name text not null,
  color_hex text not null default '#FFFFFF' check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  eligibility text not null default 'all' check (eligibility in ('all','men','women','senior','junior')),
  course_rating numeric(4,1) not null check (course_rating between 40 and 90),
  slope_rating smallint not null check (slope_rating between 55 and 155), total_yards integer not null check (total_yards between 500 and 10000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(course_id,layout_name,name)
);
create table public.leagues (
  id uuid primary key default extensions.gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  name text not null, scoring_format text not null default 'net_stroke_play',
  status text not null default 'draft' check (status in ('draft','active','complete','archived')),
  current_week integer not null default 1 check(current_week>=1), season_length_weeks integer not null default 12 check(season_length_weeks between 1 and 52),
  starts_on date, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(course_id,name)
);
create table public.teams (
  id uuid primary key default extensions.gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade, name text not null, contact_email text,
  current_handicap numeric(4,1) not null default 0 check(current_handicap between -10 and 54),
  status text not null default 'active' check(status in ('active','waitlisted','withdrawn','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(league_id,name)
);
create table public.matches (
  id uuid primary key default extensions.gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade, week_number integer not null check(week_number>=1),
  status text not null default 'pending' check(status in ('pending','open','completed','locked','rained_out','cancelled')),
  match_date date, locked_at timestamptz, locked_by_user_id uuid references auth.users(id) on delete set null, lock_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(league_id,week_number)
);
create table public.scores (
  id uuid primary key default extensions.gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade, team_id uuid not null references public.teams(id) on delete cascade,
  gross_score smallint check(gross_score between 1 and 200), handicap_used numeric(4,1), net_score numeric(5,1), points_earned numeric(5,2) not null default 0,
  attestation_status text not null default 'pending' check(attestation_status in ('pending','attested','disputed','approved')),
  reconciliation_status text not null default 'ok' check(reconciliation_status in ('ok','needs_review')),
  modified_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(match_id,team_id)
);
create table public.score_hole_details (
  id uuid primary key default extensions.gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  score_id uuid not null references public.scores(id) on delete cascade, hole_number smallint not null check(hole_number between 1 and 36),
  gross_score smallint not null check(gross_score between 1 and 20), putts smallint check(putts between 0 and 10),
  penalty_strokes smallint not null default 0 check(penalty_strokes between 0 and 20),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(score_id,hole_number)
);
create table public.score_correction_requests (
  id uuid primary key default extensions.gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  score_id uuid not null references public.scores(id) on delete cascade, requested_by_user_id uuid not null references auth.users(id),
  requested_gross_score smallint not null check(requested_gross_score between 1 and 200), reason text not null check(length(trim(reason)) between 5 and 1000),
  status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
  reviewed_by_user_id uuid references auth.users(id), review_note text, reviewed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.audit_events (
  id bigint generated always as identity primary key, course_id uuid references public.courses(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null, action text not null, target_type text not null, target_id text,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index audit_events_course_created_idx on public.audit_events(course_id,created_at desc);
create table public.course_setup_steps (
  course_id uuid not null references public.courses(id) on delete cascade,
  step_key text not null check(step_key in ('course_profile','course_layout','tee_boxes','first_league','roster','scoring_ready')),
  status text not null default 'pending' check(status in ('pending','in_progress','complete','blocked')),
  completed_by_user_id uuid references auth.users(id) on delete set null, completed_at timestamptz, updated_at timestamptz not null default now(),
  primary key(course_id,step_key)
);
create table public.public_link_revocations (
  id uuid primary key default extensions.gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  purpose text not null check(purpose in ('standings','tv','player')), token_hash text not null unique,
  revoked_by_user_id uuid not null references auth.users(id), expires_at timestamptz, revoked_at timestamptz not null default now()
);
create table public.public_link_settings (
  course_id uuid not null references public.courses(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  purpose text not null check(purpose in ('standings','tv','player')), token_version integer not null default 1 check(token_version>=1),
  rotated_by_user_id uuid references auth.users(id) on delete set null, rotated_at timestamptz, primary key(league_id,purpose)
);
create table public.roster_imports (
  id uuid primary key default extensions.gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade, uploaded_by_user_id uuid not null references auth.users(id),
  source_name text, status text not null default 'preview' check(status in ('preview','committed','cancelled','failed')),
  total_rows integer not null default 0, valid_rows integer not null default 0, invalid_rows integer not null default 0,
  created_at timestamptz not null default now(), committed_at timestamptz
);
create table public.roster_import_rows (
  id bigint generated always as identity primary key, course_id uuid not null references public.courses(id) on delete cascade,
  import_id uuid not null references public.roster_imports(id) on delete cascade, row_number integer not null, raw_data jsonb not null,
  normalized_name text, normalized_email text, handicap numeric(4,1),
  validation_status text not null check(validation_status in ('valid','invalid','duplicate')), validation_message text,
  created_team_id uuid references public.teams(id) on delete set null, unique(import_id,row_number)
);

create function public.set_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
do $$ declare n text; begin foreach n in array array['profiles','courses','course_memberships','course_invitations','course_holes','course_tee_boxes','leagues','teams','matches','scores','score_hole_details','score_correction_requests'] loop
  execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',n);
end loop; end $$;

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,full_name) values(new.id,nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')),'')) on conflict(id) do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=(select auth.uid()) and platform_role='superadmin') $$;
create function public.is_course_member(requested_course_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select public.is_platform_admin() or exists(select 1 from public.course_memberships where course_id=requested_course_id and user_id=(select auth.uid()) and status='active') $$;
create function public.has_course_role(requested_course_id uuid,allowed_roles text[]) returns boolean language sql stable security definer set search_path='' as $$
  select public.is_platform_admin() or exists(select 1 from public.course_memberships where course_id=requested_course_id and user_id=(select auth.uid()) and status='active' and role=any(allowed_roles)) $$;

create function public.ensure_tenant_consistency() returns trigger language plpgsql set search_path='' as $$
declare parent_course uuid; parent_league uuid;
begin
  if tg_table_name in ('teams','matches','roster_imports','public_link_settings','public_link_revocations') then select course_id into parent_course from public.leagues where id=new.league_id;
  elsif tg_table_name='scores' then
    select course_id,league_id into parent_course,parent_league from public.matches where id=new.match_id;
    if not exists(select 1 from public.teams where id=new.team_id and course_id=new.course_id and league_id=parent_league) then raise exception 'Cross-league or cross-tenant team rejected'; end if;
  elsif tg_table_name='score_hole_details' then select course_id into parent_course from public.scores where id=new.score_id;
  elsif tg_table_name='score_correction_requests' then select course_id into parent_course from public.scores where id=new.score_id;
  elsif tg_table_name='roster_import_rows' then select course_id into parent_course from public.roster_imports where id=new.import_id;
  end if;
  if parent_course is null or parent_course<>new.course_id then raise exception 'Cross-tenant reference rejected'; end if;
  return new;
end $$;
do $$ declare n text; begin foreach n in array array['teams','matches','scores','score_hole_details','score_correction_requests','roster_imports','roster_import_rows','public_link_settings','public_link_revocations'] loop
  execute format('create trigger ensure_tenant_consistency before insert or update on public.%I for each row execute function public.ensure_tenant_consistency()',n);
end loop; end $$;

create function public.prevent_locked_score_change() returns trigger language plpgsql set search_path='' as $$
declare target_match_id uuid;
begin
  if tg_op='DELETE' then target_match_id:=old.match_id; else target_match_id:=new.match_id; end if;
  if exists(select 1 from public.matches where id=target_match_id and locked_at is not null) then
    raise exception 'This round is locked. Create a correction request instead.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger prevent_locked_score_change before update or delete on public.scores for each row execute function public.prevent_locked_score_change();

create function public.protect_last_course_owner() returns trigger language plpgsql security definer set search_path='' as $$
declare removes_owner boolean;
begin
  if tg_op='DELETE' then removes_owner:=true; else removes_owner:=new.role<>'course_owner' or new.status<>'active'; end if;
  if old.role='course_owner' and old.status='active' and removes_owner
    and (select count(*) from public.course_memberships where course_id=old.course_id and role='course_owner' and status='active')<=1
  then raise exception 'A course must always have an active owner'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger protect_last_course_owner before update or delete on public.course_memberships for each row execute function public.protect_last_course_owner();

create function public.audit_score_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.gross_score is distinct from new.gross_score or old.net_score is distinct from new.net_score or old.reconciliation_status is distinct from new.reconciliation_status then
    insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
    values(new.course_id,(select auth.uid()),'score.updated','score',new.id::text,
      jsonb_build_object('old_gross',old.gross_score,'new_gross',new.gross_score,'old_net',old.net_score,'new_net',new.net_score,'old_reconciliation',old.reconciliation_status,'new_reconciliation',new.reconciliation_status));
  end if;
  return new;
end $$;
create trigger audit_score_change after update on public.scores for each row execute function public.audit_score_change();

create function public.accept_course_invitation(invitation_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare invitation public.course_invitations; authenticated_email text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  authenticated_email:=lower(coalesce((select auth.jwt())->>'email',''));
  select * into invitation from public.course_invitations where id=invitation_id for update;
  if not found or invitation.status<>'pending' or invitation.expires_at<=now() then raise exception 'Invitation is no longer valid'; end if;
  if lower(invitation.email)<>authenticated_email then raise exception 'Invitation email does not match signed-in account'; end if;
  insert into public.course_memberships(course_id,user_id,email,role,status)
    values(invitation.course_id,(select auth.uid()),authenticated_email,invitation.role,'active')
    on conflict(course_id,user_id) do update set email=excluded.email,role=excluded.role,status='active',updated_at=now();
  update public.course_invitations set status='accepted',auth_user_id=(select auth.uid()),accepted_at=now(),updated_at=now() where id=invitation.id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id)
    values(invitation.course_id,(select auth.uid()),'staff.invitation.accepted','course_invitation',invitation.id::text);
  return invitation.course_id;
end $$;

do $$ declare n text; begin foreach n in array array['profiles','courses','course_memberships','course_invitations','course_holes','course_tee_boxes','leagues','teams','matches','scores','score_hole_details','score_correction_requests','audit_events','course_setup_steps','public_link_revocations','public_link_settings','roster_imports','roster_import_rows'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from anon',n); execute format('revoke all on public.%I from authenticated',n);
end loop; end $$;

grant select,update on public.profiles to authenticated;
grant select on public.courses,public.course_memberships,public.course_invitations,public.audit_events,public.public_link_revocations,public.public_link_settings to authenticated;
grant select,insert,update,delete on public.course_holes,public.course_tee_boxes,public.leagues,public.teams,public.matches,public.scores,public.score_hole_details to authenticated;
grant select,insert,update on public.score_correction_requests,public.course_setup_steps,public.roster_imports,public.roster_import_rows to authenticated;
grant usage,select on all sequences in schema public to authenticated;
grant execute on function public.accept_course_invitation(uuid) to authenticated;

create policy profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()) or public.is_platform_admin());
create policy profiles_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()) and (platform_role='user' or public.is_platform_admin()));
create policy courses_read on public.courses for select to authenticated using(public.is_course_member(id));
create policy memberships_read on public.course_memberships for select to authenticated using(user_id=(select auth.uid()) or public.has_course_role(course_id,array['course_owner','course_admin']));
create policy invitations_read on public.course_invitations for select to authenticated using(public.has_course_role(course_id,array['course_owner','course_admin']) or lower(email)=lower(coalesce((select auth.jwt())->>'email','')));

do $$ declare n text; begin foreach n in array array['course_holes','course_tee_boxes','leagues','teams','matches','course_setup_steps','roster_imports','roster_import_rows'] loop
  execute format('create policy %I on public.%I for select to authenticated using(public.is_course_member(course_id))',n||'_read',n);
  execute format('create policy %I on public.%I for all to authenticated using(public.has_course_role(course_id,array[''course_owner'',''course_admin''])) with check(public.has_course_role(course_id,array[''course_owner'',''course_admin'']))',n||'_manage',n);
end loop; end $$;
create policy scores_read on public.scores for select to authenticated using(public.is_course_member(course_id));
create policy scores_write on public.scores for all to authenticated using(public.has_course_role(course_id,array['course_owner','course_admin','assistant_admin','scorekeeper'])) with check(public.has_course_role(course_id,array['course_owner','course_admin','assistant_admin','scorekeeper']));
create policy score_holes_read on public.score_hole_details for select to authenticated using(public.is_course_member(course_id));
create policy score_holes_write on public.score_hole_details for all to authenticated using(public.has_course_role(course_id,array['course_owner','course_admin','assistant_admin','scorekeeper'])) with check(public.has_course_role(course_id,array['course_owner','course_admin','assistant_admin','scorekeeper']));
create policy corrections_read on public.score_correction_requests for select to authenticated using(public.is_course_member(course_id));
create policy corrections_create on public.score_correction_requests for insert to authenticated with check(public.is_course_member(course_id) and requested_by_user_id=(select auth.uid()));
create policy corrections_review on public.score_correction_requests for update to authenticated using(public.has_course_role(course_id,array['course_owner','course_admin'])) with check(public.has_course_role(course_id,array['course_owner','course_admin']));
create policy audit_read on public.audit_events for select to authenticated using(public.has_course_role(course_id,array['course_owner','course_admin']));
create policy revocations_read on public.public_link_revocations for select to authenticated using(public.has_course_role(course_id,array['course_owner','course_admin']));
create policy link_settings_read on public.public_link_settings for select to authenticated using(public.is_course_member(course_id));
commit;
