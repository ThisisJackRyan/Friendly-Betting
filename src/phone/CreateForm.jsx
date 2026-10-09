'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from '../platform/Link';
import { useParams, usePathname, useRouter } from '../platform/navigation';
import { FiChevronLeft, FiFlag, FiMessageCircle, FiShield, FiX } from 'react-icons/fi';
import { FlowProgress, PageIntro } from './ProductUI';
import { saveBet } from './api';
import {
  CodeBody,
  PersonCheck,
  PhoneAlert,
  PhoneBody,
  SendButton,
  VerifyButton,
  useCreatorPhone,
} from './AuthSlides';
import { useCreateChrome } from './createChrome';
import { armHomeArrival, prefersReducedMotion, SLIDE_MS } from './createMotion';
import { AUTH_COPY, CREATE_STEP, adjacentCreateStep, isCreator } from './creatorSession';
import { creatorName, useIdentity } from './identity';
import { buildDraft, friendlyError, parseCloses, TYPE_META } from './model';
import { markFreshBet } from './freshBet';
import CreatePick from './CreatePick';
import Landing from './Landing';
import AppHeader from './AppHeader';

const COPY = {
  newBet: 'New bet',
  stake: 'Stake',
  stakeHint: 'Skip if it\u2019s just bragging rights.',
  stakePlaceholder: 'Pizza, $5, bragging rights',
  questionPlaceholder: 'Who shows up last?',
  linePlaceholder: '13.5',
  propMaya: 'Maya',
  propSam: 'Sam',
  next: 'Next',
  textFriends: 'Text friends',
  sending: 'Getting it ready\u2026',
};

// Each Create step after the one Create opened on is its own `#step-N` history
// entry on this same page, pushed through the platform router (a same-document
// hash navigation in both Next and React Router, so the draft in state survives).
// The iOS swipe, Android back, browser back, and the on-screen back all pop it.
// Making the bet hands off to its live tally in place of these entries (see
// leaveForTally), so no way back lands on a step that already sent.
const STEP_HASH = /^#step-(\d+)$/;

function stepFromHash(hash) {
  const match = STEP_HASH.exec(hash || '');
  return match ? Number(match[1]) : null;
}

const SKIP_WHEN_CREATOR = [CREATE_STEP.phone, CREATE_STEP.code];

function draftInput(state) {
  return {
    question: state.question,
    stake: state.stake,
    closesAt: parseCloses(state.closes),
    optionA: state.optionA,
    optionB: state.optionB,
    line: state.line,
    overLabel: state.overLabel,
    underLabel: state.underLabel,
    propOptions: state.propOptions,
  };
}

