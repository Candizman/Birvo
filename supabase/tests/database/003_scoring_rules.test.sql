-- Business rules that moved from JavaScript into PostgreSQL.
--
-- When the SQLite runtime was removed on 2026-08-29, the rules that guard score
-- entry, round locking, ghost scores and workspace creation stopped living in
-- lib/services and became the responsibility of these functions. The JavaScript
-- tests that covered them were deleted with the code they exercised; this suite
-- is where that coverage moved to.
begin;
set local search_path = public, extensions;
select plan(71);

-- ─── Fixture ────────────────────────────────────────────────────────────────
insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000001','authenticated','authenticated',
   'owner@example.com','',now(),'{}','{}',now(),now());

insert into public.courses(id,name,city,state) values
  ('a0000000-0000-4000-8000-000000000001','Hidden Valley','Kendallville','IN');
insert into public.course_memberships(course_id,user_id,email,role,status) values
  ('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner@example.com','course_owner','active');
insert into public.leagues(id,course_id,name,status,game_format,current_week,season_length_weeks) values
  ('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','Tuesday Night','active','stroke_play',1,10);
insert into public.teams(id,course_id,league_id,name,status,current_handicap) values
  ('a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Eagles','active',0),
  ('a2000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Birdies','active',0);

-- A second course with a nine-hole layout, for the par assertions at the end.
insert into public.courses(id,name,city,state) values
  ('c9000000-0000-4000-8000-000000000009','Nine Hole Club','Kendallville','IN');
insert into public.course_holes(course_id,layout_name,hole_number,par,stroke_index)
select 'c9000000-0000-4000-8000-000000000009','Main Course',n,(array[4,4,3,5,4,4,3,5,4])[n],n
from generate_series(1,9) n;

-- A third course carrying the same golfer through three leagues, one per handicap
-- method, so the methods can be compared on identical rounds: five honest cards
-- (88,90,89,91,88) then five deliberately bad ones (104,106,105,107,104).
insert into public.courses(id,name,city,state) values
  ('d0000000-0000-4000-8000-00000000d001','Method Test Club','Auburn','IN');
insert into public.course_holes(course_id,layout_name,hole_number,par,stroke_index)
select 'd0000000-0000-4000-8000-00000000d001','Main Course',n,
  (array[4,4,3,5,4,4,3,5,4,4,4,3,5,4,4,3,5,4])[n], n from generate_series(1,18) n;
insert into public.course_tee_boxes(course_id,name,course_rating,slope_rating,total_yards)
values ('d0000000-0000-4000-8000-00000000d001','White',72.0,128,6400);
insert into public.leagues(id,course_id,name,status,game_format,current_week,season_length_weeks,handicap_method)
values
  ('d1000000-0000-4000-8000-00000000d001','d0000000-0000-4000-8000-00000000d001','Avg League','active','stroke_play',11,12,'league_average'),
  ('d1000000-0000-4000-8000-00000000d002','d0000000-0000-4000-8000-00000000d001','BestOf League','active','stroke_play',11,12,'best_of'),
  ('d1000000-0000-4000-8000-00000000d003','d0000000-0000-4000-8000-00000000d001','WHS League','active','stroke_play',11,12,'whs');
insert into public.teams(id,course_id,league_id,name,status,current_handicap)
select ('d2000000-0000-4000-8000-00000000d00'||i)::uuid,
       'd0000000-0000-4000-8000-00000000d001',
       ('d1000000-0000-4000-8000-00000000d00'||i)::uuid,
       'Sandbagger','active',0
from generate_series(1,3) i;
insert into public.matches(id,course_id,league_id,week_number,status)
select ('d2500000-0000-4000-8000-'||lpad((i*100+w)::text,12,'0'))::uuid,
       'd0000000-0000-4000-8000-00000000d001',
       ('d1000000-0000-4000-8000-00000000d00'||i)::uuid, w, 'locked'
