import { canRunItBack, rematchFields, saveRematch } from './rematch';
import { buildDraft, DEFAULT_CLOSES, parseCloses } from './model';
import { buildSettlement } from './settlement';

jest.mock('../Config/firebase-config', () => ({ auth: {}, db: {} }));

const creator = { uid: 'creator-1', displayName: 'Maya', providerData: [{ providerId: 'phone' }] };
const voter = { uid: 'anon-1', isAnonymous: true, providerData: [{ providerId: 'anonymous' }] };
const otherPhone = { uid: 'creator-9', providerData: [{ providerId: 'phone' }] };

const open = {
  id: 'old123',
  code: 'old123',
  schemaVersion: 2,
  type: 'over-under',
  typeLabel: 'Over-Under',
  question: 'Points tonight',
  stake: ' Pizza ',
  line: 21.5,
  closesAt: 1700000000000,
  createdAt: 1600000000000,
  createdByID: 'creator-1',
  createdByName: 'Maya',
  status: 'open',
  winnerId: null,
  options: [
    { id: 'over', label: 'Over', extra: 'nope' },
    { id: 'under', label: 'Under' },
  ],
  votes: [
    { voterId: 'anon-1', name: 'Sam', optionId: 'over' },
    { voterId: 'creator-1', name: 'Maya', optionId: 'under' },
  ],
};

const settled = {
  ...open,
  status: 'closed',
  winnerId: 'over',
  settledAt: 1700000001000,
  settlement: buildSettlement(open, 'over'),
  resultTexts: { sent: true },
  resultText: 'Sam won',
};

beforeEach(() => {
  localStorage.clear();
});

describe('canRunItBack', () => {
  test('the creator of a bet settled with a winner gets it', () => {
    expect(canRunItBack(creator, settled)).toBe(true);
  });

  test('never on a called-off bet, either marker', () => {
    expect(canRunItBack(creator, { ...settled, calledOff: true })).toBe(false);
    expect(canRunItBack(creator, { ...settled, status: 'called-off' })).toBe(false);
  });

  test('never on an open bet or one closed with no winner yet', () => {
    expect(canRunItBack(creator, open)).toBe(false);
    expect(canRunItBack(creator, { ...open, status: 'closed', winnerId: null })).toBe(false);
  });

  test('never for a voter, another phone user, or nobody', () => {
    expect(canRunItBack(voter, settled)).toBe(false);
    expect(canRunItBack(otherPhone, settled)).toBe(false);
    expect(canRunItBack(null, settled)).toBe(false);
    expect(canRunItBack({ ...creator, providerData: [] }, settled)).toBe(false);
  });

  test('never when there is nothing to copy', () => {
    expect(canRunItBack(creator, { ...settled, question: '' })).toBe(false);
    expect(canRunItBack(creator, { ...settled, options: [{ id: 'over', label: 'Over' }] })).toBe(false);
    expect(canRunItBack(creator, undefined)).toBe(false);
  });
});

describe('rematchFields', () => {
  test('copies the bet, not its result', () => {
    expect(rematchFields(settled, creator, 'old123')).toEqual({
      schemaVersion: 2,
      type: 'over-under',
      typeLabel: 'Over-Under',
      question: 'Points tonight',
      stake: 'Pizza',
      closesAt: null,
      options: [
        { id: 'over', label: 'Over' },
        { id: 'under', label: 'Under' },
      ],
      line: 21.5,
      rematchOf: { code: 'old123' },
      createdByID: 'creator-1',
      createdByName: 'Maya',
    });
  });

  test('gives fresh option objects', () => {
    const fields = rematchFields(settled, creator, 'old123');
    fields.options.forEach((option, index) => expect(option).not.toBe(settled.options[index]));
  });

  test('closes when a new bet from Create closes', () => {
    const fields = rematchFields(settled, creator, 'old123');
    const fromCreate = buildDraft('over-under', { question: 'q', line: '1', closesAt: parseCloses(DEFAULT_CLOSES) });
    expect(fields.closesAt).toBe(fromCreate.fields.closesAt);
  });

  test('sets the creator the way Create does', () => {
    localStorage.setItem('fb.displayName', 'Jay');
    const fields = rematchFields(settled, { ...creator, email: 'maya@example.com' }, 'old123');
    expect(fields.createdByName).toBe('Jay');
    expect(fields.createdByEmail).toBe('maya@example.com');
    expect(rematchFields(settled, creator, 'old123')).not.toHaveProperty('createdByEmail');
  });

  test('a money line keeps its sides and no line; the code falls back to the route', () => {
    const moneyLine = {
      ...settled,
      code: undefined,
      type: 'money-line',
      typeLabel: 'Money Line',
      line: undefined,
      options: [{ id: 'a', label: 'Bulls' }, { id: 'b', label: 'Knicks' }],
    };
    const fields = rematchFields(moneyLine, creator, 'route1');
    expect(fields.line).toBeNull();
    expect(fields.options).toEqual([{ id: 'a', label: 'Bulls' }, { id: 'b', label: 'Knicks' }]);
    expect(fields.rematchOf).toEqual({ code: 'route1' });
  });
});

describe('saveRematch', () => {
  test('saves with the rematch link on the first try', async () => {
    const saveBet = jest.fn().mockResolvedValue('new456');
    await expect(saveRematch(saveBet, settled, creator, 'old123')).resolves.toBe('new456');
    expect(saveBet).toHaveBeenCalledTimes(1);
    expect(saveBet).toHaveBeenCalledWith(null, rematchFields(settled, creator, 'old123'));
    expect(saveBet.mock.calls[0][1]).toHaveProperty('rematchOf', { code: 'old123' });
  });

  test.each(['permission-denied', 'firestore/permission-denied'])(
    'a %s save is tried once more without the link',
    async (code) => {
      const saveBet = jest.fn()
        .mockRejectedValueOnce({ code })
        .mockResolvedValueOnce('new789');
      await expect(saveRematch(saveBet, settled, creator, 'old123')).resolves.toBe('new789');
      expect(saveBet).toHaveBeenCalledTimes(2);
      const { rematchOf, ...withoutLink } = rematchFields(settled, creator, 'old123');
      expect(saveBet.mock.calls[1][0]).toBeNull();
      expect(saveBet.mock.calls[1][1]).toEqual(withoutLink);
      expect(saveBet.mock.calls[1][1]).not.toHaveProperty('rematchOf');
    },
  );

  test('any other error is thrown without a retry', async () => {
    const error = { code: 'unavailable' };
    const saveBet = jest.fn().mockRejectedValue(error);
    await expect(saveRematch(saveBet, settled, creator, 'old123')).rejects.toBe(error);
    expect(saveBet).toHaveBeenCalledTimes(1);
  });

  test('a denied retry is thrown, and there is no third try', async () => {
    const first = { code: 'permission-denied' };
    const second = { code: 'permission-denied' };
    const saveBet = jest.fn().mockRejectedValueOnce(first).mockRejectedValueOnce(second);
    await expect(saveRematch(saveBet, settled, creator, 'old123')).rejects.toBe(second);
    expect(saveBet).toHaveBeenCalledTimes(2);
  });
});
