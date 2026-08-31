-- A league tracks who has paid their season dues, and what a skins pot is
-- actually worth in dollars.
--
-- Written 2026-08-31. leagueFormats.js already worked out how many skins each
-- team won (see 202608250001_birvo_feature_parity's side-game work) but never
-- said what a skin was worth, and there was no way to know whether a team had
-- paid its seasonal dues at all. Both are cash a small course collects by hand
-- at the counter -- Birvo does not move money, and Stripe stays deliberately
-- unconfigured (see lib/services/billingService.js) -- so this is a ledger an
-- admin marks manually, not a payment flow.
begin;

alter table public.leagues
  add column dues_amount_cents integer not null default 0 check (dues_amount_cents >= 0),
  add column skins_entry_fee_cents integer not null default 0 check (skins_entry_fee_cents >= 0);

alter table public.teams
  add column dues_status text not null default 'unpaid' check (dues_status in ('unpaid','paid','waived')),
  add column dues_paid_method text check (dues_paid_method is null or dues_paid_method in ('cash','check','other')),
  add column dues_paid_at timestamptz,
  add column dues_note text;

update public.app_metadata set schema_version=26,
  migration_name='202608310001_birvo_league_treasury',updated_at=now()
  where key='database';

commit;