from generate_series(1,3) i, generate_series(1,10) w;
insert into public.scores(course_id,match_id,team_id,gross_score,handicap_used,net_score,attestation_status)
select 'd0000000-0000-4000-8000-00000000d001',
       ('d2500000-0000-4000-8000-'||lpad((i*100+w)::text,12,'0'))::uuid,
       ('d2000000-0000-4000-8000-00000000d00'||i)::uuid,
       (array[88,90,89,91,88,104,106,105,107,104])[w], 0,
       (array[88,90,89,91,88,104,106,105,107,104])[w], 'approved'
from generate_series(1,3) i, generate_series(1,10) w;

-- A fourth course, owned by the same user, kept apart from the first so that the
-- hole-by-hole assertions do not disturb its score and audit-log counters.
insert into public.courses(id,name,city,state) values
  ('b0000000-0000-4000-8000-0000000000b1','Hole Card Club','Auburn','IN');
insert into public.course_memberships(course_id,user_id,email,role,status) values
  ('b0000000-0000-4000-8000-0000000000b1','10000000-0000-4000-8000-000000000001','owner@example.com','course_owner','active');
insert into public.course_holes(course_id,layout_name,hole_number,par,stroke_index)
select 'b0000000-0000-4000-8000-0000000000b1','Main Course',n,
  (array[4,4,3,5,4,4,3,5,4,4,4,3,5,4,4,3,5,4])[n], n from generate_series(1,18) n;
insert into public.course_tee_boxes(course_id,name,course_rating,slope_rating,total_yards)
values ('b0000000-0000-4000-8000-0000000000b1','White',72.0,113,6400);
insert into public.leagues(id,course_id,name,status,game_format,current_week,season_length_weeks,handicap_method)
values ('b1000000-0000-4000-8000-0000000000b1','b0000000-0000-4000-8000-0000000000b1',
        'Hole Card League','active','stableford',1,10,'league_average');
insert into public.teams(id,course_id,league_id,name,status,current_handicap) values
  ('b2000000-0000-4000-8000-0000000000b1','b0000000-0000-4000-8000-0000000000b1','b1000000-0000-4000-8000-0000000000b1','Alpha','active',0),
  ('b2000000-0000-4000-8000-0000000000b2','b0000000-0000-4000-8000-0000000000b1','b1000000-0000-4000-8000-0000000000b1','Beta','active',0);
insert into public.matches(id,course_id,league_id,week_number,status) values
  ('b2500000-0000-4000-8000-0000000000b1','b0000000-0000-4000-8000-0000000000b1',
   'b1000000-0000-4000-8000-0000000000b1',1,'open'),
  ('b2500000-0000-4000-8000-0000000000b2','b0000000-0000-4000-8000-0000000000b1',
   'b1000000-0000-4000-8000-0000000000b1',2,'open');
-- Two substitutes at opposite ends, plus one belonging to another league.
insert into public.substitutes(id,course_id,league_id,name,handicap,status) values
  ('b3000000-0000-4000-8000-0000000000b1','b0000000-0000-4000-8000-0000000000b1',
   'b1000000-0000-4000-8000-0000000000b1','Ringer',2.0,'available'),
  ('b3000000-0000-4000-8000-0000000000b2','b0000000-0000-4000-8000-0000000000b1',
   'b1000000-0000-4000-8000-0000000000b1','Weak',20.0,'available'),
  ('b3000000-0000-4000-8000-0000000000b9','d0000000-0000-4000-8000-00000000d001',
   'd1000000-0000-4000-8000-00000000d001','Outsider',5.0,'available');

-- Two bare courses for the layout builder: one to build nine holes on, one to
-- reject an impossible hole count against.
insert into public.courses(id,name,city,state) values
  ('f0000000-0000-4000-8000-0000000000f1','Nine Hole Setup','Auburn','IN'),
  ('f0000000-0000-4000-8000-0000000000f2','Bad Hole Count','Auburn','IN');
insert into public.course_memberships(course_id,user_id,email,role,status) values
  ('f0000000-0000-4000-8000-0000000000f1','10000000-0000-4000-8000-000000000001','owner@example.com','course_owner','active'),
  ('f0000000-0000-4000-8000-0000000000f2','10000000-0000-4000-8000-000000000001','owner@example.com','course_owner','active');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","email":"owner@example.com","role":"authenticated"}';

