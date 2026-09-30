import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { FiChevronLeft, FiX } from 'react-icons/fi';
import { saveBet } from './api';
import { creatorName, useIdentity } from './identity';
import {
  buildDraft,
  choiceLabels,
  formatSms,
  friendlyError,
  parseCloses,
  TYPE_META,
} from './model';
import { voteUrl } from './routes';
import { shareMessage } from './share';

const SHARE_NOTE = {
  shared: 'Share sheet opened.',
  sms: 'Opening Messages.',
  copied: 'Message copied. Paste it into a text.',
  aborted: 'Saved. Text friends when you are ready.',
  manual: 'Copy the message below.',
};

const CreateForm = () => {
  const { type } = useParams();
  const navigate = useNavigate();
  const user = useIdentity();
  const meta = TYPE_META[type];

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

  useEffect(() => {
    if (meta) document.title = `${meta.label} · Friendly`;
  }, [meta]);

  if (!meta) return <Navigate to="/" replace />;

  const updateProp = (index, value) => {
    setPropOptions((current) => current.map((item, i) => (i === index ? value : item)));
  };

  const addProp = () => {
    setPropOptions((current) => (current.length >= 4 ? current : [...current, '']));
  };

  const removeProp = (index) => {
    setPropOptions((current) => (
      current.length <= 2 ? current : current.filter((_, i) => i !== index)
    ));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    const draft = buildDraft(type, {
      question,
      stake,
      closesAt: parseCloses(closes),
      optionA,
      optionB,
      line,
      overLabel,
      underLabel,
      propOptions,
    });
    if (!draft.ok) {
      setError(draft.error);
      return;
    }
    if (!user) {
      setError('Still connecting. Try again in a second.');
      return;
    }

    const fields = {
      ...draft.fields,
      createdByID: user.uid,
      createdByName: creatorName(user),
    };
    if (user.email) fields.createdByEmail = user.email;

    setSaving(true);
    setError('');
    try {
      const id = await saveBet(code, fields);
      const text = formatSms({
        name: fields.createdByName,
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

  return (
    <div className="phone">
      <form className="form-fill" onSubmit={onSubmit}>
        <div className="screen-push form-fill">
          <div className="nav-row">
            <button type="button" className="icon-btn" aria-label="Back" onClick={() => navigate('/')}>
              <FiChevronLeft size={28} />
            </button>
            <h1 className="nav-title">{meta.label}</h1>
          </div>
          <div className="scroll">
            <label className="field" htmlFor="question">
              <span className="field-label">Question <span className="req">*</span></span>
              <textarea
                id="question"
                rows={3}
                aria-required="true"
                value={question}
                placeholder="Who shows up last?"
                onChange={(event) => setQuestion(event.target.value)}
              />
            </label>

            {type === 'money-line' && (
              <>
                <label className="field" htmlFor="option-a">
                  <span className="field-label">Option A</span>
                  <input
                    id="option-a"
                    value={optionA}
                    onChange={(event) => setOptionA(event.target.value)}
                  />
                </label>
                <label className="field" htmlFor="option-b">
                  <span className="field-label">Option B</span>
                  <input
                    id="option-b"
                    value={optionB}
                    onChange={(event) => setOptionB(event.target.value)}
                  />
                </label>
              </>
            )}

            {type === 'over-under' && (
              <>
                <label className="field" htmlFor="line">
                  <span className="field-label">Line</span>
                  <input
                    id="line"
                    inputMode="decimal"
                    value={line}
                    placeholder="13.5"
                    onChange={(event) => setLine(event.target.value)}
                  />
                </label>
                <label className="field" htmlFor="over-label">
                  <span className="field-label">Over</span>
                  <input
                    id="over-label"
                    value={overLabel}
                    onChange={(event) => setOverLabel(event.target.value)}
                  />
                </label>
                <label className="field" htmlFor="under-label">
                  <span className="field-label">Under</span>
                  <input
                    id="under-label"
                    value={underLabel}
                    onChange={(event) => setUnderLabel(event.target.value)}
                  />
                </label>
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
                        placeholder={index === 0 ? 'Maya' : 'Sam'}
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

            <label className="field" htmlFor="stake">
              <span className="field-label">Stake <span className="optional">optional</span></span>
              <input
                id="stake"
                value={stake}
                placeholder="Pizza, $5, bragging rights"
                onChange={(event) => setStake(event.target.value)}
              />
            </label>

            <label className="field" htmlFor="closes">
              <span className="field-label">Closes</span>
              <input
                id="closes"
                type="datetime-local"
                value={closes}
                onChange={(event) => setCloses(event.target.value)}
              />
            </label>

            {message && shareState === 'manual' && (
              <p className="manual-message">{message}</p>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
        </div>
        <div className="cta-bar">
          {code && (
            <Link className="vote-link" to={`/b/${code}`}>{voteUrl(code)}</Link>
          )}
          {shareState && <p className="share-note">{SHARE_NOTE[shareState]}</p>}
          <button className="cta press" type="submit" disabled={saving}>
            {saving ? 'Sending…' : 'Text friends'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateForm;
