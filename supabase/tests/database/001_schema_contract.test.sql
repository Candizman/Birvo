begin;
set local search_path = public, extensions;
select plan(93);

-- Feature-parity tables.
select has_table('public',name,'public.'||name||' exists') from (values
  ('match_fixtures'),('tee_times'),('substitutes'),('player_rsvps'),
  ('handicap_audit_logs'),('score_audit_logs'),('player_profiles'),('player_badges'),
  ('player_bag_clubs'),('round_notes'),('tv_displays'),('tv_sponsors'),
  ('billing_invoices'),('coupon_codes'),('tournament_entry_fees'),('app_metadata')
) as expected(name);
select has_table('private','rate_limit_events','rate-limit events stay outside the exposed public schema');

-- Columns required by the current Birvo domain.
select has_column('public','courses','logo_url','public.courses.logo_url exists');
select has_column('public','courses','weather_lat','public.courses.weather_lat exists');
select has_column('public','courses','weather_lon','public.courses.weather_lon exists');
select has_column('public','courses','currency','public.courses.currency exists');
select has_column('public','leagues','game_format','public.leagues.game_format exists');
select has_column('public','leagues','trashed_at','public.leagues.trashed_at exists');
select has_column('public','leagues','playoff_bracket','public.leagues.playoff_bracket exists');
select has_column('public','teams','pin','public.teams.pin exists');
select has_column('public','teams','ghin_number','public.teams.ghin_number exists');
select has_column('public','teams','low_handicap_365','public.teams.low_handicap_365 exists');
select has_column('public','player_bag_clubs','avg_distance_yards','public.player_bag_clubs.avg_distance_yards exists');
select has_column('public','scores','attested_by_team_id','public.scores.attested_by_team_id exists');
select has_column('public','scores','scorecard_photo_url','public.scores.scorecard_photo_url exists');
select has_column('public','scores','is_ghost','public.scores.is_ghost exists');
select has_column('public','score_hole_details','fairway_hit','public.score_hole_details.fairway_hit exists');
select has_column('public','score_hole_details','gir','public.score_hole_details.gir exists');
select has_column('public','score_hole_details','sand_saves','public.score_hole_details.sand_saves exists');

select ok(
  not exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname=any(array[
        'match_fixtures','tee_times','substitutes','player_rsvps','handicap_audit_logs',
        'score_audit_logs','player_profiles','player_badges','player_bag_clubs','round_notes',
        'tv_displays','tv_sponsors','billing_invoices','coupon_codes','tournament_entry_fees','app_metadata'
      ]) and not c.relrowsecurity
  ),
  'RLS is enabled on every feature-parity public table'
);
select ok(
  not exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname=any(array['courses','course_memberships','leagues','teams','matches','scores'])
      and not c.relrowsecurity
  ),
  'RLS remains enabled on the core tenant tables'
);
select ok(
  exists(
    select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relname='scores' and t.tgname='ensure_tenant_consistency' and not t.tgisinternal
  ),
  'scores retain a tenant-consistency trigger'
);