-- ─── Scoring readiness gates ────────────────────────────────────────────────
select throws_ok(
  $$select public.save_score_batch(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',1,
    '[{"teamId":"a2000000-0000-4000-8000-000000000001","grossScore":80}]'::jsonb)$$,
  'P0001','A complete course layout is required before scoring',
  'scoring is refused before the hole layout exists'
);

select lives_ok(
  $$select public.initialize_course_layout('a0000000-0000-4000-8000-000000000001')$$,
  'course layout initialization seeds 18 holes and four tee sets'
);
select is((select count(*)::integer from public.course_holes where course_id='a0000000-0000-4000-8000-000000000001'),18,
  'eighteen holes are created');
select is((select count(distinct stroke_index)::integer from public.course_holes where course_id='a0000000-0000-4000-8000-000000000001'),18,
  'every stroke index from 1 to 18 is used exactly once');
select is((select count(*)::integer from public.course_tee_boxes where course_id='a0000000-0000-4000-8000-000000000001'),4,
  'four rated tee sets are created');

select throws_ok(
  $$select public.save_score_batch(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',1,
    '[{"teamId":"a2000000-0000-4000-8000-000000000001","grossScore":80}]'::jsonb)$$,
  'P0001','The round must be scheduled before scoring',
  'scoring is refused before the round is scheduled'
);

insert into public.matches(id,course_id,league_id,week_number,status) values
  ('a2500000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
   'a1000000-0000-4000-8000-000000000001',1,'open');

-- ─── Input validation ───────────────────────────────────────────────────────
select throws_ok(
  $$select public.save_score_batch(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',1,
    '[{"teamId":"a2000000-0000-4000-8000-000000000001","grossScore":0}]'::jsonb)$$,
  'P0001','Gross score must be between 1 and 200',
  'a gross score below 1 is rejected'
);
select throws_ok(
  $$select public.save_score_batch(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',1,
    '[{"teamId":"a2000000-0000-4000-8000-000000000001","grossScore":201}]'::jsonb)$$,
  'P0001','Gross score must be between 1 and 200',
  'a gross score above 200 is rejected'
);
select throws_ok(
  $$select public.save_score_batch(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',1,
    '[{"teamId":"a2000000-0000-4000-8000-000000000001","grossScore":80},
      {"teamId":"a2000000-0000-4000-8000-000000000001","grossScore":85}]'::jsonb)$$,
  'P0001','Duplicate team in score batch',
  'the same team cannot appear twice in one batch'
);

-- One bad entry must roll the whole batch back, not just its own row.
select throws_ok(
  $$select public.save_score_batch(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',1,
    '[{"teamId":"a2000000-0000-4000-8000-000000000001","grossScore":80},
      {"teamId":"a2000000-0000-4000-8000-000000000002","grossScore":999}]'::jsonb)$$,
  'P0001','Gross score must be between 1 and 200',
  'an invalid entry aborts the batch'
);
select is((select count(*)::integer from public.scores where match_id='a2500000-0000-4000-8000-000000000001'),0,
  'the valid entry from the aborted batch was not persisted');

-- ─── A clean batch, and the handicap it derives ─────────────────────────────
select lives_ok(
  $$select public.save_score_batch(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',1,
    '[{"teamId":"a2000000-0000-4000-8000-000000000001","grossScore":80},
      {"teamId":"a2000000-0000-4000-8000-000000000002","grossScore":90}]'::jsonb)$$,
  'a valid batch is accepted'
);
select is((select count(*)::integer from public.scores where match_id='a2500000-0000-4000-8000-000000000001'),2,
  'both scorecards are stored');

select is((select current_handicap from public.teams where id='a2000000-0000-4000-8000-000000000001'),6.4::numeric(4,1),
  'the handicap is (average gross - the course par) * 0.8, here (80 - 72) * 0.8');
