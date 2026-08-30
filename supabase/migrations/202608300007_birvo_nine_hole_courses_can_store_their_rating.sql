-- A nine-hole course can store its own course rating.
--
-- course_tee_boxes required a rating between 40 and 90, which is the range of an
-- eighteen-hole rating. A nine-hole rating is roughly half that -- Hidden Valley,
-- the pilot course, plays to a par of 36 and would be rated somewhere near 35 --
-- and the check rejected it outright.
--
-- The consequence was quiet rather than loud. A nine-hole course could not enter
-- its real rating, so it either left the eighteen-hole default in place or typed
-- something that would pass. Either way calculate_team_handicap saw a rating more
-- than ten strokes away from the course's par, hit its sanity guard, and fell
-- back to par and a slope of 113. WHS was therefore never actually using a real
-- rating on a nine-hole course, and nothing said so.
--
-- Nine-hole ratings run from about 27 for a very short par 31 up to about 40.
-- Lowering the floor to 25 admits them and still rejects a total typed into the
-- rating field by mistake. The upper bound is unchanged.
begin;

alter table public.course_tee_boxes
  drop constraint course_tee_boxes_course_rating_check;

alter table public.course_tee_boxes
  add constraint course_tee_boxes_course_rating_check
  check (course_rating >= 25 and course_rating <= 90);

update public.app_metadata set schema_version=22,
  migration_name='202608300007_birvo_nine_hole_courses_can_store_their_rating',updated_at=now()
  where key='database';

commit;
