import { test, expect } from '@playwright/test';

// Head to head on My bets. Same mocking as app.spec.js: identity and api are
// swapped in the browser, and every Google/Firebase request is aborted.
test.beforeEach(async ({ page }) => {
  // Preview checks must never send texts or change prod data.
  await page.route(/(?:googleapis\.com|firebaseio\.com|firebaseapp\.com)/, (route) => route.abort());
});

const options = [{ id: 'a', label: 'Bears' }, { id: 'b', label: 'Packers' }];
const pick = (voterId, name, optionId) => ({ voterId, name, optionId });
const base = { schemaVersion: 2, type: 'money-line', typeLabel: 'Money Line', stake: '$20 pot', closesAt: null, createdByID: 'jack', createdByName: 'Jack', options };
const BETS = [
  { ...base, id: 'won123', code: 'won123', createdAt: 3, question: 'Bears win Sunday?', status: 'closed', winnerId: 'a', settledAt: 3,
    votes: [pick('jack', 'Jack', 'a'), pick('uid-ana', 'Ana', 'a'), pick('uid-ben', 'Ben', 'b')] },
  { ...base, id: 'off123', code: 'off123', createdAt: 2, question: 'Rain delay?', status: 'called-off',
    votes: [pick('uid-ana', 'Ana', 'b')] },
  { ...base, id: 'live123', code: 'live123', createdAt: 1, question: 'Who takes the win?', status: 'open',
    votes: [pick('uid-ana', 'Ana', 'b')] },
];

async function mockBets(page, bets) {
  await page.route('**/src/phone/identity.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `const user = { uid: 'jack', providerData: [{ providerId: 'phone' }] };
      export const useIdentity = () => user;
      export const useSignedInUser = () => user;
      export const savedName = () => 'Jack';
      export const rememberName = () => {};
      export const creatorName = () => 'Jack';`,
  }));
  await page.route('**/src/phone/api.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `const bets = ${JSON.stringify(bets)};
      export const subscribeBet = (code, cb) => { cb(bets.find((bet) => bet.id === code) || null); return () => {}; };
      export const subscribeMyBets = (uid, cb) => { cb(bets); return () => {}; };
      export const hydrateBet = async b => b;
      export const createBet = async () => 'new123';
      export const saveBet = async () => 'new123';
      export const castVote = async () => {};
      export const deleteBet = async () => {};
      export const settleBet = async () => bets[0];`,
  }));
}

test('Friends on My bets shows each record, opens a friend, and a shared bet opens its tally', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockBets(page, BETS);
  await page.goto('/bets');
  const filters = page.getByRole('group', { name: 'Filter bets by status' });
  await filters.getByRole('button', { name: 'Friends 2' }).click();

  const section = page.getByRole('region', { name: 'Head to head' });
  const rows = section.getByRole('button');
  await expect(rows).toHaveText([/^Ana1 W0 LBets together 3/, /^Ben0 W1 LBets together 1/]);
  await expect(section).not.toContainText('Jack');
  const box = await rows.first().boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await rows.first().click();
  await expect(rows.first()).toHaveAttribute('aria-expanded', 'true');
  const shared = section.getByRole('link');
  await expect(shared).toHaveCount(3);
  await expect(shared.nth(1)).toContainText('This bet was called off.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('friends-open.png'), animations: 'disabled', scale: 'css' });

  await shared.first().click();
  await expect(page).toHaveURL(/\/t\/won123$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/bets$/);
  expect(errors).toEqual([]);
});

test('Friends with nobody named yet shows a plain label', async ({ page }) => {
  await mockBets(page, [{ ...BETS[2], votes: [pick('jack', 'Jack', 'a'), pick('anon-1', '', 'b')] }]);
  await page.goto('/bets');
  await page.getByRole('group', { name: 'Filter bets by status' }).getByRole('button', { name: 'Friends 0' }).click();
  await expect(page.getByText('No friends yet', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Head to head' })).toHaveCount(0);
});
