-- Birvo PostgreSQL feature-parity schema.
-- Applies after 202608240001_birvo_tenant_foundation.sql.
begin;

-- Core columns used by the current application but absent from the foundation.
alter table public.courses
  add column logo_url text,
  add column weather_lat numeric(9,6),
  add column weather_lon numeric(9,6),
  add column currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$');

alter table public.course_holes
  add column pin_position text not null default 'center'
    check (pin_position in ('front','center','back'));

alter table public.course_tee_boxes rename column eligibility to gender;
alter table public.course_tee_boxes
  add column total_meters integer generated always as (round(total_yards * 0.9144)) stored;

alter table public.leagues rename column scoring_format to game_format;
update public.leagues set game_format='stroke_play' where game_format='net_stroke_play';
alter table public.leagues alter column game_format set default 'stroke_play';
alter table public.leagues
  add constraint leagues_game_format_check check (
    game_format in ('stroke_play','match_play','stableford','scramble','skins','nassau')
  ),
  add column trashed_at timestamptz,
  add column playoff_bracket jsonb;
alter table public.leagues drop constraint if exists leagues_status_check;
alter table public.leagues add constraint leagues_status_check
  check (status in ('draft','active','complete','archived','trashed'));

alter table public.teams
  add column pin text,
  add column ghin_number text,
  add column low_handicap_365 numeric(4,1) not null default 0
    check (low_handicap_365 between -10 and 54);
create unique index teams_league_name_casefold_idx on public.teams(league_id,lower(name));

alter table public.scores
  add column attested_by_team_id uuid references public.teams(id) on delete set null,
  add column scorecard_photo_url text;

alter table public.score_hole_details
  add column fairway_hit boolean,
  add column gir boolean,
  add column sand_saves boolean;

create unique index score_corrections_one_pending_per_score_idx
  on public.score_correction_requests(score_id) where status='pending';

