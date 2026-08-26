'use client';

import ErrorState from '../../components/ui/ErrorState';

export default function PlayerError({ error, retry }) {
  return <ErrorState error={error} retry={retry} area="the player portal" />;
}
