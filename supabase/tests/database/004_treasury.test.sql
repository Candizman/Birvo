-- Treasury: season dues and the skins pot in dollars.
--
-- Birvo does not move money -- these RPCs are a ledger an admin marks by hand,
-- the same shape as set_league_handicap_method (202608300003), so the coverage
-- worth pinning is the same: only a course manager for the right tenant can
-- change it, invalid input is refused, and the audit trail records it.
begin;
set local search_path = public, extensions;
select plan(19);

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000001','authenticated','authenticated',
   'owner-a@example.com','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000002','authenticated','authenticated',
   'scorer-a@example.com','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','20000000-0000-4000-8000-000000000003','authenticated','authenticated',
   'owner-b@example.com','',now(),'{}','{}',now(),now());

insert into public.courses(id,name,city,state) values
  ('a0000000-0000-4000-8000-000000000001','Tenant A Golf Club','Austin','TX'),
  ('b0000000-0000-4000-8000-000000000002','Tenant B Golf Club','Boston','MA');
insert into public.course_memberships(course_id,user_id,email,role,status) values
  ('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner-a@example.com','course_owner','active'),
  ('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','scorer-a@example.com','scorekeeper','active'),
  ('b0000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','owner-b@example.com','course_owner','active');
insert into public.leagues(id,course_id,name,status,game_format) values
  ('a1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','League A','active','stroke_play'),
  ('b1000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002','League B','active','stroke_play');
insert into public.teams(id,course_id,league_id,name,status) values
  ('a2000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Eagles','active'),
  ('b2000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','Team B','active');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","email":"owner-a@example.com","role":"authenticated"}';

-- ─── Setting the season price ───────────────────────────────────────────────
select lives_ok(
  $$select public.set_league_treasury_settings(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',5000,500)$$,
  'a course manager can set dues and the skins fee'
);
select is((select dues_amount_cents from public.leagues where id='a1000000-0000-4000-8000-000000000001'),5000,
  'dues amount is persisted in cents');
select is((select skins_entry_fee_cents from public.leagues where id='a1000000-0000-4000-8000-000000000001'),500,
  'skins entry fee is persisted in cents');
select is((select count(*)::integer from public.audit_events
    where action='league.treasury_settings.updated' and target_id='a1000000-0000-4000-8000-000000000001'),1,
  'the price change is audited');

select throws_ok(
  $$select public.set_league_treasury_settings(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',-100,0)$$,
  'P0001','Treasury amounts cannot be negative',
  'a negative dues amount is rejected'
);

select throws_ok(
  $$select public.set_league_treasury_settings(
    'b0000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002',5000,500)$$,
  'P0001','Course manager access required',
  'an owner cannot price a league in a tenant they do not belong to'
);

-- A scorekeeper runs score entry, not the treasury -- narrower than
-- COURSE_MANAGEMENT_ROLES on the database side, same as handicap method.
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","email":"scorer-a@example.com","role":"authenticated"}';
select throws_ok(
  $$select public.set_league_treasury_settings(
    'a0000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',5000,500)$$,
  'P0001','Course manager access required',
  'a scorekeeper cannot change the season price'
);
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","email":"owner-a@example.com","role":"authenticated"}';

-- ─── Marking a team's dues ──────────────────────────────────────────────────
select throws_ok(
  $$select public.set_team_dues_status(
    'a0000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','paid',null,null)$$,
  'P0001','A paid team needs a payment method',
  'paid requires a payment method'
);

select throws_ok(
  $$select public.set_team_dues_status(
    'a0000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','overdue',null,null)$$,
  'P0001','Invalid dues status',
  'a status outside unpaid, paid or waived is rejected'
);

select lives_ok(
  $$select public.set_team_dues_status(
    'a0000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','paid','cash','Paid at the counter')$$,
  'a course manager can mark a team paid with a method'
);
select is((select dues_status from public.teams where id='a2000000-0000-4000-8000-000000000001'),'paid',
  'the status is stored');
select is((select dues_paid_method from public.teams where id='a2000000-0000-4000-8000-000000000001'),'cash',
  'the payment method is stored');
select isnt((select dues_paid_at from public.teams where id='a2000000-0000-4000-8000-000000000001'),null,
  'a paid timestamp is recorded');
select is((select dues_note from public.teams where id='a2000000-0000-4000-8000-000000000001'),'Paid at the counter',
  'the note is stored');

-- Moving a paid team back to unpaid clears the method and timestamp -- a stale
-- "paid by cash" reading would outlive the fact that made it true.
select lives_ok(
  $$select public.set_team_dues_status(
    'a0000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','unpaid',null,null)$$,
  'a paid team can be reverted to unpaid'
);
select is((select dues_paid_method from public.teams where id='a2000000-0000-4000-8000-000000000001'),null,
  'the payment method is cleared on revert');
select is((select dues_paid_at from public.teams where id='a2000000-0000-4000-8000-000000000001'),null,
  'the paid timestamp is cleared on revert');

-- Waiving needs no payment method: a waived team was never going to pay.
select lives_ok(
  $$select public.set_team_dues_status(
    'a0000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','waived',null,'League sponsor comp')$$,
  'a team can be waived without a payment method'
);

-- Own course scope, foreign team: the same shape as save_score_batch's
-- cross-tenant rejection (002_tenant_isolation) -- the role check passes for
-- the caller's own course, and the team simply is not found inside it.
select throws_ok(
  $$select public.set_team_dues_status(
    'a0000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002','waived',null,null)$$,
  'P0001','Team not found',
  'a team scoped to a different course is not found, not just unauthorized'
);

select * from finish();
rollback;