-- Scheduling and league operations.
create table public.match_fixtures (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  week_number integer not null check (week_number between 1 and 52),
  team1_id uuid not null references public.teams(id) on delete cascade,
  team2_id uuid references public.teams(id) on delete cascade,
  scheduled_date date,
  scheduled_time time,
  is_bye boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index match_fixtures_league_week_idx on public.match_fixtures(league_id,week_number);

create table public.tee_times (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  week_number integer not null check (week_number between 1 and 52),
  start_time time not null,
  starting_hole smallint not null check (starting_hole between 1 and 36),
  starting_group text not null default 'A' check (length(starting_group) between 1 and 10),
  team1_id uuid references public.teams(id) on delete set null,
  team2_id uuid references public.teams(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled','started','complete','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tee_times_league_week_idx on public.tee_times(league_id,week_number);

create table public.substitutes (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  handicap numeric(4,1) not null default 0 check (handicap between -10 and 54),
  phone text,
  email text,
  status text not null default 'available' check (status in ('available','assigned','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_rsvps (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  week_number integer not null check (week_number between 1 and 52),
  status text not null check (status in ('attending','not_attending','maybe','needs_sub','unknown')),
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id,week_number)
);

-- Immutable operational audit detail.
create table public.handicap_audit_logs (
  id bigint generated always as identity primary key,
  course_id uuid not null references public.courses(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  old_handicap numeric(4,1),
  new_handicap numeric(4,1),
  differential numeric(5,2),
  change_type text,
  reason text,
  modified_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index handicap_audit_course_created_idx on public.handicap_audit_logs(course_id,created_at desc);

create table public.score_audit_logs (
  id bigint generated always as identity primary key,
  course_id uuid not null references public.courses(id) on delete cascade,
  score_id uuid not null references public.scores(id) on delete cascade,
  hole_number smallint check (hole_number between 1 and 36),
  old_gross smallint,
  new_gross smallint,
  reason text not null,
  modified_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index score_audit_course_created_idx on public.score_audit_logs(course_id,created_at desc);

-- Player portal data. Player-session access remains server mediated.
create table public.player_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  team_id uuid not null unique references public.teams(id) on delete cascade,
  bio text check (length(bio) <= 2000),
  avatar_url text,
  favorite_club text,
  handicap_goal numeric(4,1) check (handicap_goal between -10 and 54),
  theme_preference text not null default 'system' check (theme_preference in ('system','light','dark')),
  language text not null default 'en-US',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_badges (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  badge_key text not null,
  badge_title text not null,
  badge_icon text,
  awarded_at timestamptz not null default now(),
  unique(team_id,badge_key)
);

create table public.player_bag_clubs (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  club_name text not null,
  brand text,
  avg_distance_yards integer check (avg_distance_yards between 0 and 450),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.round_notes (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  week_number integer not null check (week_number between 1 and 52),
  notes text check (length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id,week_number)
);

-- Clubhouse publishing.
create table public.tv_displays (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null,
  template_type text not null default 'leaderboard',
  auto_scroll_speed integer not null default 10 check (auto_scroll_speed between 3 and 120),
  show_announcements boolean not null default true,
  announcement_text text,
  celebration_effects boolean not null default true,
  sound_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(league_id,name)
);

create table public.tv_sponsors (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null,
  logo_url text,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tv_sponsors_league_order_idx on public.tv_sponsors(league_id,display_order);

-- Commercial records exist for future use but receive no authenticated write grants.
create table public.billing_invoices (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  invoice_number text not null unique,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('draft','open','paid','void','uncollectible')),
  plan_name text,
  period_start date,
  period_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coupon_codes (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  max_uses integer check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(course_id,code)
);

create table public.tournament_entry_fees (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  fee_amount numeric(12,2) not null check (fee_amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','refunded','waived')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(league_id,team_id)
);

-- Server-only data. The schema is intentionally not exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
create table private.rate_limit_events (
  id bigint generated always as identity primary key,
  scope text not null,
  subject_hash text not null,
  occurred_at timestamptz not null default now()
);
create index rate_limit_subject_window_idx
  on private.rate_limit_events(scope,subject_hash,occurred_at);

-- Index tenant and relationship keys used by RLS policies and common page reads.
create index course_holes_course_idx on public.course_holes(course_id);
create index course_tee_boxes_course_idx on public.course_tee_boxes(course_id);
create index leagues_course_status_idx on public.leagues(course_id,status);
create index teams_course_league_status_idx on public.teams(course_id,league_id,status);
create index matches_course_league_week_idx on public.matches(course_id,league_id,week_number);
create index scores_course_match_idx on public.scores(course_id,match_id);
create index score_hole_details_course_score_idx on public.score_hole_details(course_id,score_id);
create index score_correction_course_status_idx on public.score_correction_requests(course_id,status);
create index course_setup_steps_course_idx on public.course_setup_steps(course_id);
create index public_link_settings_course_league_idx on public.public_link_settings(course_id,league_id);
create index public_link_revocations_course_league_idx on public.public_link_revocations(course_id,league_id);
create index roster_imports_course_league_idx on public.roster_imports(course_id,league_id);
create index roster_import_rows_course_import_idx on public.roster_import_rows(course_id,import_id);
create index match_fixtures_course_league_idx on public.match_fixtures(course_id,league_id);
create index tee_times_course_league_idx on public.tee_times(course_id,league_id);
create index substitutes_course_league_idx on public.substitutes(course_id,league_id);
create index player_rsvps_course_team_idx on public.player_rsvps(course_id,team_id);
create index score_audit_course_score_idx on public.score_audit_logs(course_id,score_id);
create index player_profiles_course_team_idx on public.player_profiles(course_id,team_id);
create index player_badges_course_team_idx on public.player_badges(course_id,team_id);
create index player_bag_course_team_idx on public.player_bag_clubs(course_id,team_id);
create index round_notes_course_team_idx on public.round_notes(course_id,team_id);
create index tv_displays_course_league_idx on public.tv_displays(course_id,league_id);
create index tv_sponsors_course_league_idx on public.tv_sponsors(course_id,league_id);
create index billing_invoices_course_idx on public.billing_invoices(course_id);
create index coupon_codes_course_idx on public.coupon_codes(course_id);
create index tournament_fees_course_league_idx on public.tournament_entry_fees(course_id,league_id);

-- A non-tenant schema marker used by readiness checks through the service client.
create table public.app_metadata (
  key text primary key,
  schema_version integer not null,
  migration_name text not null,
  updated_at timestamptz not null default now()
);
insert into public.app_metadata(key,schema_version,migration_name)
values('database',2,'202608250001_birvo_feature_parity');

-- Keep every derived tenant key consistent with its parent record.
create or replace function public.ensure_tenant_consistency()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  parent_course uuid;
  parent_league uuid;
begin
  if tg_table_name in (
    'teams','matches','roster_imports','public_link_settings','public_link_revocations',
    'match_fixtures','tee_times','substitutes','tv_displays','tv_sponsors','tournament_entry_fees'
  ) then
    select course_id into parent_course from public.leagues where id=new.league_id;
    parent_league := new.league_id;
  elsif tg_table_name='scores' then
    select course_id,league_id into parent_course,parent_league from public.matches where id=new.match_id;
    if not exists(
      select 1 from public.teams
      where id=new.team_id and course_id=new.course_id and league_id=parent_league
    ) then raise exception 'Cross-league or cross-tenant team rejected'; end if;
    if new.attested_by_team_id is not null and not exists(
      select 1 from public.teams
      where id=new.attested_by_team_id and course_id=new.course_id and league_id=parent_league
    ) then raise exception 'Cross-league or cross-tenant attesting team rejected'; end if;
  elsif tg_table_name in ('score_hole_details','score_correction_requests','score_audit_logs') then
    select course_id into parent_course from public.scores where id=new.score_id;
  elsif tg_table_name='roster_import_rows' then
    select course_id into parent_course from public.roster_imports where id=new.import_id;
  elsif tg_table_name in ('player_rsvps','player_profiles','player_badges','player_bag_clubs','round_notes','handicap_audit_logs') then
    select course_id,league_id into parent_course,parent_league from public.teams where id=new.team_id;
  end if;

  if parent_course is null or parent_course<>new.course_id then
    raise exception 'Cross-tenant reference rejected';
  end if;

  if tg_table_name in ('match_fixtures','tee_times') then
    if new.team1_id is not null and not exists(
      select 1 from public.teams where id=new.team1_id and course_id=new.course_id and league_id=parent_league
    ) then raise exception 'Cross-league team1 rejected'; end if;
    if new.team2_id is not null and not exists(
      select 1 from public.teams where id=new.team2_id and course_id=new.course_id and league_id=parent_league
    ) then raise exception 'Cross-league team2 rejected'; end if;
  elsif tg_table_name='tournament_entry_fees' and not exists(
    select 1 from public.teams where id=new.team_id and course_id=new.course_id and league_id=parent_league
  ) then raise exception 'Cross-league fee team rejected';
  elsif tg_table_name='handicap_audit_logs' and new.match_id is not null and not exists(
    select 1 from public.matches where id=new.match_id and course_id=new.course_id and league_id=parent_league
  ) then raise exception 'Cross-league handicap audit match rejected';
  end if;

  return new;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'match_fixtures','tee_times','substitutes','player_rsvps','handicap_audit_logs',
    'score_audit_logs','player_profiles','player_badges','player_bag_clubs','round_notes',
    'tv_displays','tv_sponsors','tournament_entry_fees'
  ] loop
    execute format(
      'create trigger ensure_tenant_consistency before insert or update on public.%I for each row execute function public.ensure_tenant_consistency()',
      table_name
    );
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'match_fixtures','tee_times','substitutes','player_rsvps','player_profiles',
    'player_bag_clubs','round_notes','tv_displays','tv_sponsors','billing_invoices','tournament_entry_fees'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end $$;

-- Lock down every newly exposed table before adding narrow grants and policies.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'match_fixtures','tee_times','substitutes','player_rsvps','handicap_audit_logs',
    'score_audit_logs','player_profiles','player_badges','player_bag_clubs','round_notes',
    'tv_displays','tv_sponsors','billing_invoices','coupon_codes','tournament_entry_fees','app_metadata'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on public.%I from anon',table_name);
    execute format('revoke all on public.%I from authenticated',table_name);
  end loop;
end $$;

grant select on public.match_fixtures,public.tee_times,public.substitutes,public.player_rsvps,
  public.handicap_audit_logs,public.score_audit_logs,public.player_profiles,public.player_badges,
  public.player_bag_clubs,public.round_notes,public.tv_displays,public.tv_sponsors to authenticated;
grant select,insert,update,delete on public.match_fixtures,public.tee_times,public.substitutes,
  public.player_profiles,public.player_badges,public.player_bag_clubs,public.round_notes,
  public.tv_displays,public.tv_sponsors to authenticated;
grant select,insert,update on public.player_rsvps to authenticated;
grant select on public.billing_invoices,public.coupon_codes,public.tournament_entry_fees to authenticated;
grant usage,select on all sequences in schema public to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'match_fixtures','tee_times','substitutes','player_rsvps','handicap_audit_logs',
    'score_audit_logs','player_profiles','player_badges','player_bag_clubs','round_notes','tv_displays','tv_sponsors'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using(public.is_course_member(course_id))',
      table_name||'_read',table_name
    );
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'match_fixtures','tee_times','substitutes','player_profiles','player_badges',
    'player_bag_clubs','round_notes','tv_displays','tv_sponsors'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using(public.has_course_role(course_id,array[''course_owner'',''course_admin''])) with check(public.has_course_role(course_id,array[''course_owner'',''course_admin'']))',
      table_name||'_manage',table_name
    );
  end loop;
end $$;

create policy player_rsvps_manage on public.player_rsvps for all to authenticated
  using(public.has_course_role(course_id,array['course_owner','course_admin','assistant_admin','scorekeeper']))
  with check(public.has_course_role(course_id,array['course_owner','course_admin','assistant_admin','scorekeeper']));
create policy billing_invoices_read on public.billing_invoices for select to authenticated
  using(public.has_course_role(course_id,array['course_owner','course_admin']));
create policy coupon_codes_read on public.coupon_codes for select to authenticated
  using(public.has_course_role(course_id,array['course_owner','course_admin']));
create policy tournament_entry_fees_read on public.tournament_entry_fees for select to authenticated
  using(public.has_course_role(course_id,array['course_owner','course_admin']));

-- app_metadata intentionally has no anon/authenticated grant or policy.
commit;