select is((select current_handicap from public.teams where id='a2000000-0000-4000-8000-000000000002'),14.4::numeric(4,1),
  'each team gets its own handicap, here (90 - 72) * 0.8');

-- ─── Resubmission preserves the handicap snapshot ───────────────────────────
select lives_ok(
  $$select public.save_score_batch(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',1,
    '[{"teamId":"a2000000-0000-4000-8000-000000000001","grossScore":84}]'::jsonb)$$,
  'a corrected score can be resubmitted before the round locks'
);
select is((select handicap_used from public.scores
    where match_id='a2500000-0000-4000-8000-000000000001' and team_id='a2000000-0000-4000-8000-000000000001'),
  0::numeric(4,1),
  'the handicap snapshot taken at first entry is preserved on update');
select is((select net_score from public.scores
    where match_id='a2500000-0000-4000-8000-000000000001' and team_id='a2000000-0000-4000-8000-000000000001'),
  84::numeric(5,1),
  'net score is recomputed against the preserved snapshot, not the new handicap');
select is((select count(*)::integer from public.score_audit_logs
    where course_id='a0000000-0000-4000-8000-000000000001'), 1,
  'the correction is written to the score audit log');

-- ─── Staff entry, hole by hole ──────────────────────────────────────────────
-- Stableford, match play and the side games cannot be scored from a total, and
-- the paper mode is the mode these courses use. Without this the formats had no
-- way to reach their data.
select lives_ok(
  $$select public.save_score_batch(
    'b0000000-0000-4000-8000-0000000000b1','b1000000-0000-4000-8000-0000000000b1',1,
    (select jsonb_build_array(jsonb_build_object(
       'teamId','b2000000-0000-4000-8000-0000000000b1',
       'holes',(select jsonb_agg(jsonb_build_object('holeNumber',n,'grossScore',5))
                from generate_series(1,18) n))))
  )$$,
  'a card can be entered hole by hole'
);
select is((select gross_score from public.scores
    where match_id='b2500000-0000-4000-8000-0000000000b1'
      and team_id='b2000000-0000-4000-8000-0000000000b1'),
  90::smallint,
  'the gross is the sum of the holes, so the two cannot disagree in the database');
select is((select count(*)::integer from public.score_hole_details d
    join public.scores s on s.id = d.score_id
    where s.team_id='b2000000-0000-4000-8000-0000000000b1'), 18,
  'every hole is stored');

select throws_ok(
  $$select public.save_score_batch(
    'b0000000-0000-4000-8000-0000000000b1','b1000000-0000-4000-8000-0000000000b1',1,
    (select jsonb_build_array(jsonb_build_object(
       'teamId','b2000000-0000-4000-8000-0000000000b1','grossScore',89,
       'holes',(select jsonb_agg(jsonb_build_object('holeNumber',n,'grossScore',5))
                from generate_series(1,18) n))))
  )$$,
  'P0001','The total entered (89) does not match the holes entered (90)',
  'a total that contradicts the holes is refused rather than quietly resolved'
);

select throws_ok(
  $$select public.save_score_batch(
    'b0000000-0000-4000-8000-0000000000b1','b1000000-0000-4000-8000-0000000000b1',1,
    (select jsonb_build_array(jsonb_build_object(
       'teamId','b2000000-0000-4000-8000-0000000000b1',
       'holes',(select jsonb_agg(jsonb_build_object('holeNumber',n,'grossScore',5))
                from generate_series(1,10) n))))
  )$$,
  'P0001','A hole-by-hole card must cover all 18 holes',
  'a part-filled card is refused'
);

-- Hole detail that no longer describes the card is dropped: a format engine
-- reading it would otherwise score a round that contradicts its own gross.
select lives_ok(
  $$select public.save_score_batch(
    'b0000000-0000-4000-8000-0000000000b1','b1000000-0000-4000-8000-0000000000b1',1,
    '[{"teamId":"b2000000-0000-4000-8000-0000000000b1","grossScore":84}]'::jsonb)$$,
  'the same card can be re-entered as a total'
);
select is((select count(*)::integer from public.score_hole_details d
    join public.scores s on s.id = d.score_id
    where s.team_id='b2000000-0000-4000-8000-0000000000b1'), 0,
  'the old hole-by-hole breakdown does not survive a total that contradicts it');

