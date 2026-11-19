import { getDocs, limit, where } from 'firebase/firestore';
import { isOnlyBetBy } from './firstBet';

jest.mock('firebase/firestore', () => ({
  collection: (_db, path) => ({ path }),
  query: (ref, ...parts) => ({ ref, parts }),
  where: jest.fn((...args) => ({ where: args })),
  limit: jest.fn((n) => ({ limit: n })),
  getDocs: jest.fn(),
}));
jest.mock('../Config/firebase-config', () => ({ db: {} }));

const docs = (...ids) => ({ docs: ids.map((id) => ({ id })) });

beforeEach(() => jest.clearAllMocks());

test('asks for at most two of this creator’s bets', async () => {
  getDocs.mockResolvedValueOnce(docs('abc123'));
  await isOnlyBetBy('creator', 'abc123');
  expect(where).toHaveBeenCalledWith('createdByID', '==', 'creator');
  expect(limit).toHaveBeenCalledWith(2);
});

test('true only when the creator’s bets are just the one sent', async () => {
  getDocs.mockResolvedValueOnce(docs('abc123'));
  await expect(isOnlyBetBy('creator', 'abc123')).resolves.toBe(true);
  getDocs.mockResolvedValueOnce(docs('abc123', 'old111'));
  await expect(isOnlyBetBy('creator', 'abc123')).resolves.toBe(false);
  getDocs.mockResolvedValueOnce(docs('old111'));
  await expect(isOnlyBetBy('creator', 'abc123')).resolves.toBe(false);
  getDocs.mockResolvedValueOnce(docs());
  await expect(isOnlyBetBy('creator', 'abc123')).resolves.toBe(false);
});

test('a failed read rejects, so the caller fails closed', async () => {
  getDocs.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
  await expect(isOnlyBetBy('creator', 'abc123')).rejects.toThrow();
});
