import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VoteScreen from './VoteScreen';
import { navigation } from 'next/navigation';
import { useIdentity } from './identity';

jest.mock('next/navigation');
jest.mock('next/link');
jest.mock('../Config/firebase-config', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('./ResultsMenu', () => () => null);
jest.mock('./identity', () => ({
  useIdentity: jest.fn(),
  rememberName: jest.fn(),
  savedName: () => '',
}));
jest.mock('./notificationStore', () => ({ rememberBet: jest.fn() }));

// A small in-memory Firestore: docs by path, live listeners, transactions
// that commit all at once. `fake.voteRules` false is the live rules from
// before per-voter docs (every read and write of bets/{code}/votes denied).
jest.mock('firebase/firestore', () => {
  const fake = { docs: new Map(), listeners: new Set(), voteRules: true, clock: 1000, held: false, queue: [] };
  const denied = () => Object.assign(new Error('denied'), { code: 'permission-denied' });
  const isVotePath = (path) => /^bets\/[^/]+\/votes/.test(path);
  const docSnap = (path) => {
    const data = fake.docs.get(path);
    return {
      id: path.split('/').pop(),
      exists: () => data !== undefined,
      data: () => data,
      metadata: { fromCache: false },
    };
  };
  const querySnap = (path) => ({
    docs: [...fake.docs.keys()]
      .filter((key) => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1)
      .map((key) => ({ id: key.split('/').pop(), data: () => fake.docs.get(key) })),
    metadata: { fromCache: false },
  });
  const notify = () => fake.listeners.forEach((item) => {
    if (item.kind === 'doc') item.next(docSnap(item.path));
    else item.next(querySnap(item.path));
  });
  const stamp = (data) => {
    const out = { ...data };
    Object.keys(out).forEach((key) => {
      if (out[key] === 'SERVER_TIME') out[key] = { seconds: (fake.clock += 1), nanoseconds: 0 };
    });
    return out;
  };
  fake.notify = notify;
  return {
    __fake: fake,
    doc: (_db, ...path) => ({ kind: 'doc', path: path.join('/') }),
    collection: (_db, ...path) => ({ kind: 'query', path: path.join('/') }),
    query: (ref) => ref,
    where: () => null,
    serverTimestamp: () => 'SERVER_TIME',
    deleteField: () => 'DELETE_FIELD',
    onSnapshot: (ref, next, error) => {
      const item = { ...ref, next };
      if (isVotePath(ref.path) && !fake.voteRules) {
        Promise.resolve().then(() => error(denied()));
        return () => {};
      }
      fake.listeners.add(item);
      Promise.resolve().then(() => {
        if (fake.listeners.has(item)) item.next(item.kind === 'doc' ? docSnap(item.path) : querySnap(item.path));
      });
      return () => fake.listeners.delete(item);
    },
    getDocs: async (ref) => {
      if (isVotePath(ref.path) && !fake.voteRules) throw denied();
      return querySnap(ref.path);
    },
    getDoc: async (ref) => docSnap(ref.path),
    runTransaction: async (_db, fn) => {
      const writes = [];
      const tx = {
        get: async (ref) => {
          if (isVotePath(ref.path) && !fake.voteRules) throw denied();
          return docSnap(ref.path);
        },
        set: (ref, data) => writes.push([ref.path, data, false]),
        update: (ref, data) => writes.push([ref.path, data, true]),
      };
      const result = await fn(tx);
      if (writes.some(([path]) => isVotePath(path)) && !fake.voteRules) throw denied();
      writes.forEach(([path, data, merge]) => {
        fake.docs.set(path, stamp(merge ? { ...fake.docs.get(path), ...data } : data));
      });
      // Server snapshots land a moment after the commit answers, or wait
      // in `queue` while `held` (a slow listener).
      if (fake.held) fake.queue.push(notify);
      else setTimeout(notify, 0);
      return result;
    },
  };
});

const { __fake: fake } = jest.requireMock('firebase/firestore');

const openBet = {
  code: 'abc123',
  schemaVersion: 2,
  type: 'money-line',
  typeLabel: 'Money Line',
  question: 'Who is late',
  createdByName: 'Maya',
  createdByID: 'creator-1',
  status: 'open',
  stake: 'a coffee',
  options: [
    { id: 'a', label: 'Yes' },
    { id: 'b', label: 'No' },
  ],
  votes: [],
};

beforeEach(() => {
  fake.held = false;
  fake.queue = [];
  fake.docs.clear();
  fake.listeners.clear();
  fake.docs.set('bets/abc123', { ...openBet });
  useIdentity.mockReturnValue({ uid: 'anon-2', isAnonymous: true });
  navigation.pathname = '/b/abc123';
  navigation.params = { code: 'abc123' };
});

const release = async () => {
  fake.held = false;
  await act(async () => {
    fake.queue.splice(0).forEach((notify) => notify());
  });
};

describe.each([
  ['with per-voter vote docs', true],
  ['on rules from before per-voter docs (legacy array)', false],
])('a friend\'s pick shows live %s', (_label, voteRules) => {
  test('the tally counts it and Add your name shows, no reload', async () => {
    fake.voteRules = voteRules;
    render(<VoteScreen />);
    expect(await screen.findByText('0 picks')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(await screen.findByText('1 pick')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Add your name' })).toBeInTheDocument();
    // Still there once every snapshot has settled.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(screen.getByText('1 pick')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add your name' })).toBeInTheDocument();
  });

  test('a saved pick counts and offers Add your name before the snapshot lands', async () => {
    fake.voteRules = voteRules;
    render(<VoteScreen />);
    expect(await screen.findByText('0 picks')).toBeInTheDocument();
    fake.held = true;
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    // The pick is saved; the listener hasn't answered yet.
    expect(fake.queue.length).toBeGreaterThan(0);
    expect(screen.getByText('1 pick')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add your name' })).toBeInTheDocument();
    await release();
    expect(screen.getByText('1 pick')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add your name' })).toBeInTheDocument();
  });

  test('the name saves on a pick the snapshot hasn\'t shown yet', async () => {
    fake.voteRules = voteRules;
    render(<VoteScreen />);
    await screen.findByText('0 picks');
    fake.held = true;
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add your name' }));
    await userEvent.type(screen.getByLabelText('Your name'), 'Sam');
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await release();
    expect(await screen.findByRole('button', { name: 'Edit your name, currently Sam' })).toBeInTheDocument();
    expect(screen.getByText('1 pick')).toBeInTheDocument();
  });
});