-- ─── Substitutes ────────────────────────────────────────────────────────────
-- Alpha's own card above was an 84 off a par of 72, so the team plays off
-- (84 - 72) x 0.8 = 9.6. A substitute plays off the lower of their handicap and
-- the team's, which is the ordinary anti-ringer rule.
select is((select current_handicap from public.teams where id='b2000000-0000-4000-8000-0000000000b1'),
  9.6::numeric(4,1), 'the team has a handicap of its own to cap a substitute against');

select lives_ok(
  $$select public.save_score_batch(
    'b0000000-0000-4000-8000-0000000000b1','b1000000-0000-4000-8000-0000000000b1',2,
    '[{"teamId":"b2000000-0000-4000-8000-0000000000b1","grossScore":78,
       "substituteId":"b3000000-0000-4000-8000-0000000000b1"}]'::jsonb)$$,
  'a substitute can post a score'
);
select is((select handicap_used from public.scores
    where match_id='b2500000-0000-4000-8000-0000000000b2'),
  2.0::numeric(4,1),
  'a two-handicap substitute for a 9.6 team plays off 2.0, so a ringer buys nothing');

select lives_ok(
  $$select public.save_score_batch(
    'b0000000-0000-4000-8000-0000000000b1','b1000000-0000-4000-8000-0000000000b1',2,
    '[{"teamId":"b2000000-0000-4000-8000-0000000000b1","grossScore":95,
       "substituteId":"b3000000-0000-4000-8000-0000000000b2"}]'::jsonb)$$,
  'the card can be re-entered against a different substitute'
);
select is((select handicap_used from public.scores
    where match_id='b2500000-0000-4000-8000-0000000000b2'),
  9.6::numeric(4,1),
  'a twenty-handicap substitute is capped at the team''s 9.6, so a weak stand-in cannot inflate it');

-- The whole point: somebody else played, so the round scores for the league but
-- says nothing about this team. A 78 and a 95 by substitutes both leave the
-- team's own handicap where its own card put it.
select is((select current_handicap from public.teams where id='b2000000-0000-4000-8000-0000000000b1'),
  9.6::numeric(4,1),
  'a substitute round is left out of the team''s handicap');

select throws_ok(
  $$select public.save_score_batch(
    'b0000000-0000-4000-8000-0000000000b1','b1000000-0000-4000-8000-0000000000b1',2,
    '[{"teamId":"b2000000-0000-4000-8000-0000000000b1","grossScore":80,
       "substituteId":"b3000000-0000-4000-8000-0000000000b9"}]'::jsonb)$$,
  'P0001','Unknown substitute for this league',
  'a substitute from another league cannot be borrowed, handicap and all'
);

-- ─── A nine-hole course gets a nine-hole layout ─────────────────────────────
-- The setup button used to build eighteen holes whatever the course was. A
-- nine-hole course was then scored against par 72, every handicap clamped to
-- zero, and the season played to scratch without a word of warning.
select lives_ok(
  $$select public.initialize_course_layout('f0000000-0000-4000-8000-0000000000f1', 9)$$,
  'a nine-hole layout can be created'
);
select is((select count(*)::integer from public.course_holes
    where course_id='f0000000-0000-4000-8000-0000000000f1'), 9,
  'nine holes, not eighteen');
select is((select sum(par)::integer from public.course_holes
    where course_id='f0000000-0000-4000-8000-0000000000f1'), 36,
  'par 36, which is what the handicap is worked out against');
