-- Birvo function privilege lockdown.
--
-- Written 2026-08-29, immediately after the schema was executed against a real
-- PostgreSQL database for the first time.
--
-- WHY THIS EXISTS
--
-- PostgreSQL grants EXECUTE on every newly created function to PUBLIC. The
-- atomic-operations migration tried to close that with a one-time
-- `revoke execute on all functions` plus `alter default privileges`, but the
-- default-privileges rule only covers objects created afterwards *by the role
-- that ran it*. Every function added in the six migrations that followed
-- therefore kept its implicit PUBLIC grant.
--
-- Measured on the live database before this migration ran, the `anon` role --
-- whose key ships to every browser -- could execute twelve SECURITY DEFINER
-- functions, among them trash_league, restore_league, purge_expired_trash,
-- resolve_score, delete_disputed_score, adjust_handicap_manually and
-- execute_team_pin_reset. SECURITY DEFINER bypasses RLS, and these particular
-- functions take course_id as a parameter and perform no auth.uid() check of
-- their own, because they were written to be called only by the server with the
-- service-role key. Anyone holding the public anon key could have trashed any
-- league on any course, rewritten scores, or taken over a player account.
--
-- The same functions were also reachable by `authenticated`.
--
-- This migration revokes the implicit grant across the whole schema and re-grants
-- only what each role is meant to call. Verified afterwards: anon can execute no
-- function in `public`, and authenticated can execute exactly the 34 intended.
begin;

revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Authorization helpers.
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_course_member(uuid) to authenticated;
grant execute on function public.has_course_role(uuid,text[]) to authenticated;

-- Workspace and staff management.
grant execute on function public.accept_course_invitation(uuid) to authenticated;
grant execute on function public.accept_pending_course_invitations() to authenticated;
grant execute on function public.create_tenant_workspace(text,text,text,text,text,text,text,text,integer) to authenticated;
grant execute on function public.create_course_invitation(uuid,text,text,integer) to authenticated;
grant execute on function public.update_course_member_role(uuid,uuid,text) to authenticated;
grant execute on function public.remove_course_member(uuid,uuid) to authenticated;
grant execute on function public.revoke_course_invitation(uuid,uuid) to authenticated;

-- Course setup.
grant execute on function public.initialize_course_layout(uuid) to authenticated;
grant execute on function public.update_course_profile(uuid,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.save_course_holes(uuid,jsonb) to authenticated;
grant execute on function public.upsert_course_tee_box(uuid,uuid,text,text,text,numeric,integer,integer) to authenticated;
grant execute on function public.delete_course_tee_box(uuid,uuid) to authenticated;

-- League operations.
grant execute on function public.create_league(uuid,text,text,integer) to authenticated;
grant execute on function public.update_league_format(uuid,uuid,text) to authenticated;
grant execute on function public.save_league_playoff_bracket(uuid,uuid,jsonb) to authenticated;
grant execute on function public.replace_league_fixtures(uuid,uuid,integer,boolean,jsonb) to authenticated;
grant execute on function public.add_league_substitute(uuid,uuid,text,numeric,text,text) to authenticated;
grant execute on function public.save_team_rsvp(uuid,uuid,uuid,integer,text,text) to authenticated;
grant execute on function public.postpone_league_week(uuid,uuid,integer) to authenticated;
grant execute on function public.generate_shotgun_tee_times(uuid,uuid,integer,time without time zone) to authenticated;

-- Scoring.
grant execute on function public.save_score_batch(uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.lock_round_and_advance(uuid,uuid,integer) to authenticated;
grant execute on function public.request_score_correction(uuid,uuid,integer,text) to authenticated;
grant execute on function public.review_score_correction(uuid,uuid,text,text) to authenticated;
grant execute on function public.apply_ghost_score(uuid,uuid,uuid,integer) to authenticated;
grant execute on function public.get_locked_scores_for_corrections(uuid,uuid) to authenticated;
grant execute on function public.get_score_correction_requests_for_admin(uuid,uuid) to authenticated;

-- Clubhouse publishing.
grant execute on function public.rotate_public_link(uuid,uuid,text) to authenticated;
grant execute on function public.save_tv_display_settings(uuid,uuid,text,integer,boolean,text,boolean,boolean) to authenticated;
grant execute on function public.add_tv_sponsor(uuid,uuid,text,text,integer) to authenticated;
grant execute on function public.delete_tv_sponsor(uuid,uuid,uuid) to authenticated;

-- Server-mediated only. These carry no auth.uid() check of their own and bypass
-- RLS, so they must never be reachable with the anon or authenticated key.
grant execute on function public.consume_rate_limit(text,text,integer,integer) to service_role;
grant execute on function public.mark_course_invitation_delivery(uuid,uuid,text) to service_role;
grant execute on function public.register_player_team(uuid,text,numeric,text) to service_role;
grant execute on function public.upgrade_player_pin_hash(uuid,text) to service_role;
grant execute on function public.submit_player_gross_score(uuid,integer) to service_role;
grant execute on function public.submit_player_hole_scorecard(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.attest_player_score(uuid,uuid,uuid) to service_role;
grant execute on function public.update_player_profile(uuid,text,text,numeric,text,text) to service_role;
grant execute on function public.add_player_bag_club(uuid,text,text,integer) to service_role;
grant execute on function public.delete_player_bag_club(uuid,uuid) to service_role;
grant execute on function public.save_player_round_note(uuid,integer,text) to service_role;
grant execute on function public.request_team_pin_reset(uuid,text,text) to service_role;
grant execute on function public.execute_team_pin_reset(uuid,text,text) to service_role;
grant execute on function public.submit_score_dispute(uuid,text) to service_role;
grant execute on function public.preview_roster_import(uuid,uuid,uuid,uuid,text,integer,integer,integer,jsonb) to service_role;
grant execute on function public.commit_roster_import(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.resolve_score(uuid,uuid,uuid,numeric,integer,integer) to service_role;
grant execute on function public.delete_disputed_score(uuid,uuid,uuid) to service_role;
grant execute on function public.adjust_handicap_manually(uuid,uuid,text,numeric,text,text) to service_role;
grant execute on function public.trash_league(uuid,uuid) to service_role;
grant execute on function public.restore_league(uuid,uuid) to service_role;
grant execute on function public.purge_expired_trash() to service_role;

update public.app_metadata set schema_version=11,
  migration_name='202608290001_birvo_function_privilege_lockdown',updated_at=now()
  where key='database';

commit;