const CreateForm = () => {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const identity = useIdentity();
  const [linkedUser, setLinkedUser] = useState(null);
  const user = linkedUser || identity;
  const phone = useCreatorPhone();
  const advancedAuth = useRef(false);
  const stepRef = useRef(1);
  const { setHidePhoneTabs, setPinPhoneTabs } = useCreateChrome();
  const rawType = params?.type;
  const routeType = TYPE_META[rawType] ? rawType : null;
  const invalidRoute = Boolean(rawType) && !routeType;

  const [step, setStep] = useState(routeType ? 2 : 1);
  // entries[0] is the hashless entry Create opened on; later ones carry `#step-N`.
  // Forward moves push, so steps in entries only grow and a hash finds its entry.
  const stepHistory = useRef({ entries: [step], index: 0 });
  const onPopRef = useRef(null);
  const [leaving, setLeaving] = useState(null);
  const [motion, setMotion] = useState('forward');
  const [hasMoved, setHasMoved] = useState(false);
  const [exitHome, setExitHome] = useState(false);
  const [type, setType] = useState(routeType);
  const [question, setQuestion] = useState('');
  const [stake, setStake] = useState('');
  const [closes, setCloses] = useState('');
  const [optionA, setOptionA] = useState('Yes');
  const [optionB, setOptionB] = useState('No');
  const [line, setLine] = useState('');
  const [overLabel, setOverLabel] = useState('Over');
  const [underLabel, setUnderLabel] = useState('Under');
  const [propOptions, setPropOptions] = useState(['', '']);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const leavingRef = useRef(false);
  const mountedRef = useRef(false);

  const meta = TYPE_META[type] || null;
  const input = draftInput({
    question,
    stake,
    closes,
    optionA,
    optionB,
    line,
    overLabel,
    underLabel,
    propOptions,
  });
  const draft = type ? buildDraft(type, input) : { ok: false, error: 'Pick a bet type.' };

  useLayoutEffect(() => {
    setPinPhoneTabs(false);
  }, [setPinPhoneTabs]);

  useEffect(() => {
    if (invalidRoute) router.replace('/new');
  }, [invalidRoute, router]);

  // A refresh (or a return from another page) on a step hash starts Create over
  // on its first step, so the stale hash is dropped instead of adding an entry.
  useEffect(() => {
    if (!invalidRoute && stepFromHash(window.location.hash) != null) {
      router.replace(pathname, { scroll: false });
    }
    // Mount only: later hashes are this form's own entries.
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const onPop = () => onPopRef.current?.();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const titles = {
      1: COPY.newBet,
      2: meta?.label || COPY.newBet,
      3: COPY.stake,
      4: AUTH_COPY.phoneTitle,
      5: AUTH_COPY.codeTitle,
    };
    document.title = `${titles[step] || COPY.newBet} · Friendly`;
  }, [step, meta]);

  useEffect(() => {
    setHidePhoneTabs(step > 1 || leaving != null);
    return () => setHidePhoneTabs(false);
  }, [step, leaving, setHidePhoneTabs]);

  useEffect(() => {
    if (leaving == null || exitHome) return undefined;
    const id = window.setTimeout(() => setLeaving(null), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [leaving, step, exitHome]);

  useEffect(() => {
    if (!exitHome) return undefined;
    const id = window.setTimeout(() => router.push('/'), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [exitHome, router]);

  stepRef.current = step;

  const stepUrl = (next) => `${pathname}#step-${next}`;

  const pushStep = (next) => {
    const trail = stepHistory.current;
    trail.entries = [...trail.entries.slice(0, trail.index + 1), next];
    trail.index = trail.entries.length - 1;
    router.push(stepUrl(next), { scroll: false });
  };

  // Replace semantics: no new entry. The entry Create opened on keeps its URL.
  const replaceStep = (next) => {
    const trail = stepHistory.current;
    trail.entries = trail.entries.map((entry, i) => (i === trail.index ? next : entry));
    if (trail.index > 0) router.replace(stepUrl(next), { scroll: false });
  };

  const show = (next, direction) => {
    setMotion(direction);
    setLeaving(stepRef.current);
    setHasMoved(true);
    setError('');
    setStep(next);
  };

  // Back from the tally goes to wherever Create was opened from: walk back to
  // the hashless entry Create opened on, then put the tally in its place. The
  // step entries ahead of it are only reachable by forward, which opens a
  // fresh Create (see the refresh rule above), never the bet that just sent.
  const leaveForTally = (id) => {
    const href = `/t/${encodeURIComponent(id)}`;
    const behind = stepHistory.current.index;
    leavingRef.current = true;
    if (behind <= 0) {
      router.replace(href);
      return;
    }
    const arrive = () => {
      window.removeEventListener('popstate', arrive);
      // After the router has handled the same popstate.
      window.setTimeout(() => router.replace(href), 0);
    };
    window.addEventListener('popstate', arrive);
    window.history.go(-behind);
  };

  // Makes the bet and opens its live tally, which offers the invite. Once
  // saved, this Create is done: the button stays busy until the tally shows.
  const makeBet = async (creator) => {
    if (savingRef.current || leavingRef.current) return;
    const ready = buildDraft(type, input);
    if (!ready.ok) {
      setError(ready.error);
      return;
    }
    if (!isCreator(creator)) {
      go(CREATE_STEP.phone);
      return;
    }

    const fields = {
      ...ready.fields,
      createdByID: creator.uid,
      createdByName: creatorName(creator),
    };
    if (creator.email) fields.createdByEmail = creator.email;

    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const id = await saveBet(null, fields);
      // Left Create mid-save: the bet is in My bets, and no tally opens.
      if (!mountedRef.current) return;
      markFreshBet(id);
      leaveForTally(id);
    } catch (err) {
      savingRef.current = false;
      setSaving(false);
      // A spent code can't be used again, so a failed save after sign-in
      // waits on the stake slide, where trying again makes the bet.
      if (stepRef.current !== CREATE_STEP.stake) go(CREATE_STEP.stake);
      setError(friendlyError(err, 'Could not save this bet.'));
    }
  };

  useEffect(() => {
    if (!phone.verifiedUser || advancedAuth.current) return;
    advancedAuth.current = true;
    setLinkedUser(phone.verifiedUser);
    makeBet(phone.verifiedUser);
  }, [phone.verifiedUser]);

  // Forward moves add an entry; a backward move that isn't a history back
  // (nothing of ours behind it) replaces the current one.
  const go = (next) => {
    if (exitHome || next == null || next === step || next < 1 || next > CREATE_STEP.code) return;
    if (next > step) pushStep(next);
    else replaceStep(next);
    show(next, next > step ? 'forward' : 'back');
  };

  // Moves back to `target` through history when it is the entry right behind,
  // so the slide comes from the popstate below like any swipe or Android back.
  const goBackTo = (target) => {
    const trail = stepHistory.current;
    if (trail.index > 0 && trail.entries[trail.index - 1] === target) router.back();
    else go(target);
  };

  onPopRef.current = () => {
    if (leavingRef.current || window.location.pathname !== pathname) return;
    const trail = stepHistory.current;
    const hashStep = stepFromHash(window.location.hash);
    const index = hashStep == null ? 0 : trail.entries.indexOf(hashStep, 1);
    if (index < 0) return;
    const from = trail.index;
    trail.index = index;
    const target = trail.entries[index];
    if (exitHome || target === stepRef.current) return;
    // Same rule as adjacentCreateStep: a verified creator never sees phone or
    // code again, so keep walking past that entry in the same direction.
    if (SKIP_WHEN_CREATOR.includes(target) && isCreator(user)) {
      if (index < from) router.back();
      else window.history.forward();
      return;
    }
    show(target, target < stepRef.current ? 'back' : 'forward');
  };

  const goHome = () => {
    if (exitHome) return;
    armHomeArrival();
    setHidePhoneTabs(true);
    if (prefersReducedMotion()) {
      router.push('/');
      return;
    }
    setMotion('back');
    setLeaving(step);
    setHasMoved(true);
    setExitHome(true);
  };

  const onHomeClick = (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    goHome();
  };

  const pickType = (id) => {
    if (exitHome) return;
    setType(id);
    pushStep(2);
    show(2, 'forward');
  };

  // With a Create entry behind, back is a history back: the same path as a
  // swipe. On the entry Create opened on, back works as it always has.
  const onBack = (stepNumber) => {
    if (exitHome) return;
    if (stepHistory.current.index > 0) {
      router.back();
      return;
    }
    const prev = adjacentCreateStep(stepNumber, user, -1);
    if (prev == null) {
      goHome();
      return;
    }
    go(prev);
  };

  const updateProp = (index, value) => {
    setError('');
    setPropOptions((current) => current.map((item, i) => (i === index ? value : item)));
  };

  const addProp = () => {
    setError('');
    setPropOptions((current) => (current.length >= 4 ? current : [...current, '']));
  };

  const removeProp = (index) => {
    setError('');
    setPropOptions((current) =>
      current.length <= 2 ? current : current.filter((_, i) => i !== index),
    );
  };

  const onDetailsNext = () => {
    if (!draft.ok) {
      setError(draft.error);
      return;
    }
    go(3);
  };

  const titleFor = (stepNumber) => {
    if (stepNumber === CREATE_STEP.details) return meta?.label || COPY.newBet;
    if (stepNumber === CREATE_STEP.stake) return COPY.stake;
    if (stepNumber === CREATE_STEP.phone) return AUTH_COPY.phoneTitle;
    if (stepNumber === CREATE_STEP.code) return AUTH_COPY.codeTitle;
    return COPY.newBet;
  };

  const onSendCode = async () => {
    const sent = await phone.send();
    if (sent) go(CREATE_STEP.code);
  };

  const renderStep = (stepNumber) => {
    let body = null;
    let cta = null;

    if (stepNumber === 1) {
      return (
        <CreatePick
          onBack={() => onBack(1)}
          onHomeClick={onHomeClick}
          onPick={pickType}
          user={user}
          error={error && stepNumber === step ? error : ''}
        />
      );
    }

    if (stepNumber === 2 && meta) {
      body = (
        <>
          <PageIntro eyebrow={meta.label} title="Put it on the record.">
            Ask the question. Give your friends something to pick.
          </PageIntro>
          <label className="field" htmlFor="question">
            <span className="field-label">
              Question <span className="req">*</span>
            </span>
            <textarea
              id="question"
              rows={3}
              aria-required="true"
              value={question}
              placeholder={COPY.questionPlaceholder}
              onChange={(event) => {
                setError('');
                setQuestion(event.target.value);
              }}
            />
          </label>

          {type === 'money-line' && (
            <div className="field-pair">
              <label className="field" htmlFor="option-a">
                <span className="field-label">Option A</span>
                <input
                  id="option-a"
                  value={optionA}
                  onChange={(event) => {
                    setError('');
                    setOptionA(event.target.value);
                  }}
                />
              </label>
              <label className="field" htmlFor="option-b">
                <span className="field-label">Option B</span>
                <input
                  id="option-b"
                  value={optionB}
                  onChange={(event) => {
                    setError('');
                    setOptionB(event.target.value);
                  }}
                />
              </label>
            </div>
          )}

          {type === 'over-under' && (
            <>
              <label className="field" htmlFor="line">
                <span className="field-label">
                  Line <span className="req">*</span>
                </span>
                <input
                  id="line"
                  inputMode="decimal"
                  value={line}
                  placeholder={COPY.linePlaceholder}
                  onChange={(event) => {
                    setError('');
                    setLine(event.target.value);
                  }}
                />
              </label>
              <div className="field-pair">
                <label className="field" htmlFor="over-label">
                  <span className="field-label">Over</span>
                  <input
                    id="over-label"
                    value={overLabel}
                    onChange={(event) => {
                      setError('');
                      setOverLabel(event.target.value);
                    }}
                  />
                </label>
                <label className="field" htmlFor="under-label">
                  <span className="field-label">Under</span>
                  <input
                    id="under-label"
                    value={underLabel}
                    onChange={(event) => {
                      setError('');
                      setUnderLabel(event.target.value);
                    }}
                  />
                </label>
              </div>
            </>
          )}

          {type === 'prop' && (
            <div className="prop-block">
              {propOptions.map((value, index) => (
                <div className="option-row" key={`option-${index}`}>
                  <label className="field grow" htmlFor={`prop-${index}`}>
                    <span className="field-label">Option {index + 1}</span>
                    <input
                      id={`prop-${index}`}
                      value={value}
                      placeholder={index === 0 ? COPY.propMaya : COPY.propSam}
                      onChange={(event) => updateProp(index, event.target.value)}
                    />
                  </label>
                  {propOptions.length > 2 && (
                    <button
                      type="button"
                      className="icon-btn remove"
                      aria-label={`Remove option ${index + 1}`}
                      onClick={() => removeProp(index)}
                    >
                      <FiX size={22} />
                    </button>
                  )}
                </div>
              ))}
              {propOptions.length < 4 && (
                <button type="button" className="secondary press" onClick={addProp}>
                  Add option
                </button>
              )}
            </div>
          )}
        </>
      );
      cta = (
        <button
          type="button"
          className="cta press"
          aria-disabled={draft.ok ? undefined : true}
          onClick={onDetailsNext}
        >
          {COPY.next}
        </button>
      );
    }

    if (stepNumber === 3) {
      const makesBet = adjacentCreateStep(CREATE_STEP.stake, user, 1) == null;
      body = (
        <>
          <PageIntro icon={FiFlag} title="What’s on the line?">
            A coffee, dinner, or a well-earned “I told you so.” You decide.
          </PageIntro>
          <p className="field-hint">{COPY.stakeHint}</p>
          <div className="stake-suggestions" aria-label="Suggested stakes">
            {['Bragging rights', 'Coffee', 'Dinner', '$5'].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className={stake === suggestion ? 'selected' : ''}
                aria-pressed={stake === suggestion}
                onClick={() => {
                  setStake(suggestion);
                  setError('');
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <div className="field-pair">
            <label className="field" htmlFor="stake">
              <span className="field-label">Stake</span>
              <input
                id="stake"
                value={stake}
                placeholder={COPY.stakePlaceholder}
                onChange={(event) => {
                  setError('');
                  setStake(event.target.value);
                }}
              />
            </label>
            <label className="field" htmlFor="closes">
              <span className="field-label">
                Closes <span className="optional">optional</span>
              </span>
              <input
                id="closes"
                type="datetime-local"
                value={closes}
                onChange={(event) => {
                  setError('');
                  setCloses(event.target.value);
                }}
              />
            </label>
          </div>
        </>
      );
      cta = (
        <button
          type="button"
          className="cta press"
          disabled={saving}
          onClick={() => {
            if (!user) {
              setError('Still connecting. Try again in a second.');
              return;
            }
            if (makesBet) makeBet(user);
            else go(adjacentCreateStep(CREATE_STEP.stake, user, 1));
          }}
        >
          {!makesBet ? COPY.next : saving ? COPY.sending : COPY.textFriends}
        </button>
      );
    }

    if (stepNumber === CREATE_STEP.phone) {
      body = (
        <>
          <PageIntro icon={FiShield} title="Your bets, in your corner.">
            Verify your number so you can find your bets and settle the score.
          </PageIntro>
          <PhoneBody
            formatted={phone.formatted}
            onNational={phone.onNational}
            busy={phone.busy}
            check={stepNumber === step ? <PersonCheck containerRef={phone.containerRef} /> : null}
          />
          {stepNumber === step ? <PhoneAlert error={phone.error} code={phone.errorCode} /> : null}
        </>
      );
      cta = <SendButton busy={phone.busy} ready={phone.readyPhone} onSend={onSendCode} />;
    }

    if (stepNumber === CREATE_STEP.code) {
      body = (
        <>
          <PageIntro icon={FiMessageCircle} title="Check your texts.">
            Enter the six-digit code to make it official.
          </PageIntro>
          <CodeBody
            e164={phone.e164}
            otp={phone.otp}
            onOtp={phone.onOtp}
            onResend={() => phone.send()}
            onChangeNumber={() => goBackTo(CREATE_STEP.phone)}
            busy={phone.busy}
          />
          {stepNumber === step ? <PhoneAlert error={phone.error} code={phone.errorCode} /> : null}
        </>
      );
      cta = (
        <VerifyButton
          busy={phone.busy || (saving ? 'verify' : null)}
          ready={phone.readyCode}
          onVerify={() => phone.verify()}
        />
      );
    }

    return (
      <>
        <div className="nav-row">
          <button
            type="button"
            className="icon-btn"
            aria-label="Back"
            onClick={() => onBack(stepNumber)}
          >
            <FiChevronLeft size={28} />
          </button>
          <h1 className="nav-title">{titleFor(stepNumber)}</h1>
          <Link href="/" className="nav-home wordmark" onClick={onHomeClick}>
            Friendly
          </Link>
        </div>
        <div className="scroll">
          <FlowProgress step={stepNumber} user={user} />
          {body}
          {error && stepNumber === step ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        {cta ? <div className="cta-bar">{cta}</div> : null}
      </>
    );
  };

  if (invalidRoute) return null;

  const paneClass = (stepNumber, active) => {
    const names = ['create-pane', 'form-fill'];
    if (stepNumber === 1) names.push('create-step-pick');
    if (!active) names.push('is-leaving', `slide-${motion}`);
    else if (hasMoved) names.push('is-entering', `slide-${motion}`);
    return names.join(' ');
  };

  return (
    <div className={exitHome ? 'phone create-flow is-exiting' : 'phone create-flow'}>
      <div className="create-viewport">
        {leaving != null && (
          <div
            key={`leave-${leaving}`}
            className={paneClass(leaving, false)}
            aria-hidden="true"
            inert
            data-step={leaving}
          >
            {renderStep(leaving)}
          </div>
        )}
        {exitHome ? (
          <div className="create-pane form-fill is-entering slide-back" data-step="home" inert>
            <AppHeader className="home-preview-header" />
            <Landing quiet />
          </div>
        ) : (
          <div key={step} className={paneClass(step, true)} data-step={step}>
            {renderStep(step)}
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateForm;
