import { FiAward, FiFlag } from 'react-icons/fi';
import { resultHeadline, resultOneLiner, settlementOf } from './settlement';

export default function ResultCard({ bet, voterId, preview = false }) {
  const result = settlementOf(bet);
  if (!result) return null;
  const recipient = result.recipients.find((item) => item.voterId === voterId);
  return (
    <section className="result-card" aria-label={preview ? 'Result preview' : 'Settled result'}>
      <div className="result-eyebrow">
        <span>FRIENDLY · {preview ? 'THE FINAL CALL' : 'CLOSED'}</span>
        <FiAward size={24} aria-hidden="true" />
      </div>
      <h2>{resultHeadline(result)}</h2>
      <p className="result-pick">
        Winning pick: <strong>{result.optionLabel}</strong>
      </p>
      <p className="result-stake">
        <FiFlag aria-hidden="true" />
        <span>At stake <strong>{result.stake}</strong></span>
      </p>
      <p className="result-one-liner">
        {recipient && !recipient.won ? 'Good game. More friendly bets ahead.' : resultOneLiner(result)}
      </p>
      {recipient && (
        <p className="result-personal">
          {recipient.won ? 'You called it.' : 'This one’s settled. Thanks for being in.'}
        </p>
      )}
    </section>
  );
}