-- Explicitly exposed business operations.
select has_function('public','create_tenant_workspace',array['text','text','text','text','text','text','text','text','integer']);
select has_function('public','accept_pending_course_invitations',array[]::text[]);
select has_function('public','create_course_invitation',array['uuid','text','text','integer']);
select has_function('public','update_course_member_role',array['uuid','uuid','text']);
select has_function('public','remove_course_member',array['uuid','uuid']);
select has_function('public','revoke_course_invitation',array['uuid','uuid']);
select has_function('public','save_score_batch',array['uuid','uuid','integer','jsonb']);
select has_function('public','lock_round_and_advance',array['uuid','uuid','integer']);
select has_function('public','request_score_correction',array['uuid','uuid','integer','text']);
select has_function('public','review_score_correction',array['uuid','uuid','text','text']);
select has_function('public','rotate_public_link',array['uuid','uuid','text']);
select has_function('public','initialize_course_layout',array['uuid']);
select has_function('public','update_course_profile',array['uuid','text','text','text','text','text','text','text']);
select has_function('public','save_course_holes',array['uuid','jsonb']);
select has_function('public','upsert_course_tee_box',array['uuid','uuid','text','text','text','numeric','integer','integer']);
select has_function('public','delete_course_tee_box',array['uuid','uuid']);
select has_function('public','generate_shotgun_tee_times',array['uuid','uuid','integer','time without time zone']);
select has_function('public','create_league',array['uuid','text','text','integer']);
select has_function('public','update_league_format',array['uuid','uuid','text']);
select has_function('public','save_league_playoff_bracket',array['uuid','uuid','jsonb']);
select has_function('public','replace_league_fixtures',array['uuid','uuid','integer','boolean','jsonb']);
select has_function('public','add_league_substitute',array['uuid','uuid','text','numeric','text','text']);
select has_function('public','save_team_rsvp',array['uuid','uuid','uuid','integer','text','text']);
select has_function('public','postpone_league_week',array['uuid','uuid','integer']);
select has_function('public','save_tv_display_settings',array['uuid','uuid','text','integer','boolean','text','boolean','boolean']);
select has_function('public','add_tv_sponsor',array['uuid','uuid','text','text','integer']);
select has_function('public','delete_tv_sponsor',array['uuid','uuid','uuid']);
select has_function('public','apply_ghost_score',array['uuid','uuid','uuid','integer']);
select has_function('public','archive_league',array['uuid','uuid']);
select has_function('public','course_par',array['uuid']);
select has_function('public','calculate_team_handicap',array['uuid','integer']);
select has_function('public','set_league_handicap_method',array['uuid','uuid','text','integer']);
select has_function('public','whs_index_from_differentials',array['numeric[]']);
select has_function('public','league_rating',array['uuid']);
select has_function('public','apply_provisional_handicap',array['uuid']);
select has_function('public','hole_card_total',array['uuid','jsonb']);
select has_column('public','leagues','handicap_method','public.leagues.handicap_method exists');
select has_column('public','leagues','handicap_allowance_percent','public.leagues.handicap_allowance_percent exists');
select has_function('public','register_player_team',array['uuid','text','numeric','text']);
select has_function('public','upgrade_player_pin_hash',array['uuid','text']);
select has_function('public','submit_player_gross_score',array['uuid','integer']);
select has_function('public','submit_player_hole_scorecard',array['uuid','uuid','jsonb','text']);
select has_function('public','attest_player_score',array['uuid','uuid','uuid']);
select has_function('public','update_player_profile',array['uuid','text','text','numeric','text','text']);
select has_function('public','add_player_bag_club',array['uuid','text','text','integer']);
select has_function('public','delete_player_bag_club',array['uuid','uuid']);
select has_function('public','save_player_round_note',array['uuid','integer','text']);

select ok(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname=any(array[
        'create_tenant_workspace','accept_pending_course_invitations','create_course_invitation','update_course_member_role',
        'remove_course_member','revoke_course_invitation','save_score_batch',
        'lock_round_and_advance','request_score_correction','review_score_correction','rotate_public_link',
        'initialize_course_layout','update_course_profile','save_course_holes','upsert_course_tee_box',
        'delete_course_tee_box','generate_shotgun_tee_times',
        'create_league','update_league_format','save_league_playoff_bracket','replace_league_fixtures',
        'add_league_substitute','save_team_rsvp','postpone_league_week',
        'save_tv_display_settings','add_tv_sponsor','delete_tv_sponsor','apply_ghost_score',
        'register_player_team','upgrade_player_pin_hash','submit_player_gross_score',
        'submit_player_hole_scorecard','attest_player_score','update_player_profile',
        'add_player_bag_club','delete_player_bag_club','save_player_round_note'
      ])
      and (not p.prosecdef or coalesce(array_to_string(p.proconfig,','),'') not like '%search_path=%')
  ),
  'every authenticated business RPC is SECURITY DEFINER with a fixed search_path'
);

