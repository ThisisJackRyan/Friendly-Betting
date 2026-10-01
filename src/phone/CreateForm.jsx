'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FiChevronLeft, FiX } from 'react-icons/fi';
import { saveBet } from './api';
import { isCreator } from './creator';
import { useCreateChrome } from './createChrome';
import { armHomeArrival, prefersReducedMotion, SLIDE_MS } from './createMotion';
import { creatorName, useIdentity } from './identity';
import PhoneGate from './PhoneGate';
import {
  buildDraft,
  choiceLabels,
  formatCloses,
  formatSms,
  friendlyError,
  parseCloses,
  TYPE_META,
} from './model';
import { voteUrl } from './routes';
import { shareMessage } from './share';
import CreatePick from './CreatePick';
import Landing from './Landing';

const SHARE_NOTE = {
  shared: 'Pick who gets it.',
  sms: 'Opening Messages.',
  copied: 'Copied \u2014 paste into a text.',
  aborted: 'Saved. Text when you\u2019re ready.',
  manual: 'Copy the message below.',
};

const COPY = {
  newBet: 'New bet',
  stake: 'Stake',
  textFriendsTitle: 'Text friends',
  stakeHint: 'Skip if it\u2019s just bragging rights.',
  stakePlaceholder: 'Pizza, $5, bragging rights',
  questionPlaceholder: 'Who shows up last?',
  linePlaceholder: '13.5',
  propMaya: 'Maya',
  propSam: 'Sam',
  next: 'Next',
  textFriends: 'Text friends',
  sending: 'Sending\u2026',
};

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

function Recap({ fields }) {
  const choices = choiceLabels(fields);
  return (
    <>
      <p className="recap-eyebrow">Ready to text</p>
      <div className="recap-card">
        <p className="recap-question">{fields.question}</p>
        {choices.length > 0 && (
          <p className="recap-choices">{choices.join(' / ')}</p>
        )}
        {fields.stake ? <p className="stake-line">{fields.stake}</p> : null}
        {fields.closesAt ? (
          <p className="closes">Closes {formatCloses(fields.closesAt)}</p>
        ) : null}
      </div>
    </>
  );
}

const CreateForm = () => {
  const params = useParams();
  const router = useRouter();
  const user = useIdentity();
  const { setHidePhoneTabs, setPinPhoneTabs } = useCreateChrome();
  const rawType = params?.type;
  const routeType = TYPE_META[rawType] ? rawType : null;
  const invalidRoute = Boolean(rawType) && !routeType;

  const [step, setStep] = useState(routeType ? 2 : 1);
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
  const [code, setCode] = useState(null);
  const [message, setMessage] = useState('');
  const [shareState, setShareState] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [phoneUser, setPhoneUser] = useState(null);

  const meta = TYPE_META[type] || null;
  const session = phoneUser || user;
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

  useEffect(() => {
    if (step === 4) return undefined;
    const titles = {
      1: COPY.newBet,
      2: meta?.label || COPY.newBet,
      3: COPY.stake,
      5: COPY.textFriendsTitle,
    };
    document.title = `${titles[step] || COPY.newBet} · Friendly`;
    return undefined;
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

  const go = (next) => {
    if (exitHome || next === step || next < 1 || next > 5) return;
    setMotion(next > step ? 'forward' : 'back');
    setLeaving(step);
    setHasMoved(true);
    setError('');
    setStep(next);
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
    if (
      event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    goHome();
  };

  const pickType = (id) => {
    if (exitHome) return;
    setType(id);
    setMotion('forward');
    setLeaving(step);
    setHasMoved(true);
    setError('');
    setStep(2);
  };

  const onBack = (stepNumber) => {
    if (exitHome) return;
    if (stepNumber <= 1) {
      goHome();
      return;
    }
    if (stepNumber === 5) {
      go(3);
      return;
    }
    go(stepNumber - 1);
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
    setPropOptions((current) => (
      current.length <= 2 ? current : current.filter((_, i) => i !== index)
    ));
  };

  const onDetailsNext = () => {
    if (!draft.ok) {
      setError(draft.error);
      return;
    }
    go(3);
  };

  const onStakeNext = () => {
    if (!session) {
      setError('Still connecting. Try again in a second.');
      return;
    }
    if (isCreator(session)) go(5);
    else go(4);
  };

  const onTextFriends = async () => {
    const ready = buildDraft(type, input);
    if (!ready.ok) {
      setError(ready.error);
      return;
    }
    if (!session) {
      setError('Still connecting. Try again in a second.');
      return;
    }
    if (!isCreator(session)) {
      setError('Verify your phone to text this bet.');
      go(4);
      return;
    }

    const fields = {
      ...ready.fields,
      createdByID: session.uid,
      createdByName: creatorName(session),
    };
    if (session.email) fields.createdByEmail = session.email;

    setSaving(true);
    setError('');
    try {
      const id = await saveBet(code, fields);
      const text = formatSms({
        question: fields.question,
        choices: choiceLabels(fields),
        stake: fields.stake,
        url: voteUrl(id),
      });
      setCode(id);
      setMessage(text);
      const result = await shareMessage(text);
      setShareState(result);
    } catch (err) {
      setError(friendlyError(err, 'Could not save this bet.'));
    } finally {
      setSaving(false);
    }
  };

  const titleFor = (stepNumber) => {
    if (stepNumber === 2) return meta?.label || COPY.newBet;
    if (stepNumber === 3) return COPY.stake;
    if (stepNumber === 5) return COPY.textFriendsTitle;
    return COPY.newBet;
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
          error={error && stepNumber === step ? error : ''}
        />
      );
    }

    if (stepNumber === 2 && meta) {
      body = (
        <>
          <label className="field" htmlFor="question">
            <span className="field-label">Question <span className="req">*</span></span>
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
                <span className="field-label">Line <span className="req">*</span></span>
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
      body = (
        <>
          <p className="field-hint">{COPY.stakeHint}</p>
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
              <span className="field-label">Closes <span className="optional">optional</span></span>
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
        <button type="button" className="cta press" onClick={onStakeNext}>
          {COPY.next}
        </button>
      );
    }

    if (stepNumber === 4) {
      return (
        <PhoneGate
          onBack={() => onBack(4)}
          onHomeClick={onHomeClick}
          onVerified={(next) => {
            if (next) setPhoneUser(next);
            go(5);
          }}
        />
      );
    }

    if (stepNumber === 5) {
      body = (
        <>
          {draft.ok && <Recap fields={draft.fields} />}
          {message && shareState === 'manual' && (
            <p className="manual-message">{message}</p>
          )}
        </>
      );
      cta = (
        <>
          {code && (
            <Link className="vote-link" href={`/b/${code}`}>{voteUrl(code)}</Link>
          )}
          {shareState && <p className="share-note">{SHARE_NOTE[shareState]}</p>}
          <button
            className="cta press"
            type="button"
            disabled={saving}
            onClick={onTextFriends}
          >
            {saving ? COPY.sending : COPY.textFriends}
          </button>
        </>
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
          {body}
          {error && stepNumber === step ? (
            <p className="form-error" role="alert">{error}</p>
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
          <div className="create-pane form-fill is-entering slide-back" data-step="home">
            <Landing quiet />
          </div>
        ) : (
          <div
            key={step}
            className={paneClass(step, true)}
            data-step={step}
          >
            {renderStep(step)}
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateForm;
