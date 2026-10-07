'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from '../platform/Link';
import { useParams, useRouter } from '../platform/navigation';
import {
  FiCheckCircle,
  FiChevronLeft,
  FiFlag,
  FiMessageCircle,
  FiShield,
  FiX,
} from 'react-icons/fi';
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
  sending: 'Getting it ready\u2026',
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
        <span className="chip">{fields.typeLabel}</span>
        <p className="recap-question">{fields.question}</p>
        {choices.length > 0 && (
          <div className="recap-choices">
            {choices.map((choice, index) => (
              <span key={index}>{choice}</span>
            ))}
          </div>
        )}
        {fields.stake ? <p className="stake-line">{fields.stake}</p> : null}
        {fields.closesAt ? <p className="closes">Closes {formatCloses(fields.closesAt)}</p> : null}
      </div>
    </>
  );
}

const CreateForm = () => {
  const params = useParams();
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

  useEffect(() => {
    const titles = {
      1: COPY.newBet,
      2: meta?.label || COPY.newBet,
      3: COPY.stake,
      4: AUTH_COPY.phoneTitle,
      5: AUTH_COPY.codeTitle,
      6: COPY.textFriendsTitle,
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

  useEffect(() => {
    if (!phone.verifiedUser || advancedAuth.current) return;
    advancedAuth.current = true;
    setLinkedUser(phone.verifiedUser);
    setMotion('forward');
    setLeaving(stepRef.current);
    setHasMoved(true);
    setError('');
    setStep(CREATE_STEP.share);
  }, [phone.verifiedUser]);

  const go = (next) => {
    if (exitHome || next == null || next === step || next < 1 || next > CREATE_STEP.share) return;
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
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
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

  const onTextFriends = async () => {
    const ready = buildDraft(type, input);
    if (!ready.ok) {
      setError(ready.error);
      return;
    }
    if (!isCreator(user)) {
      go(CREATE_STEP.phone);
      return;
    }

    const fields = {
      ...ready.fields,
      createdByID: user.uid,
      createdByName: creatorName(user),
    };
    if (user.email) fields.createdByEmail = user.email;

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
    if (stepNumber === CREATE_STEP.details) return meta?.label || COPY.newBet;
    if (stepNumber === CREATE_STEP.stake) return COPY.stake;
    if (stepNumber === CREATE_STEP.phone) return AUTH_COPY.phoneTitle;
    if (stepNumber === CREATE_STEP.code) return AUTH_COPY.codeTitle;
    if (stepNumber === CREATE_STEP.share) return COPY.textFriendsTitle;
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
          onClick={() => {
            if (!user) {
              setError('Still connecting. Try again in a second.');
              return;
            }
            go(adjacentCreateStep(CREATE_STEP.stake, user, 1));
          }}
        >
          {COPY.next}
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
            onChangeNumber={() => go(CREATE_STEP.phone)}
            busy={phone.busy}
            check={stepNumber === step ? <PersonCheck containerRef={phone.containerRef} /> : null}
          />
          {stepNumber === step ? <PhoneAlert error={phone.error} code={phone.errorCode} /> : null}
        </>
      );
      cta = (
        <VerifyButton busy={phone.busy} ready={phone.readyCode} onVerify={() => phone.verify()} />
      );
    }

    if (stepNumber === CREATE_STEP.share) {
      body = (
        <>
          <PageIntro
            icon={FiCheckCircle}
            title={code ? 'The bet is on.' : 'Put the group chat on the line.'}
          >
            {code
              ? 'Your bet is saved. Share it again or follow the picks as they come in.'
              : 'Looking good. Text your friends and see who’s in.'}
          </PageIntro>
          {draft.ok && <Recap fields={draft.fields} />}
          {code && (
            <Link className="secondary press recap-tally" href={`/t/${code}`}>
              View live tally
            </Link>
          )}
          {message && shareState === 'manual' && <p className="manual-message">{message}</p>}
        </>
      );
      cta = (
        <>
          {code && (
            <Link className="vote-link" href={`/b/${code}`}>
              {voteUrl(code)}
            </Link>
          )}
          {shareState && <p className="share-note">{SHARE_NOTE[shareState]}</p>}
          <button className="cta press" type="button" disabled={saving} onClick={onTextFriends}>
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
          <div className="create-pane form-fill is-entering slide-back" data-step="home">
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
