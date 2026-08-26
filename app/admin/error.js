'use client';

import ErrorState from '../../components/ui/ErrorState';

export default function AdminError({ error, retry }) {
  return <ErrorState error={error} retry={retry} area="the admin workspace" />;
}
