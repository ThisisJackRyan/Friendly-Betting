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

describe('closed bets', () => {
  const OPTIONS = [{ id: 'a', label: 'Sam  (obviously)' }, { id: 'b', label: 'No' }];
  const base = { question: 'Will Sam finish?', stake: '$20', options: OPTIONS };
  const settledBet = { ...base, status: 'closed', winnerId: 'a', settlement: { version: 1, optionLabel: 'Sam (obviously)' } };
  const image = (s) => ({
    url: `/b/abc123/opengraph-image?s=${s}`, width: 1200, height: 630, type: 'image/png', alt: 'Friendly Bets',
  });
  const tallyMetadataFor = (code) => require('../../app/(chrome)/t/[code]/page').generateMetadata({ params: Promise.resolve({ code }) });

  test.each([
    ['settled', settledBet, 'settled', 'Sam (obviously) won. Will Sam finish?', 'See who called it on Friendly Bets.'],
    ['legacy settled (no snapshot)', { ...base, status: 'closed', winnerId: 'a' }, 'settled', 'Sam (obviously) won. Will Sam finish?', 'See who called it on Friendly Bets.'],
    ['called off', { ...base, status: 'closed', calledOff: true }, 'off', 'Called off. Will Sam finish?', 'Nobody won this one.'],
    ['picks in (past close time)', { ...base, status: 'open', closesAt: 1 }, 'closed', 'Picks are in. Will Sam finish?', 'Waiting on the result.'],
    ['picks in (closed, no winner)', { ...base, status: 'closed' }, 'closed', 'Picks are in. Will Sam finish?', 'Waiting on the result.'],
  ])('%s: status title, line, ?s= image and og:url', async (_label, bet, s, title, description) => {
    mockBetDoc(bet);
    const meta = await metadataFor('abc123');
    expect(meta.title).toBe(title);
    expect(meta.openGraph).toMatchObject({ title, description, url: `/b/abc123?s=${s}`, images: [image(s)] });
    expect(meta.twitter).toMatchObject({ title, description, images: [image(s)] });
    expect(JSON.stringify(meta)).not.toContain('$20');
  });

  test('an open bet keeps its title, description and the file-based card (no images, no og:url)', async () => {
    mockBetDoc({ ...base, status: 'open' });
    const meta = await metadataFor('abc123');
    expect(meta.title).toBe('Will Sam finish?');
    expect(meta.openGraph).toEqual({ title: 'Will Sam finish?', description, type: 'website', siteName: 'Friendly Bets' });
    expect(meta.twitter).toEqual({ card: 'summary_large_image', title: 'Will Sam finish?', description });
  });

  test('an open bet linked with ?s=settled still gets the open preview', async () => {
    mockBetDoc({ ...base, status: 'open' });
    const meta = await generateMetadata({ params: Promise.resolve({ code: 'abc123' }), searchParams: Promise.resolve({ s: 'settled' }) });
    expect(meta.title).toBe('Will Sam finish?');
    expect(meta.openGraph.images).toBeUndefined();
    expect(meta.openGraph.url).toBeUndefined();
  });

  test('/t/ keeps the tally title; a closed bet gets the closed tags with a /t/ og:url and the /b/ card', async () => {
    mockBetDoc(settledBet);
    const meta = await tallyMetadataFor('abc123');
    expect(meta.title).toBe('Tally · Friendly');
    expect(meta.openGraph).toMatchObject({ title: 'Sam (obviously) won. Will Sam finish?', url: '/t/abc123?s=settled', images: [image('settled')] });
    mockBetDoc({ ...base, status: 'open' });
    const open = await tallyMetadataFor('abc123');
    expect(open).toEqual({ metadataBase: expect.any(URL), title: 'Tally · Friendly' });
  });
});
