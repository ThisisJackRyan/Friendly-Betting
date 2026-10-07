import { voteUrl } from './routes';
import { isNativeApp, PROD_ORIGIN } from '../platform/runtime';

jest.mock('../platform/runtime', () => ({
  isNativeApp: jest.fn(() => false),
  PROD_ORIGIN: 'https://friendly-betting-teal.vercel.app',
}));

test('native invitations and results link to prod, never the bundled app origin', () => {
  isNativeApp.mockReturnValue(true);
  expect(voteUrl('abc123')).toBe(`${PROD_ORIGIN}/b/abc123`);
});

test('web shares retain the current web origin', () => {
  isNativeApp.mockReturnValue(false);
  expect(voteUrl('abc123')).toBe(`${window.location.origin}/b/abc123`);
});
