-- initialize_course_layout regained a public EXECUTE grant it should never
-- have had.
--
-- 202608300010 dropped the one-argument initialize_course_layout(uuid) and
-- created a new two-argument overload, initialize_course_layout(uuid,integer).
-- A new argument list is a new function object to Postgres, with its own
-- default privileges -- EXECUTE granted to PUBLIC unless revoked -- and that
-- migration granted authenticated without ever revoking the default, unlike
-- every other RPC in this family. Found by the Supabase security advisor,
-- 2026-08-31: the anon role (the public browser key) could call it and build
-- a course layout it has no business touching.
begin;

revoke execute on function public.initialize_course_layout(uuid,integer) from public, anon;
grant execute on function public.initialize_course_layout(uuid,integer) to authenticated;

update public.app_metadata set schema_version=28,
  migration_name='202608310003_birvo_close_initialize_course_layout_anon_gap',updated_at=now()
  where key='database';

commit;
