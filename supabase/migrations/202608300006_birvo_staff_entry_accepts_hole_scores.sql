-- Staff score entry can record a card hole by hole.
--
-- WHY
--
-- Stableford, match play, skins and nassau are all scored hole by hole, and
-- Birvo could only collect hole scores from a player posting their own card. The
-- paper mode -- a scorekeeper typing in the cards after everyone has come in, and
-- the mode small courses actually use -- recorded a total gross and nothing else.
--
-- So for the courses Birvo is sold to, four of its six formats had no way to get
-- the data they need. The format layer reports that gap honestly rather than
-- pretending, but reporting a gap is not the same as closing it.
--
-- WHAT THIS DOES
--
-- A batch entry may now carry a `holes` array beside, or instead of, its
-- `grossScore`:
--
--   {"teamId": "...", "grossScore": 45}
--   {"teamId": "...", "holes": [{"holeNumber": 1, "grossScore": 5}, ...]}
--
-- When holes are given the gross is the sum of them, so the two cannot disagree
-- in the database. If a caller sends both and they do not match, that is raised
-- rather than quietly resolved: it means the scorekeeper mistyped either the
-- total or one of the holes, and only they know which.
--
-- Hole detail that no longer describes the card is removed. A card re-entered
-- with a different total, and no holes to go with it, cannot keep its old
-- hole-by-hole breakdown -- a format engine would then score a round that
-- contradicts its own gross.
--
-- putts, fairway_hit, gir and sand_saves stay null for staff entry. They are not
-- on a paper card, and a null reads as "not recorded" where a false would read as
-- "missed", which is a different claim.
begin;

