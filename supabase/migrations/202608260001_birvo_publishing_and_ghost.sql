-- Birvo clubhouse publishing and explicit ghost-score operations.
begin;

alter table public.scores
  add column if not exists is_ghost boolean not null default false;
create index if not exists scores_course_match_ghost_idx
  on public.scores(course_id,match_id,is_ghost);

create or replace function public.save_tv_display_settings(
  p_course_id uuid,
  p_league_id uuid,
  p_template_type text,
  p_auto_scroll_speed integer,
  p_show_announcements boolean,
  p_announcement_text text,
  p_celebration_effects boolean,
  p_sound_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  display_id uuid;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  if not exists(select 1 from public.leagues where id=p_league_id and course_id=p_course_id and status='active') then raise exception 'Active league not found'; end if;
  if p_template_type not in ('leaderboard_ticker') then raise exception 'Invalid TV template'; end if;
  if p_auto_scroll_speed not between 3 and 120 then raise exception 'Auto-scroll speed must be between 3 and 120 seconds'; end if;
  if length(coalesce(p_announcement_text,''))>500 then raise exception 'Announcement cannot exceed 500 characters'; end if;

  insert into public.tv_displays(
    course_id,league_id,name,template_type,auto_scroll_speed,show_announcements,
    announcement_text,celebration_effects,sound_enabled
  ) values(
    p_course_id,p_league_id,'Clubhouse Main Screen',p_template_type,p_auto_scroll_speed,
    coalesce(p_show_announcements,true),nullif(trim(coalesce(p_announcement_text,'')),''),
    coalesce(p_celebration_effects,true),coalesce(p_sound_enabled,false)
  ) on conflict(league_id,name) do update set
    template_type=excluded.template_type,
    auto_scroll_speed=excluded.auto_scroll_speed,
    show_announcements=excluded.show_announcements,
    announcement_text=excluded.announcement_text,
    celebration_effects=excluded.celebration_effects,
    sound_enabled=excluded.sound_enabled,
    updated_at=now()
  returning id into display_id;

  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'publishing.tv.updated','tv_display',display_id::text,
    jsonb_build_object('league_id',p_league_id,'template_type',p_template_type,
      'auto_scroll_speed',p_auto_scroll_speed,'show_announcements',coalesce(p_show_announcements,true)));
  return display_id;
end $$;

create or replace function public.add_tv_sponsor(
  p_course_id uuid,
  p_league_id uuid,
  p_name text,
  p_logo_url text,
  p_display_order integer
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  sponsor_id uuid;
  normalized_logo text := nullif(trim(coalesce(p_logo_url,'')),'');
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  if not exists(select 1 from public.leagues where id=p_league_id and course_id=p_course_id and status='active') then raise exception 'Active league not found'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 100 then raise exception 'Sponsor name must be between 2 and 100 characters'; end if;
  if normalized_logo is not null and (length(normalized_logo)>2048 or normalized_logo !~ '^(https://|/)') then raise exception 'Sponsor logo must use HTTPS or a site-relative path'; end if;
  if p_display_order not between 0 and 1000 then raise exception 'Invalid sponsor display order'; end if;

  insert into public.tv_sponsors(course_id,league_id,name,logo_url,display_order,active)
  values(p_course_id,p_league_id,trim(p_name),normalized_logo,p_display_order,true)
  returning id into sponsor_id;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'publishing.sponsor.added','tv_sponsor',sponsor_id::text,
    jsonb_build_object('league_id',p_league_id,'name',trim(p_name),'display_order',p_display_order));
  return sponsor_id;
end $$;

create or replace function public.delete_tv_sponsor(
  p_course_id uuid,
  p_league_id uuid,
  p_sponsor_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  sponsor_name text;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then raise exception 'Course manager access required'; end if;
  delete from public.tv_sponsors
    where id=p_sponsor_id and course_id=p_course_id and league_id=p_league_id
    returning name into sponsor_name;
  if sponsor_name is null then raise exception 'Sponsor not found'; end if;
  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'publishing.sponsor.deleted','tv_sponsor',p_sponsor_id::text,
    jsonb_build_object('league_id',p_league_id,'name',sponsor_name));
