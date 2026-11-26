/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { ImageResponse } from 'next/og';
import Image from '../../app/b/[code]/opengraph-image';
import { previewBet } from './betPreview';
import { previewCard } from './previewCard';
import { FALLBACK_CACHE, FONT_PATHS, QUESTION_CACHE } from './previewCard';

jest.mock('./betPreview', () => ({ previewBet: jest.fn() }));
// The route reads one preview ({ question, status, side }); these tests set
// the question, and the closed-card tests below the status.
const previewQuestion = {
  mockResolvedValue: (question) => previewBet.mockResolvedValue({ question, status: 'open', side: '' }),
  mockRejectedValue: (err) => previewBet.mockRejectedValue(err),
  mockReset: () => previewBet.mockReset(),
};
// Wraps the real next/og ImageResponse so a test can make it throw once and
// still check the headers next/og itself sets.
jest.mock('next/og', () => {
  const Actual = jest.requireActual('next/og').ImageResponse;
  return { ImageResponse: jest.fn((element, options) => new Actual(element, options)) };
});

const render = (code = 'abc123') => Image({ params: Promise.resolve({ code }) });
const lastOptions = () => ImageResponse.mock.calls.at(-1)[1];
const ONE_YEAR = /immutable|31536000/;

beforeEach(() => {
  previewQuestion.mockReset();
  ImageResponse.mockClear();
});

test('a question card is cached for minutes, not the next/og year-long default', async () => {
  previewQuestion.mockResolvedValue('Will Sam finish the marathon?');
  const res = await render();
  expect(res.headers.get('cache-control')).toBe(QUESTION_CACHE);
  expect(res.headers.get('cache-control')).not.toMatch(ONE_YEAR);
  expect(res.headers.get('content-type')).toBe('image/png');
});

test('the fallback card for a missing question is cached only briefly', async () => {
  previewQuestion.mockResolvedValue('');
  const res = await render();
  expect(res.headers.get('cache-control')).toBe(FALLBACK_CACHE);
  expect(res.headers.get('cache-control')).not.toMatch(ONE_YEAR);
});

test('a failed question read gets the brief fallback cache', async () => {
  previewQuestion.mockRejectedValue(new Error('boom'));
  const res = await render();
  expect(res.headers.get('cache-control')).toBe(FALLBACK_CACHE);
});

test('a failed question card render falls back with the brief cache', async () => {
  previewQuestion.mockResolvedValue('Will Sam finish the marathon?');
  ImageResponse.mockImplementationOnce(() => { throw new Error('render failed'); });
  const res = await render();
  expect(ImageResponse).toHaveBeenCalledTimes(2);
  expect(res.headers.get('cache-control')).toBe(FALLBACK_CACHE);
});

test('Manrope 800 and 600 load from their static paths', async () => {
  previewQuestion.mockResolvedValue('Will Sam finish the marathon?');
  await render();
  const { fonts } = lastOptions();
  expect(fonts.map((f) => [f.name, f.weight])).toEqual([['Manrope', 800], ['Manrope', 600]]);
  expect(FONT_PATHS[800]).toMatch(/manrope-latin-800-normal\.woff$/);
  expect(FONT_PATHS[600]).toMatch(/manrope-latin-600-normal\.woff$/);
  fonts.forEach((font) => {
    expect(font.data.length).toBeGreaterThan(0);
    expect(Buffer.compare(font.data, readFileSync(FONT_PATHS[font.weight]))).toBe(0);
  });
});

describe('closed cards', () => {
  const QUESTION = 'Will Sam finish the marathon?';
  const element = () => ImageResponse.mock.calls.at(-1)[0];

  test.each([
    ['settled', { status: 'settled', side: 'Yes' }],
    ['calledOff', { status: 'calledOff', side: '' }],
    ['closed', { status: 'closed', side: '' }],
  ])('a %s bet renders its closed card with the minutes-long cache', async (_label, state) => {
    previewBet.mockResolvedValue({ question: QUESTION, ...state });
    const res = await render();
    expect(JSON.stringify(element())).toBe(JSON.stringify(previewCard(QUESTION, state)));
    expect(JSON.stringify(element())).not.toBe(JSON.stringify(previewCard(QUESTION)));
    expect(res.headers.get('cache-control')).toBe(QUESTION_CACHE);
  });

  test('the card follows the bet, not the URL: an open bet is the open card whatever ?s= says', async () => {
    previewBet.mockResolvedValue({ question: QUESTION, status: 'open', side: '' });
    await Image({ params: Promise.resolve({ code: 'abc123' }), searchParams: Promise.resolve({ s: 'settled' }) });
    expect(JSON.stringify(element())).toBe(JSON.stringify(previewCard(QUESTION)));
  });
});
