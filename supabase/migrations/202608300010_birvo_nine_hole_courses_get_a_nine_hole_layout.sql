-- The setup button can build a nine-hole course.
--
-- WHY
--
-- initialize_course_layout always created eighteen holes and four tee sets rated
-- for eighteen. There was no way to say "we are a nine-hole course", and nothing
-- warned anybody. Birvo is sold to small-town courses and the pilot course itself
-- plays nine, so this is the common case, not the edge one.
--
-- The consequence was quiet and total. Measured against a fresh workspace that
-- pressed the button and then played a normal night:
--
--   the layout said 18 holes, par 72, for a course that plays 9 holes, par 36
--   a 45 and a 58 both produced a handicap of 0.0
--   net 45 against net 58: the thirteen-shot gross gap survived in full
--
-- calculate_team_handicap works from (gross - par), so a nine-hole score against
-- an eighteen-hole par is a large negative number, and the clamp at zero turns
-- every golfer into a scratch player. The season is then scratch play from the
-- first week to the last, and the scoreboard gives no hint that anything is
-- wrong -- the numbers all look like numbers.
--
-- WHAT THIS DOES
--
-- The function takes a hole count, still defaulting to eighteen so every existing
-- caller behaves as before. Nine builds the front nine at par 36 with the stroke
-- indexes renumbered 1 to 9, keeping the holes in the same order of difficulty
-- they had in the eighteen-hole set, and rates the tees for nine holes -- roughly
-- half the course rating, the same slope, since a nine-hole slope is stated on
-- the same scale.
--
-- Those nine-hole ratings only became storable when 202608300007 lowered the
-- course_rating floor from 40 to 25.
--
-- A course that already has holes is left alone unless the count matches: silently
-- turning eighteen holes into nine would strand the scores already recorded
-- against them.
begin;

drop function if exists public.initialize_course_layout(uuid);

create or replace function public.initialize_course_layout(
  p_course_id uuid,
  p_holes integer default 18
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  actor_id uuid := (select auth.uid());
  inserted_holes integer := 0;
  inserted_tees integer := 0;
  existing_holes integer;
begin
  if not public.has_course_role(p_course_id,array['course_owner','course_admin']) then
    raise exception 'Course manager access required';
  end if;
  if p_holes not in (9, 18) then
    raise exception 'A course layout has either 9 or 18 holes';
  end if;

  select count(*) into existing_holes from public.course_holes where course_id = p_course_id;
  if existing_holes > 0 and existing_holes <> p_holes then
    raise exception 'This course already has a % hole layout. Edit the holes directly rather than rebuilding, so the scores recorded against them are not stranded.', existing_holes;
  end if;

  if p_holes = 9 then
    insert into public.course_holes(course_id,layout_name,hole_number,par,stroke_index,pin_position,is_under_maintenance)
    select p_course_id,'Main Course',hole_number,par,stroke_index,'center',false
    from (values
      (1,4,4),(2,4,2),(3,3,8),(4,5,1),(5,4,6),(6,4,3),(7,3,9),(8,5,5),(9,4,7)
    ) as defaults(hole_number,par,stroke_index)
    on conflict(course_id,layout_name,hole_number) do nothing;
    get diagnostics inserted_holes = row_count;

    insert into public.course_tee_boxes(
      course_id,layout_name,name,color_hex,gender,course_rating,slope_rating,total_yards
    ) values
      (p_course_id,'Main Course','Black (Championship)','#1e293b','men',37.1,135,3425),
      (p_course_id,'Main Course','White (Men)','#f8fafc','men',36.0,128,3200),
      (p_course_id,'Main Course','Gold (Senior)','#eab308','all',35.2,122,2975),
      (p_course_id,'Main Course','Red (Women)','#ef4444','women',34.4,116,2600)
    on conflict(course_id,layout_name,name) do nothing;
    get diagnostics inserted_tees = row_count;
  else
    insert into public.course_holes(course_id,layout_name,hole_number,par,stroke_index,pin_position,is_under_maintenance)
    select p_course_id,'Main Course',hole_number,par,stroke_index,'center',false
    from (values
      (1,4,7),(2,4,3),(3,3,15),(4,5,1),(5,4,11),(6,4,5),(7,3,17),(8,5,9),(9,4,13),
      (10,4,8),(11,4,4),(12,3,16),(13,5,2),(14,4,12),(15,4,6),(16,3,18),(17,5,10),(18,4,14)
    ) as defaults(hole_number,par,stroke_index)
    on conflict(course_id,layout_name,hole_number) do nothing;
    get diagnostics inserted_holes = row_count;

    insert into public.course_tee_boxes(
      course_id,layout_name,name,color_hex,gender,course_rating,slope_rating,total_yards
    ) values
      (p_course_id,'Main Course','Black (Championship)','#1e293b','men',74.2,135,6850),
      (p_course_id,'Main Course','White (Men)','#f8fafc','men',72.0,128,6400),
      (p_course_id,'Main Course','Gold (Senior)','#eab308','all',70.4,122,5950),
      (p_course_id,'Main Course','Red (Women)','#ef4444','women',68.8,116,5200)
    on conflict(course_id,layout_name,name) do nothing;
    get diagnostics inserted_tees = row_count;
  end if;

  insert into public.course_setup_steps(course_id,step_key,status,completed_by_user_id,completed_at)
  values
    (p_course_id,'course_layout','complete',actor_id,now()),
    (p_course_id,'tee_boxes','complete',actor_id,now())
  on conflict(course_id,step_key) do update set
    status='complete',completed_by_user_id=actor_id,completed_at=now(),updated_at=now();

  insert into public.audit_events(course_id,actor_user_id,action,target_type,target_id,metadata)
  values(p_course_id,actor_id,'course.layout.initialized','course',p_course_id::text,
    jsonb_build_object('inserted_holes',inserted_holes,'inserted_tees',inserted_tees,
      'hole_count',p_holes,'distance_unit','yards'));

  return jsonb_build_object('insertedHoles',inserted_holes,'insertedTeeBoxes',inserted_tees,'holeCount',p_holes);
end $fn$;

grant execute on function public.initialize_course_layout(uuid,integer) to authenticated;

update public.app_metadata set schema_version=25,
  migration_name='202608300010_birvo_nine_hole_courses_get_a_nine_hole_layout',updated_at=now()
  where key='database';

commit;
