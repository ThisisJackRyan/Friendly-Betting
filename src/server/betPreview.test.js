import { adminDb } from './firebaseAdmin';
import { generateMetadata } from '../../app/b/[code]/page';

jest.mock('./firebaseAdmin', () => ({ adminDb: jest.fn() }));
jest.mock('../phone/VoteScreen', () => () => null);

const fallback = 'Friendly Bets';
const description = 'Pick your side on Friendly Bets.';

function mockBetDoc(data) {
  const get = jest.fn().mockResolvedValue({ exists: data != null, data: () => data });
  const doc = jest.fn(() => ({ get }));
  const collection = jest.fn(() => ({ doc }));
  adminDb.mockReturnValue({ collection });
  return { collection, doc, get };
}

const metadataFor = (code) => generateMetadata({ params: Promise.resolve({ code }) });

beforeEach(() => {
  adminDb.mockReset();
});

test('the preview title is the bet question alone, with a generic description', async () => {
  const { collection, doc } = mockBetDoc({
    question: '  Who is\n late  ', stake: '$20', createdByName: 'Jack', sides: ['Me', 'You'],
  });
  const meta = await metadataFor('abc123');
  expect(collection).toHaveBeenCalledWith('bets');
  expect(doc).toHaveBeenCalledWith('abc123');
  expect(meta.title).toBe('Who is late');
  expect(meta.openGraph.title).toBe('Who is late');
  expect(meta.twitter.title).toBe('Who is late');
  expect(meta.openGraph.description).toBe(description);
  expect(meta.twitter.card).toBe('summary_large_image');
  expect(meta.metadataBase.origin).toBe('https://www.friendly-bets.com');
  const text = JSON.stringify(meta);
  ['$20', 'Jack', '"Me"', '"You"'].forEach((part) => expect(text).not.toContain(part));
});

test('a legacy bet field still gives the question', async () => {
  mockBetDoc({ bet: 'Chiefs cover -3?' });
  expect((await metadataFor('old1')).title).toBe('Chiefs cover -3?');
});

test.each([
  ['a missing bet', () => mockBetDoc(null)],
  ['a bet with no question', () => mockBetDoc({ stake: '$5' })],
  ['admin not configured', () => adminDb.mockImplementation(() => {
    throw Object.assign(new Error('FIREBASE_SERVICE_ACCOUNT is not set.'), { code: 'admin-not-configured' });
  })],
  ['a failed read', () => {
    const get = jest.fn().mockRejectedValue(new Error('unavailable'));
    adminDb.mockReturnValue({ collection: () => ({ doc: () => ({ get }) }) });
  }],
])('%s falls back to the generic preview', async (_case, setup) => {
  setup();
  const meta = await metadataFor('abc123');
  expect(meta.title).toBe(fallback);
  expect(meta.openGraph.title).toBe(fallback);
  expect(meta.twitter.title).toBe(fallback);
  expect(meta.openGraph.description).toBe(description);
});

test.each(['', 'a/b', '../x', 'x'.repeat(65), 'abc 123'])('a bad code %p never reads Firestore', async (code) => {
  mockBetDoc({ question: 'Should not show' });
  const meta = await metadataFor(code);
  expect(adminDb).not.toHaveBeenCalled();
  expect(meta.title).toBe(fallback);
});

test('preview URLs resolve against the deployment on preview deploys and prod otherwise', () => {
  const { previewOrigin } = require('./betPreview');
  const prod = 'https://www.friendly-bets.com';
  expect(previewOrigin({})).toBe(prod);
  expect(previewOrigin({ VERCEL_ENV: 'production', VERCEL_URL: 'fb-abc.vercel.app' })).toBe(prod);
  expect(previewOrigin({ VERCEL_ENV: 'preview', VERCEL_URL: 'fb-abc.vercel.app' })).toBe('https://fb-abc.vercel.app');
  expect(previewOrigin({ VERCEL_ENV: 'preview' })).toBe(prod);
});