select ok(
  not has_table_privilege('anon','public.teams','SELECT')
  and not has_table_privilege('anon','public.scores','SELECT')
  and not has_table_privilege('anon','public.course_memberships','SELECT'),
  'anon receives no direct tenant-table grants'
);
select ok(
  not has_function_privilege('anon','public.save_score_batch(uuid,uuid,integer,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.save_tv_display_settings(uuid,uuid,text,integer,boolean,text,boolean,boolean)','EXECUTE')
  and not has_function_privilege('anon','public.apply_ghost_score(uuid,uuid,uuid,integer)','EXECUTE'),
  'anon cannot execute staff score or publishing operations'
);
select ok(
  not has_function_privilege('authenticated','public.consume_rate_limit(text,text,integer,integer)','EXECUTE'),
  'authenticated clients cannot execute the service-only rate limiter'
);
select ok(
  not has_function_privilege('authenticated','public.mark_course_invitation_delivery(uuid,uuid,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.register_player_team(uuid,text,numeric,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.upgrade_player_pin_hash(uuid,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.submit_player_gross_score(uuid,integer)','EXECUTE')
  and not has_function_privilege('authenticated','public.submit_player_hole_scorecard(uuid,uuid,jsonb,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.attest_player_score(uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.update_player_profile(uuid,text,text,numeric,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.add_player_bag_club(uuid,text,text,integer)','EXECUTE')
  and not has_function_privilege('authenticated','public.delete_player_bag_club(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.save_player_round_note(uuid,integer,text)','EXECUTE'),
  'authenticated clients cannot execute service-only player operations'
);
select ok(
  has_function_privilege('service_role','public.consume_rate_limit(text,text,integer,integer)','EXECUTE'),
  'service role can execute the persistent rate limiter'
);
select ok(
  has_function_privilege('service_role','public.mark_course_invitation_delivery(uuid,uuid,text)','EXECUTE')
  and has_function_privilege('service_role','public.register_player_team(uuid,text,numeric,text)','EXECUTE')
  and has_function_privilege('service_role','public.upgrade_player_pin_hash(uuid,text)','EXECUTE')
  and has_function_privilege('service_role','public.submit_player_gross_score(uuid,integer)','EXECUTE')
  and has_function_privilege('service_role','public.submit_player_hole_scorecard(uuid,uuid,jsonb,text)','EXECUTE')
  and has_function_privilege('service_role','public.attest_player_score(uuid,uuid,uuid)','EXECUTE')
  and has_function_privilege('service_role','public.update_player_profile(uuid,text,text,numeric,text,text)','EXECUTE')
  and has_function_privilege('service_role','public.add_player_bag_club(uuid,text,text,integer)','EXECUTE')
  and has_function_privilege('service_role','public.delete_player_bag_club(uuid,uuid)','EXECUTE')
  and has_function_privilege('service_role','public.save_player_round_note(uuid,integer,text)','EXECUTE'),
  'service role can execute server-owned player operations'
);

-- These check that a team HAS a PIN, never that the caller knows it; the PIN
-- session is verified in the Next.js route above them. Reachable by anon, they
-- would let anybody post a card for any team id.
select ok(
  not has_function_privilege('anon','public.submit_player_gross_score(uuid,integer)','EXECUTE')
  and not has_function_privilege('anon','public.submit_player_hole_scorecard(uuid,uuid,jsonb,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.submit_player_gross_score(uuid,integer)','EXECUTE')
  and not has_function_privilege('authenticated','public.submit_player_hole_scorecard(uuid,uuid,jsonb,text)','EXECUTE'),
  'player score submission is reachable only through the server, never from a browser'
);
select is(
  (select schema_version from public.app_metadata where key='database'),
  22,
  'database schema marker is at the expected version'
);

select * from finish();
rollback;