select ok(
  (select count(distinct stroke_index)=9 and min(stroke_index)=1 and max(stroke_index)=9
   from public.course_holes where course_id='f0000000-0000-4000-8000-0000000000f1'),
  'every stroke index from 1 to 9 is used exactly once'
);
select ok(
  (select max(course_rating) < 45 from public.course_tee_boxes
   where course_id='f0000000-0000-4000-8000-0000000000f1'),
  'the tees are rated for nine holes, not eighteen'
);
select throws_ok(
  $$select public.initialize_course_layout('f0000000-0000-4000-8000-0000000000f1', 18)$$,
  'P0001',
  'This course already has a 9 hole layout. Edit the holes directly rather than rebuilding, so the scores recorded against them are not stranded.',
  'rebuilding at the wrong size is refused rather than stranding recorded scores'
);
select throws_ok(
  $$select public.initialize_course_layout('f0000000-0000-4000-8000-0000000000f2', 12)$$,
  'P0001','A course layout has either 9 or 18 holes',
  'a layout is nine or eighteen holes and nothing else'
);

-- ─── Closing and removing a workspace ───────────────────────────────────────
-- protect_last_course_owner used to refuse the cascade from deleting a course,
-- so no tenant could ever be removed. It now steps aside for a closed course and
-- nowhere else.
select throws_ok(
  $$select public.purge_course('b0000000-0000-4000-8000-0000000000b1')$$,
  'P0001','The workspace must be closed before it can be permanently removed',
  'a workspace cannot be destroyed in a single step'
);
select lives_ok(
  $$select public.close_course('b0000000-0000-4000-8000-0000000000b1')$$,
  'the owner can close the workspace'
);
select lives_ok(
  $$select public.purge_course('b0000000-0000-4000-8000-0000000000b1')$$,
  'a closed workspace can be removed for good'
);
select is((select count(*)::integer from public.courses
    where id='b0000000-0000-4000-8000-0000000000b1'), 0,
  'the course is gone');
select is((select count(*)::integer from public.scores
    where course_id='b0000000-0000-4000-8000-0000000000b1'), 0,
  'and the cascade took its scorecards with it');

