-- Business rules that moved from JavaScript into PostgreSQL.
--
-- When the SQLite runtime was removed on 2026-08-29, the rules that guard score
-- entry, round locking, ghost scores and workspace creation stopped living in
-- lib/services and became the responsibility of these functions. The JavaScript
-- tests that covered them were deleted with the code they exercised; this suite
-- is where that coverage moved to.
begin;
set local search_path = public, extensions;
select plan(30);

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

-- ─── Ghost scores ───────────────────────────────────────────────────────────
select throws_ok(
  $$select public.apply_ghost_score(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',1)$$,
  'P0001','A submitted scorecard cannot be replaced with a ghost score',
  'a ghost score never overwrites a real card'
);

-- ─── Round locking ──────────────────────────────────────────────────────────
select throws_ok(
  $$select public.lock_round_and_advance(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',1)$$,
  'P0001','Scorecards still need attestation',
  'a round cannot be locked while a card is unattested'
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

select is(public.course_par('a0000000-0000-4000-8000-000000000001'), 72,
  'the seeded eighteen-hole layout has a par of 72');
select is(public.course_par('c9000000-0000-4000-8000-000000000009'), 36,
  'a nine-hole layout has a par of 36');
select is(public.course_par('00000000-0000-4000-8000-00000000ffff'), 36,
  'a course with no layout falls back to 36 rather than null');

select * from finish();
rollback;
