import { optionVoteLabel, tallyCounts } from './model';

const Bars = ({ bet, highlightId, waiting = false }) => {
  const rows = tallyCounts(bet);
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  if (!rows.length) {
    return <p className="muted">No choices on this bet.</p>;
  }

  return (
    <div className="bars">
      {rows.map((row) => {
        const pct = total === 0 ? 0 : Math.round((row.count / total) * 100);
        const label = optionVoteLabel(bet, row);
        const mine = row.id === highlightId;
        return (
          <div key={row.id} className={mine ? 'bar-row mine' : 'bar-row'}>
            <div className="bar-label">
              <span>{label}</span>
              <span className="bar-count">{row.count}</span>
            </div>
            <div className="bar-track" aria-hidden="true">
              <div className="bar-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      {waiting && total === 0 && <p className="bars-wait">Waiting on votes.</p>}
    </div>
  );
};

export default Bars;