-- ─── Ghost scores ───────────────────────────────────────────────────────────
select throws_ok(
  $$select public.apply_ghost_score(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',1)$$,
  'P0001','A submitted scorecard cannot be replaced with a ghost score',
  'a ghost score never overwrites a real card'
);

-- ─── Round locking ──────────────────────────────────────────────────────────
-- Staff entry is its own attestation. A course running the paper workflow must be
-- able to close a round without every player signing in, which is the whole point
-- of the traditional mode.
select is(
  (select count(*)::integer from public.scores
   where match_id='a2500000-0000-4000-8000-000000000001'
     and attestation_status='approved'),
  2,
  'a card entered by course staff is recorded as approved, not left pending'
);

-- A player-submitted card still needs its opponent's attestation, and still
-- blocks the lock until it has it.
update public.scores set attestation_status='pending'
  where match_id='a2500000-0000-4000-8000-000000000001'
    and team_id='a2000000-0000-4000-8000-000000000002';

select throws_ok(
  $$select public.lock_round_and_advance(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',1)$$,
  'P0001','Scorecards still need attestation',
  'an unattested player card still blocks the lock'
);

update public.scores set attestation_status='approved'
  where match_id='a2500000-0000-4000-8000-000000000001';

select is(
  (select public.lock_round_and_advance(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',1)),
  2,
  'locking the round advances the league to week 2'
);
select is((select current_week from public.leagues where id='a1000000-0000-4000-8000-000000000001'),2,
  'the league week actually moved');

select throws_ok(
  $$update public.scores set gross_score=70
    where match_id='a2500000-0000-4000-8000-000000000001'
      and team_id='a2000000-0000-4000-8000-000000000001'$$,
  'P0001','This round is locked. Create a correction request instead.',
  'a locked round rejects a direct score edit'
);

select throws_ok(
  $$select public.lock_round_and_advance(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',1)$$,
  'P0001','The selected round is no longer current',
  'a round cannot be locked twice'
);

-- ─── League format is frozen once scoring starts ────────────────────────────
select throws_ok(
  $$select public.update_league_format(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','stableford')$$,
  'P0001','The scoring format cannot change after score entry begins',
  'the scoring format is frozen once any score exists'
);

-- ─── Workspace creation is one transaction ──────────────────────────────────
select throws_ok(
  $$select public.create_tenant_workspace(
    'Second Course','1 Fairway','Auburn','IN','46706','America/New_York',
    'Monday League','stroke_play',10)$$,
  'P0001','This account already belongs to a course workspace',
  'one account cannot provision a second workspace'
);


-- ─── Handicaps follow the course's real par, not a constant ─────────────────
-- course_par and calculate_team_handicap are internal to the SECURITY DEFINER
-- scoring functions and are revoked from every client role, so these run as the
-- owner rather than as the signed-in course owner.
reset role;

-- The guard is relaxed for a purge and for nothing else: a course still open
-- cannot be left without an owner.
select throws_ok(
  $$delete from public.course_memberships
    where course_id='a0000000-0000-4000-8000-000000000001'$$,
  'P0001','A course must always have an active owner',
  'an open course still cannot lose its last owner'
);

select is(public.course_par('a0000000-0000-4000-8000-000000000001'), 72,
  'the seeded eighteen-hole layout has a par of 72');
select is(public.course_par('c9000000-0000-4000-8000-000000000009'), 36,
  'a nine-hole layout has a par of 36');
select is(public.course_par('00000000-0000-4000-8000-00000000ffff'), 36,
  'a course with no layout falls back to 36 rather than null');

-- ─── Handicap method ────────────────────────────────────────────────────────
-- WHS Rule 5.2a: how many of the lowest differentials count, and the adjustment
-- applied while a scoring record is still filling out.
select is(public.whs_index_from_differentials(array[15.0,17.0,16.0]::numeric[]), 13.0,
  'three differentials: lowest one less 2.0');
select is(public.whs_index_from_differentials(array[15.0,17.0,16.0,18.0]::numeric[]), 14.0,
  'four differentials: lowest one less 1.0');
select is(public.whs_index_from_differentials(array[15.0,17.0,16.0,18.0,19.0]::numeric[]), 15.0,
  'five differentials: lowest one, no adjustment');
select is(public.whs_index_from_differentials(array[15.0,17.0,16.0,18.0,19.0,20.0]::numeric[]), 14.5,
  'six differentials: average of the lowest two less 1.0');
select is(public.whs_index_from_differentials(
    array[10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29]::numeric[]), 13.5,
  'twenty differentials: average of the lowest eight');

-- The whole reason the method is configurable: averaging every round can be
-- gamed, and best-of cannot. Five deliberately bad cards after five honest ones.
select is(
  (select round(public.calculate_team_handicap(t.id, 10) - public.calculate_team_handicap(t.id, 5), 1)
   from public.teams t where t.id = 'd2000000-0000-4000-8000-00000000d001'),
  6.4::numeric,
  'league_average hands a sandbagger 6.4 strokes');
select ok(
  (select public.calculate_team_handicap(t.id, 10) - public.calculate_team_handicap(t.id, 5)
   from public.teams t where t.id = 'd2000000-0000-4000-8000-00000000d003') <= 0.5,
  'whs hands the same sandbagger half a stroke at most');

-- ─── The first round is played off a handicap, not off scratch ──────────────
-- Birvo is sold to courses starting a season with players who have no record, so
-- the cold start is the normal case rather than the exception.
insert into public.leagues(id,course_id,name,status,game_format,current_week,season_length_weeks,handicap_method)
values ('e1000000-0000-4000-8000-00000000e001','d0000000-0000-4000-8000-00000000d001',
        'Cold Start League','active','stroke_play',1,10,'league_average');
insert into public.teams(id,course_id,league_id,name,status,current_handicap) values
  ('e2000000-0000-4000-8000-00000000e001','d0000000-0000-4000-8000-00000000d001',
   'e1000000-0000-4000-8000-00000000e001','Newcomers','active',0),
  ('e2000000-0000-4000-8000-00000000e002','d0000000-0000-4000-8000-00000000d001',
   'e1000000-0000-4000-8000-00000000e001','No Shows','active',0);
insert into public.matches(id,course_id,league_id,week_number,status) values
  ('e3000000-0000-4000-8000-00000000e001','d0000000-0000-4000-8000-00000000d001',
   'e1000000-0000-4000-8000-00000000e001',1,'open'),
  ('e3000000-0000-4000-8000-00000000e002','d0000000-0000-4000-8000-00000000d001',
   'e1000000-0000-4000-8000-00000000e001',2,'open');

-- Par is 72 and the allowance 80%, so a 92 gives (92 - 72) x 0.8 = 16.0.
insert into public.scores(id,course_id,match_id,team_id,gross_score,handicap_used,net_score,
  attestation_status,reconciliation_status,is_ghost)
values ('e4000000-0000-4000-8000-00000000e001','d0000000-0000-4000-8000-00000000d001',
  'e3000000-0000-4000-8000-00000000e001','e2000000-0000-4000-8000-00000000e001',
  92,0,92,'approved','ok',false);
select public.apply_provisional_handicap('e4000000-0000-4000-8000-00000000e001');

select is((select handicap_used from public.scores where id='e4000000-0000-4000-8000-00000000e001'),
  16.0::numeric, 'a team with no record plays its first round off a handicap drawn from that round');
select is((select net_score from public.scores where id='e4000000-0000-4000-8000-00000000e001'),
  76.0::numeric, 'and the net score is restated against it');

-- From the second round on there is a real record, so the handicap the team
-- carried into the round stands.
insert into public.scores(id,course_id,match_id,team_id,gross_score,handicap_used,net_score,
  attestation_status,reconciliation_status,is_ghost)
values ('e4000000-0000-4000-8000-00000000e002','d0000000-0000-4000-8000-00000000d001',
  'e3000000-0000-4000-8000-00000000e002','e2000000-0000-4000-8000-00000000e001',
  88,16.0,72,'approved','ok',false);
select public.apply_provisional_handicap('e4000000-0000-4000-8000-00000000e002');
select is((select handicap_used from public.scores where id='e4000000-0000-4000-8000-00000000e002'),
  16.0::numeric, 'a second round is not rewritten: the team already had a record to play off');

-- ─── A ghost score describes nobody ─────────────────────────────────────────
-- A ghost is the field average posted for a team that did not show up. It scores
-- for the standings but it is not a round anyone played, so it must not move a
-- handicap in either direction.
insert into public.scores(id,course_id,match_id,team_id,gross_score,handicap_used,net_score,
  attestation_status,reconciliation_status,is_ghost)
values ('e4000000-0000-4000-8000-00000000e011','d0000000-0000-4000-8000-00000000d001',
  'e3000000-0000-4000-8000-00000000e001','e2000000-0000-4000-8000-00000000e002',
  100,0,100,'approved','ok',true);
insert into public.scores(id,course_id,match_id,team_id,gross_score,handicap_used,net_score,
  attestation_status,reconciliation_status,is_ghost)
values ('e4000000-0000-4000-8000-00000000e012','d0000000-0000-4000-8000-00000000d001',
  'e3000000-0000-4000-8000-00000000e002','e2000000-0000-4000-8000-00000000e002',
  90,0,90,'approved','ok',false);

-- Counting the ghost would give ((100 + 90) / 2 - 72) x 0.8 = 18.4.
select is(public.calculate_team_handicap('e2000000-0000-4000-8000-00000000e002', 2),
  14.4::numeric, 'a ghost round is left out of the handicap: only the 90 counts');

select public.apply_provisional_handicap('e4000000-0000-4000-8000-00000000e012');
select is((select handicap_used from public.scores where id='e4000000-0000-4000-8000-00000000e012'),
  14.4::numeric, 'a team whose only earlier appearance was a ghost still counts as having no record');

select public.apply_provisional_handicap('e4000000-0000-4000-8000-00000000e011');
select is((select handicap_used from public.scores where id='e4000000-0000-4000-8000-00000000e011'),
  0.0::numeric, 'the ghost score itself is never given a provisional handicap');

select * from finish();
rollback;
