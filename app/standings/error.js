'use client';

import ErrorState from '../../components/ui/ErrorState';

export default function StandingsError({ error, retry }) {
  return <ErrorState error={error} retry={retry} area="league standings" />;
}