end $$;

create or replace function public.apply_ghost_score(
  p_course_id uuid,
  p_league_id uuid,
  p_team_id uuid,
  p_week_number integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor_id uuid := (select auth.uid());
  league_week integer;
  team_handicap numeric(4,1);
  team_name text;
  match_record public.matches;
  existing_score public.scores;
  score_id uuid;
  ghost_gross smallint;
  ghost_net numeric(5,1);
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin','assistant_admin','scorekeeper']) then raise exception 'Scoring access required'; end if;
  select current_week into league_week from public.leagues
    where id=p_league_id and course_id=p_course_id and status='active' for update;
  if league_week is null then raise exception 'Active league not found'; end if;
  if p_week_number<>league_week then raise exception 'Ghost scores can be applied only to the current week'; end if;
  select current_handicap,name into team_handicap,team_name from public.teams
    where id=p_team_id and course_id=p_course_id and league_id=p_league_id and status='active';
  if team_name is null then raise exception 'Active team not found'; end if;

  select * into match_record from public.matches
    where course_id=p_course_id and league_id=p_league_id and week_number=p_week_number for update;
  if not found then
    insert into public.matches(course_id,league_id,week_number,status)
    values(p_course_id,p_league_id,p_week_number,'open') returning * into match_record;
  end if;
  if match_record.locked_at is not null or match_record.status in ('locked','rained_out','cancelled') then raise exception 'This round does not accept ghost scores'; end if;

  select * into existing_score from public.scores
    where course_id=p_course_id and match_id=match_record.id and team_id=p_team_id for update;
  if found and not existing_score.is_ghost then raise exception 'A submitted scorecard cannot be replaced with a ghost score'; end if;

  select coalesce(round(avg(gross_score)),36)::smallint into ghost_gross
    from public.scores where course_id=p_course_id and match_id=match_record.id
      and reconciliation_status='ok' and not is_ghost and gross_score is not null;
  ghost_net := ghost_gross-team_handicap;
  insert into public.scores(
    course_id,match_id,team_id,gross_score,handicap_used,net_score,
    attestation_status,reconciliation_status,is_ghost,modified_by_user_id
  ) values(
    p_course_id,match_record.id,p_team_id,ghost_gross,team_handicap,ghost_net,
    'approved','ok',true,actor_id
  ) on conflict(match_id,team_id) do update set
    gross_score=excluded.gross_score,handicap_used=excluded.handicap_used,net_score=excluded.net_score,
    attestation_status='approved',reconciliation_status='ok',is_ghost=true,
    modified_by_user_id=actor_id,updated_at=now()
    where public.scores.is_ghost=true
  returning id into score_id;
  if score_id is null then raise exception 'A submitted scorecard cannot be replaced with a ghost score'; end if;

  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'score.ghost.applied','score',score_id::text,
    jsonb_build_object('league_id',p_league_id,'team_id',p_team_id,'team_name',team_name,
      'week_number',p_week_number,'gross_score',ghost_gross,'net_score',ghost_net));
  return jsonb_build_object('scoreId',score_id,'ghostGross',ghost_gross,'netScore',ghost_net);
end $$;

revoke execute on function public.save_tv_display_settings(uuid,uuid,text,integer,boolean,text,boolean,boolean) from public,anon;
revoke execute on function public.add_tv_sponsor(uuid,uuid,text,text,integer) from public,anon;
revoke execute on function public.delete_tv_sponsor(uuid,uuid,uuid) from public,anon;
revoke execute on function public.apply_ghost_score(uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.save_tv_display_settings(uuid,uuid,text,integer,boolean,text,boolean,boolean) to authenticated;
grant execute on function public.add_tv_sponsor(uuid,uuid,text,text,integer) to authenticated;
grant execute on function public.delete_tv_sponsor(uuid,uuid,uuid) to authenticated;
grant execute on function public.apply_ghost_score(uuid,uuid,uuid,integer) to authenticated;

update public.app_metadata set schema_version=4,
  migration_name='202608260001_birvo_publishing_and_ghost',updated_at=now()
  where key='database';

commit;
