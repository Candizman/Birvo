/**
 * The side game played alongside a round.
 *
 * Skins and nassau do not decide the league; they run beside it with their own
 * pot. buildRoundFormatResults works them out for any week that has a complete
 * set of hole scores, and until this existed it worked them out and threw them
 * away -- the pot was calculated and nobody was ever shown who won it.
 */
export default function SideGamePanel({ sideGame }) {
  if (!sideGame) return null;

  const shell = (title, subtitle, body) => (
    <div className="birvo-card" style={{ padding: '1.5rem', background: '#ffffff', borderRadius: '16px', marginTop: '1.5rem' }}>
      <div style={{ marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
        <h3 className="title-primary" style={{ fontSize: '1.05rem', margin: 0 }}>{title}</h3>
        <p style={{ margin: '.25rem 0 0', fontSize: '.82rem', color: 'var(--color-text-muted)' }}>{subtitle}</p>
      </div>
      {body}
    </div>
  );

  if (sideGame.type === 'skins') {
    const { winners = [], carriedOver = 0, potCents, carriedOverCents } = sideGame;
    const hasMoney = typeof potCents === 'number';
    const formatDollars = cents => `$${(cents / 100).toFixed(2)}`;

    return shell(
      'Skins',
      hasMoney
        ? `One skin a hole, lowest net wins it, and a halved hole carries into the next. Pot this week: ${formatDollars(potCents)}.`
        : 'One skin a hole, lowest net wins it, and a halved hole carries into the next.',
      <>
        {winners.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '.9rem' }}>
            Every hole was halved. The whole pot carries over.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {winners.map(winner => (
              <li key={winner.teamId} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
                padding: '.6rem .9rem', borderRadius: '10px', background: 'var(--color-bg-subtle)',
              }}>
                <span style={{ fontWeight: 700, color: 'var(--color-text-main)' }}>{winner.name}</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem' }}>
                  <span style={{ fontWeight: 900, color: '#059669' }}>
                    {winner.skins} <span style={{ fontSize: '.72rem', color: 'var(--color-text-subtle)' }}>
                      {winner.skins === 1 ? 'SKIN' : 'SKINS'}
                    </span>
                  </span>
                  {hasMoney && (
                    <span style={{ fontWeight: 900, color: '#059669' }}>{formatDollars(winner.payoutCents)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {carriedOver > 0 && (
          <p style={{ margin: '.9rem 0 0', fontSize: '.84rem', color: '#92400e', background: '#fef3c7',
                      border: '1px solid #fde68a', borderRadius: '10px', padding: '.6rem .9rem' }}>
            The last hole was halved, so <strong>{carriedOver}</strong>{' '}
            {carriedOver === 1 ? 'skin is' : 'skins are'} unclaimed
            {hasMoney ? ` (${formatDollars(carriedOverCents)})` : ''}. Most leagues carry that into next week —
            Birvo reports it rather than deciding for you.
          </p>
        )}
      </>
    );
  }

  if (sideGame.type === 'nassau') {
    const { matches = [] } = sideGame;
    if (matches.length === 0) return null;
    return shell(
      'Nassau',
      'Three separate bets on the same round: the front nine, the back nine, and the whole thing.',
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
        {matches.map((match, index) => (
          <div key={`${match.team1.id}-${match.team2.id}-${index}`} style={{
            padding: '.75rem .9rem', borderRadius: '10px', background: 'var(--color-bg-subtle)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, marginBottom: '.4rem' }}>
              <span>{match.team1.name} <span style={{ color: '#059669' }}>{match.team1.points}</span></span>
              <span><span style={{ color: '#059669' }}>{match.team2.points}</span> {match.team2.name}</span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '.8rem', color: 'var(--color-text-muted)' }}>
              <span>Front nine: {match.front9.status}</span>
              <span>Back nine: {match.back9.status}</span>
              <span>Overall: {match.overall18.status}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}
