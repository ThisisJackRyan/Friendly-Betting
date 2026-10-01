import Link from 'next/link';

const Landing = () => (
  <div className="phone landing">
    <div className="scroll landing-body screen-fade">
      <div className="landing-copy">
        <p className="wordmark landing-mark">Friendly</p>
        <h1 className="landing-title">Bet with friends by text</h1>
        <p className="landing-sub">Create a wager, text the link, vote once — no app.</p>
      </div>
      <Link className="cta press landing-cta" href="/new">Start a bet</Link>
    </div>
  </div>
);

export default Landing;
