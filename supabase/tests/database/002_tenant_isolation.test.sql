begin;
set local search_path = public, extensions;
select plan(20);

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000001','authenticated','authenticated',
   'owner-a@example.com','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','20000000-0000-4000-8000-000000000002','authenticated','authenticated',
   'owner-b@example.com','',now(),'{}','{}',now(),now());

insert into public.courses(id,name,city,state) values
  ('a0000000-0000-4000-8000-000000000001','Tenant A Golf Club','Austin','TX'),
  ('b0000000-0000-4000-8000-000000000002','Tenant B Golf Club','Boston','MA');
insert into public.course_memberships(course_id,user_id,email,role,status) values
  ('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner-a@example.com','course_owner','active'),
  ('b0000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','owner-b@example.com','course_owner','active');
insert into public.leagues(id,course_id,name,status,game_format) values
  ('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','League A','active','stroke_play'),
  ('b1000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002','League B','active','stroke_play');
insert into public.teams(id,course_id,league_id,name,status) values
  ('a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Team A','active'),
  ('b2000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','Team B','active');
insert into public.course_holes(course_id,hole_number,par,stroke_index)
select 'a0000000-0000-4000-8000-000000000001',hole_number,4,hole_number
from generate_series(1,9) as holes(hole_number);
insert into public.course_tee_boxes(course_id,name,course_rating,slope_rating,total_yards)
values('a0000000-0000-4000-8000-000000000001','Test Tee',68.0,113,3200);
insert into public.matches(id,course_id,league_id,week_number,status)
values(
  'a2500000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  1,
  'open'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","email":"owner-a@example.com","role":"authenticated"}';

select is((select count(*)::integer from public.courses),1,'Tenant A sees exactly one course');
select is((select name from public.courses),'Tenant A Golf Club','Tenant A sees its own course');
select is((select count(*)::integer from public.course_memberships),1,'Tenant A cannot enumerate Tenant B memberships');
select is((select count(*)::integer from public.leagues),1,'Tenant A cannot enumerate Tenant B leagues');
select is((select count(*)::integer from public.teams),1,'Tenant A cannot enumerate Tenant B teams');
select is((select count(*)::integer from public.teams where id='b2000000-0000-4000-8000-000000000002'),0,'Tenant B team is invisible by direct ID');

select throws_ok(
  $$insert into public.teams(course_id,league_id,name) values(
    'a0000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','Cross Tenant Team')$$,
  'P0001','Cross-tenant reference rejected',
  'tenant trigger rejects an otherwise RLS-authorized cross-course league reference'
);

select lives_ok(
  $$insert into public.teams(course_id,league_id,name) values(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Team A2')$$,
  'Tenant A owner can create a team inside Tenant A'
);

select throws_ok(
  $$select public.save_score_batch(
    'a0000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002',1,
    '[{"teamId":"b2000000-0000-4000-8000-000000000002","grossScore":72}]'::jsonb)$$,
  'P0001','Active league not found',
  'atomic score RPC rejects a league outside the caller course scope'
);

select lives_ok(
  $$select public.save_score_batch(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',1,
    '[{"teamId":"a2000000-0000-4000-8000-000000000001","grossScore":72}]'::jsonb)$$,
  'atomic score RPC accepts a correctly scoped score'
);
select is((select count(*)::integer from public.scores),1,'Tenant A sees its newly written score');

select is(
  (select public.has_course_role('b0000000-0000-4000-8000-000000000002',array['course_owner'])),
  false,
  'Tenant A never inherits a role in Tenant B'
);

select throws_ok(
  $$select public.update_course_profile(
    'b0000000-0000-4000-8000-000000000002','Tampered Course','','Boston',null,null,'#1D7A5F','')$$,
  'P0001','Course manager access required',
  'course profile RPC rejects a neighboring tenant course'
);

select lives_ok(
  $$select public.update_course_profile(
    'a0000000-0000-4000-8000-000000000001','Tenant A Golf Club','','Austin',null,null,'#1D7A5F','USGA rules apply.')$$,
  'course profile RPC updates only the authorized tenant course'
);

select throws_ok(
  $$select public.create_league(
    'b0000000-0000-4000-8000-000000000002','Injected League','stroke_play',10)$$,
  'P0001','Course manager access required',
  'league creation RPC rejects a neighboring tenant course'
);

select lives_ok(
  $$select public.add_league_substitute(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
    'Authorized Substitute',9.2,'','')$$,
  'substitute RPC accepts an authorized league inside Tenant A'
);

select throws_ok(
  $$select public.save_tv_display_settings(
    'b0000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002',
    'leaderboard_ticker',8,true,'Unauthorized',true,false)$$,
  'P0001','Course manager access required',
  'clubhouse publishing rejects a neighboring tenant course'
);

select lives_ok(
  $$select public.save_tv_display_settings(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
    'leaderboard_ticker',8,true,'Welcome to League A',true,false)$$,
  'clubhouse publishing accepts the authorized league'
);

select throws_ok(
  $$select public.apply_ghost_score(
    'a0000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000002',1)$$,
  'P0001','Active league not found',
  'ghost scoring rejects a neighboring league and team'
);

select throws_ok(
  $$select public.apply_ghost_score(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',1)$$,
  'P0001','A submitted scorecard cannot be replaced with a ghost score',
  'ghost scoring never overwrites a submitted scorecard'
);

select * from finish();
rollback;
