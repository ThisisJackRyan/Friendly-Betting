export const TYPE_META = {
  'money-line': {
    label: 'Money Line',
    hint: 'Two sides',
  },
  'over-under': {
    label: 'Over-Under',
    hint: 'A number line',
  },
  prop: {
    label: 'Prop',
    hint: '2–4 options',
  },
};

export const TYPE_ORDER = ['money-line', 'over-under', 'prop'];

export function buildDraft(type, input) {
  const meta = TYPE_META[type];
  if (!meta) return { ok: false, error: 'Pick a bet type.' };

  const question = (input.question || '').trim();
  if (!question) return { ok: false, error: 'Add a question.' };

  let options = [];
  let line = null;

  if (type === 'money-line') {
    options = [
      { id: 'a', label: (input.optionA || '').trim() || 'Yes' },
      { id: 'b', label: (input.optionB || '').trim() || 'No' },
    ];
  } else if (type === 'over-under') {
    const raw = String(input.line ?? '').trim();
    const lineNumber = Number(raw);
    if (raw === '' || Number.isNaN(lineNumber)) {
      return { ok: false, error: 'Add a line.' };
    }
    options = [
      { id: 'over', label: (input.overLabel || '').trim() || 'Over' },
      { id: 'under', label: (input.underLabel || '').trim() || 'Under' },
    ];
    line = lineNumber;
  } else {
    const labels = (input.propOptions || [])
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (labels.length < 2) return { ok: false, error: 'Add at least two options.' };
    if (labels.length > 4) return { ok: false, error: 'Props can have up to four options.' };
    options = labels.map((label, index) => ({ id: `p${index}`, label }));
  }

  return {
    ok: true,
    fields: {
      schemaVersion: 2,
      type,
      typeLabel: meta.label,
      question,
      stake: (input.stake || '').trim(),
      closesAt: input.closesAt || null,
      options,
      line,
    },
  };
}

export function questionOf(bet) {
  return (bet?.question || bet?.bet || '').trim();
}

export function typeLabelOf(bet) {
  if (!bet) return '';
  if (bet.typeLabel) return bet.typeLabel;
  if (bet.type === 'Over Under') return 'Over-Under';
  if (bet.type && TYPE_META[bet.type]) return TYPE_META[bet.type].label;
  return bet.type || 'Bet';
}

export function optionVoteLabel(bet, option) {
  if (!option) return '';
  const isLine = bet?.type === 'over-under' || bet?.type === 'Over Under';
  if (isLine && bet.line !== null && bet.line !== undefined && bet.line !== '') {
    return `${option.label} ${bet.line}`;
  }
  return option.label;
}

export function choiceLabels(bet) {
  return (bet?.options || []).map((option) => optionVoteLabel(bet, option));
}

export function formatSms({ question, choices, stake, url }) {
  const q = String(question || '').trim().replace(/\?+$/, '');
  const choiceLines = (choices || [])
    .filter(Boolean)
    .map((label, index) => `${index + 1}. ${label}`);
  const stakeText = String(stake || '').trim();
  const lines = [`${q}?`, ...choiceLines];
  if (stakeText) lines.push(stakeText);
  lines.push(`Vote here: ${url}`);
  return lines.join('\n');
}

export function parseCloses(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return time;
}

export function formatCloses(ts) {
  if (!ts) return '';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ts));
}

export function votingOpen(bet, now = Date.now()) {
  if (!bet) return false;
  if (bet.status === 'closed') return false;
  if (bet.closesAt && bet.closesAt <= now) return false;
  return true;
}

export function statusLabel(bet, now = Date.now()) {
  if (!bet) return '';
  if (bet.status === 'closed' && bet.winnerId) return 'Settled';
  if (bet.status === 'closed' || (bet.closesAt && bet.closesAt <= now)) return 'Closed';
  return 'Open';
}

export function voteFor(bet, voterId) {
  if (!bet || !voterId || !Array.isArray(bet.votes)) return null;
  return bet.votes.find((vote) => vote.voterId === voterId) || null;
}

export function tallyCounts(bet) {
  const options = bet?.options || [];
  const votes = Array.isArray(bet?.votes) ? bet.votes : [];
  const usingVotes = bet?.schemaVersion === 2 || votes.length > 0;
  return options.map((option) => {
    let count = 0;
    if (usingVotes) {
      count = votes.filter((vote) => vote.optionId === option.id).length;
    } else if (option.id === 'over') {
      count = Number(bet.over) || 0;
    } else if (option.id === 'under') {
      count = Number(bet.under) || 0;
    }
    return { ...option, count };
  });
}

export function winnerLabel(bet) {
  if (!bet?.winnerId) return '';
  const match = (bet.options || []).find((option) => option.id === bet.winnerId);
  return match ? optionVoteLabel(bet, match) : '';
}

export function friendlyError(err, fallback) {
  if (err?.code === 'permission-denied') {
    return 'Saving was blocked. Try again in a moment.';
  }
  return err?.message || fallback;
}
