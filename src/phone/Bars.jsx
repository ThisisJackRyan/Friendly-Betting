import { useRef, useState } from 'react';
import { optionVoteLabel, tallyCounts } from './model';
import { VOTER_LIST_COPY, VOTER_PREVIEW, viewerNameIndex, voterListLabel, votersByOption } from './voters';
import ProBadge from './ProBadge';

function VoterList({ names, unnamed, mine = -1, badge = null }) {
  const [expanded, setExpanded] = useState(false);
  const list = useRef(null);
  if (!names.length && !unnamed) return null;
  const shown = expanded ? names : names.slice(0, VOTER_PREVIEW);
  const hidden = names.length - shown.length;
  return (
    <ul
      ref={list}
      className="voter-list"
      tabIndex={expanded ? -1 : undefined}
      aria-label={voterListLabel(shown, hidden, unnamed)}
    >
      {shown.map((name, index) => (
        <li key={`${index}-${name}`} className="voter-name" title={name}>
          {name}
          {index === mine && <ProBadge badge={badge} />}
        </li>
      ))}
      {hidden > 0 && (
        <li className="voter-more">
          <button
            type="button"
            onClick={() => {
              setExpanded(true);
              // The button goes away; keep focus on the now complete list.
              requestAnimationFrame(() => list.current?.focus());
            }}
          >
            {VOTER_LIST_COPY.more(hidden)}
          </button>
        </li>
      )}
      {unnamed > 0 && <li className="voter-unnamed">{VOTER_LIST_COPY.friends(unnamed)}</li>}
    </ul>
  );
}

// `viewerBadge` (the viewer's own Pro badge) follows only `viewerId`'s name.
const Bars = ({ bet, highlightId, waiting = false, showVoters = false, viewerId = '', viewerBadge = null }) => {
  const rows = tallyCounts(bet);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const voters = showVoters ? votersByOption(bet) : {};

  if (!rows.length) {
    return <p className="muted">No choices on this bet.</p>;
  }

  return (
    <div className="bars">
      {rows.map((row) => {
        const pct = total === 0 ? 0 : Math.round((row.count / total) * 100);
        const label = optionVoteLabel(bet, row);
        const mine = row.id === highlightId;
        const side = voters[row.id];
        return (
          <div key={row.id} className={mine ? 'bar-row mine' : 'bar-row'}>
            <div className="bar-label">
              <span>{label}</span>
              <span className="bar-count">
                {row.count} <span className="bar-percent">· {pct}%</span>
              </span>
            </div>
            <div className="bar-track" aria-hidden="true">
              <div className="bar-fill" style={{ width: `${pct}%` }} />
            </div>
            {side && (
              <VoterList
                names={side.names}
                unnamed={side.unnamed}
                mine={viewerBadge ? viewerNameIndex(bet, row.id, viewerId) : -1}
                badge={viewerBadge}
              />
            )}
          </div>
        );
      })}
      {waiting && total === 0 && <p className="bars-wait">First pick gets the conversation going.</p>}
    </div>
  );
};

export default Bars;
