import db from '../../../lib/database';
import { getPlayerSession } from '../../../lib/auth';
import { getPlayerProfile } from '../../../lib/services/playerService';
import { redirect } from 'next/navigation';
import ProfileView from './ProfileView';
import dataBackend from '../../../lib/data/backend';
import playerRepository from '../../../lib/data/supabase/playerRepository';
import { createAdminClient } from '../../../lib/supabase/admin';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { getPlayerProfile: getSupabasePlayerProfile } = playerRepository;

export default async function PlayerProfilePage() {
  const session = await getPlayerSession();
  if (!session || !session.teamId) {
    redirect('/player/login');
  }

  const activeDataBackend = resolveDataBackend();
  let profileData = null;
  try {
    profileData = activeDataBackend === DATA_BACKENDS.SUPABASE
      ? await getSupabasePlayerProfile(createAdminClient(), session.teamId)
      : getPlayerProfile(db, session.teamId);
  } catch {
    profileData = null;
  }
  if (!profileData) {
    redirect('/player/login');
  }

  return (
    <ProfileView profileData={profileData} />
  );
}
