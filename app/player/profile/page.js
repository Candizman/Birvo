import { getPlayerSession } from '../../../lib/auth';
import { redirect } from 'next/navigation';
import ProfileView from './ProfileView';
import playerRepository from '../../../lib/data/supabase/playerRepository';
import { createAdminClient } from '../../../lib/supabase/admin';

const { getPlayerProfile } = playerRepository;

export default async function PlayerProfilePage() {
  const session = await getPlayerSession();
  if (!session || !session.teamId) {
    redirect('/player/login');
  }

  let profileData = null;
  try {
    profileData = await getPlayerProfile(createAdminClient(), session.teamId);
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