-- Validation and the total, with nothing written. Separated from the insert so
-- that a card's gross is known before the score row is created rather than
-- corrected afterwards.
create or replace function public.hole_card_total(
  p_course_id uuid,
  p_holes jsonb
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  expected_holes integer;
  item jsonb;
  hole_no integer;
  gross integer;
  total integer := 0;
begin
  select count(*) into expected_holes from public.course_holes where course_id = p_course_id;
  if expected_holes not in (9, 18) then
    raise exception 'A complete course layout is required before scoring';
  end if;
  if jsonb_typeof(p_holes) <> 'array' or jsonb_array_length(p_holes) <> expected_holes then
    raise exception 'A hole-by-hole card must cover all % holes', expected_holes;
  end if;
  if (select count(distinct value->>'holeNumber') from jsonb_array_elements(p_holes)) <> expected_holes then
    raise exception 'Duplicate or missing hole numbers';
  end if;

  for item in select value from jsonb_array_elements(p_holes) loop
    begin
      hole_no := (item->>'holeNumber')::integer;
      gross := (item->>'grossScore')::integer;
    exception when others then raise exception 'Invalid hole score data'; end;
    if gross not between 1 and 20 then
      raise exception 'Hole scores must be between 1 and 20';
    end if;
    if not exists(
      select 1 from public.course_holes
      where course_id = p_course_id and hole_number = hole_no
    ) then raise exception 'Unknown course hole %', hole_no; end if;
    total := total + gross;
  end loop;

  return total;
end $fn$;

revoke execute on function public.hole_card_total(uuid,jsonb) from public, anon, authenticated;

create or replace function public.save_score_batch(
  p_course_id uuid,
  p_league_id uuid,
  p_week_number integer,
  p_scores jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $fn$
declare
  actor_id uuid := (select auth.uid());
  target_match public.matches;
  item jsonb;
  target_team public.teams;
  target_team_id uuid;
  gross integer;
  stated_gross integer;
  holes jsonb;
  existing_score public.scores;
  saved_score_id uuid;
  new_handicap numeric(4,1);
  saved_count integer := 0;
  hole_cards integer := 0;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin','assistant_admin','scorekeeper']) then raise exception 'Scoring access required'; end if;
  if not exists(select 1 from public.leagues where id=p_league_id and course_id=p_course_id and status='active') then raise exception 'Active league not found'; end if;
  if p_week_number not between 1 and 52 or jsonb_typeof(p_scores)<>'array' or jsonb_array_length(p_scores) not between 1 and 500 then raise exception 'Invalid score batch'; end if;
  if (select count(*) from jsonb_array_elements(p_scores))<>(select count(distinct value->>'teamId') from jsonb_array_elements(p_scores)) then raise exception 'Duplicate team in score batch'; end if;

  if not exists(
    select 1 from (
      select count(*) as hole_count,count(distinct stroke_index) as stroke_count
      from public.course_holes where course_id=p_course_id
    ) layout where layout.hole_count in (9,18) and layout.stroke_count=layout.hole_count
  ) then raise exception 'A complete course layout is required before scoring'; end if;
  if not exists(select 1 from public.course_tee_boxes where course_id=p_course_id) then raise exception 'A rated tee box is required before scoring'; end if;
  if (select count(*) from public.teams where course_id=p_course_id and league_id=p_league_id and status='active')<2 then
    raise exception 'At least two active teams are required before scoring';
  end if;

  select * into target_match from public.matches where league_id=p_league_id and week_number=p_week_number for update;
  if not found or target_match.status in ('cancelled','rained_out') then raise exception 'The round must be scheduled before scoring'; end if;
  if target_match.locked_at is not null or target_match.status='locked' then raise exception 'This round is locked'; end if;

  for item in select value from jsonb_array_elements(p_scores) loop
    begin
      target_team_id := (item->>'teamId')::uuid;
      stated_gross := nullif(item->>'grossScore','')::integer;
    exception when others then raise exception 'Invalid team ID or gross score'; end;

    holes := case when jsonb_typeof(item->'holes') = 'array' then item->'holes' else null end;
    if holes is null and stated_gross is null then
      raise exception 'Each entry needs either a gross score or a hole-by-hole card';
    end if;

    if holes is not null then
      gross := public.hole_card_total(p_course_id, holes);
      if stated_gross is not null and stated_gross <> gross then
        raise exception 'The total entered (%) does not match the holes entered (%)', stated_gross, gross;
      end if;
    else
      gross := stated_gross;
    end if;
    if gross not between 1 and 200 then raise exception 'Gross score must be between 1 and 200'; end if;

    select * into target_team from public.teams
      where id=target_team_id and course_id=p_course_id and league_id=p_league_id and status='active' for update;
    if not found then raise exception 'Invalid or inactive team'; end if;
    select * into existing_score from public.scores where match_id=target_match.id and team_id=target_team.id;

    insert into public.scores(
      course_id,match_id,team_id,gross_score,handicap_used,net_score,
      attestation_status,modified_by_user_id
    ) values(
      p_course_id,target_match.id,target_team.id,gross,target_team.current_handicap,
      gross-target_team.current_handicap,'approved',actor_id
    ) on conflict(match_id,team_id) do update set
      gross_score=excluded.gross_score,
      net_score=excluded.gross_score-public.scores.handicap_used,
      attestation_status='approved',
      modified_by_user_id=actor_id,
      updated_at=now()
    returning id into saved_score_id;

    if holes is not null then
      delete from public.score_hole_details where score_id = saved_score_id;
      insert into public.score_hole_details(course_id, score_id, hole_number, gross_score)
      select p_course_id, saved_score_id,
             (value->>'holeNumber')::smallint, (value->>'grossScore')::smallint
      from jsonb_array_elements(holes);
      hole_cards := hole_cards + 1;
    elsif existing_score.id is not null and existing_score.gross_score is distinct from gross then
      -- A new total with no holes behind it: the old breakdown no longer
      -- describes this card.
      delete from public.score_hole_details where score_id = saved_score_id;
    end if;

    if existing_score.id is not null and existing_score.gross_score is distinct from gross then
      insert into public.score_audit_logs(course_id,score_id,old_gross,new_gross,reason,modified_by_user_id)
      values(p_course_id,saved_score_id,existing_score.gross_score,gross,'Administrative score correction before round lock',actor_id);
    end if;

    new_handicap := public.calculate_team_handicap(target_team.id, p_week_number);
    update public.teams set current_handicap=coalesce(new_handicap,0),updated_at=now() where id=target_team.id;

    -- Must run after the handicap exists, and only rewrites a team's first card.
    perform public.apply_provisional_handicap(saved_score_id);
    saved_count := saved_count+1;
  end loop;

  return jsonb_build_object('matchId',target_match.id,'savedCount',saved_count,'holeCardCount',hole_cards);
end $fn$;

grant execute on function public.save_score_batch(uuid,uuid,integer,jsonb) to authenticated;

update public.app_metadata set schema_version=21,
  migration_name='202608300006_birvo_staff_entry_accepts_hole_scores',updated_at=now()
  where key='database';

commit;
