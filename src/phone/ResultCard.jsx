import { FiAward, FiFlag } from 'react-icons/fi';
import { resultHeadline, resultOneLiner, settlementOf } from './settlement';
import { buildReveal, stakeLine } from './reveal';

// The creator's own win on the reveal (buildReveal): "You called it." over
// "Solo win. {stake line}" or "You & Maya won. {stake line}".
const ABOUT_VIEWER = new Set(['you-won', 'you-solo']);

// The settle preview is for the creator (voterId), before they settle. Their
// own win reads as it will on the reveal; anyone else's keeps the winners'
// names, over the stake line.
function previewLines(bet, result, voterId) {
  const reveal = voterId ? buildReveal({ bet, viewerId: voterId }) : null;
  if (ABOUT_VIEWER.has(reveal?.kind)) return { headline: reveal.headline, oneLiner: reveal.subline };
  return {
    headline: resultHeadline(result),
    oneLiner: result.winners.length ? stakeLine(result.stake) : resultOneLiner(result),
  };
}

export default function ResultCard({ bet, voterId, preview = false }) {
  const result = settlementOf(bet);
  if (!result) return null;
  // The preview speaks to the creator in its lines, with no personal line.
  const recipient = preview ? null : result.recipients.find((item) => item.voterId === voterId);
  const { headline, oneLiner } = preview ? previewLines(bet, result, voterId) : {
    headline: resultHeadline(result),
    oneLiner: recipient && !recipient.won ? 'Good game. More friendly bets ahead.' : resultOneLiner(result),
  };
  return (
    <section className="result-card" aria-label={preview ? 'Result preview' : 'Settled result'}>
      <div className="result-eyebrow">
        <span>FRIENDLY · {preview ? 'THE FINAL CALL' : 'CLOSED'}</span>
        <FiAward size={24} aria-hidden="true" />
      </div>
      <h2>{headline}</h2>
      <p className="result-pick">
        Winning pick: <strong>{result.optionLabel}</strong>
      </p>
      <p className="result-stake">
        <FiFlag aria-hidden="true" />
        <span>At stake <strong>{result.stake}</strong></span>
      </p>
      <p className="result-one-liner">{oneLiner}</p>
      {recipient && (
        <p className="result-personal">
          {recipient.won ? 'You called it.' : 'This one’s settled. Thanks for being in.'}
        </p>
      )}
    </section>
  );
}
