import { test, expect } from '@playwright/test';

// Run it back on the creator's settled tally. Same mocking as app.spec.js:
// identity and api are swapped in the browser, and every Google/Firebase
// request is aborted.
test.beforeEach(async ({ page }) => {
  // Preview checks must never send texts or change prod data.
  await page.route(/(?:googleapis\.com|firebaseio\.com|firebaseapp\.com)/, (route) => route.abort());
});

const oldBet = {
  id: 'old123', code: 'old123', schemaVersion: 2, type: 'money-line', typeLabel: 'Money Line',
  question: 'Who takes the win?', stake: '$20 pot', status: 'open', closesAt: null, line: null,
  createdByID: 'jack', createdByName: 'Jack', createdAt: 1,
  options: [{ id: 'a', label: 'Bears' }, { id: 'b', label: 'Packers' }],
  votes: [{ voterId: 'jack', name: 'Jack', optionId: 'a' }, { voterId: 'sam', name: 'Sam', optionId: 'b' }],
};

async function mockRematch(page, { uid = 'jack', patch } = {}) {
  const user = uid === 'jack'
    ? { uid, providerData: [{ providerId: 'phone' }] }
    : { uid, isAnonymous: true, providerData: [{ providerId: 'anonymous' }] };
  await page.route('**/src/phone/identity.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `const user = ${JSON.stringify(user)};
      export const useIdentity = () => user;
      export const useSignedInUser = () => user;
      export const savedName = () => 'Jack';
      export const rememberName = () => {};
      export const creatorName = () => 'Jack';`,
  }));
  await page.route('**/src/phone/api.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `import { buildSettlement } from ${JSON.stringify(new URL('./settlement.js', route.request().url()).href)};
      const old = ${JSON.stringify(oldBet)};
      const settled = { ...old, status: 'closed', winnerId: 'a', settledAt: 123, settlement: buildSettlement(old, 'a'), ...${JSON.stringify(patch || {})} };
      // Every bet made here, kept in sessionStorage so it survives navigation.
      const made = () => JSON.parse(sessionStorage.getItem('e2e-created') || '[]');
      const betFor = (code) => {
        if (code === 'old123') return settled;
        const index = made().findIndex((_, i) => code === 'new' + (456 + i));
        if (index < 0) return null;
        const fields = made()[index];
        return { ...fields, id: code, code, status: 'open', winnerId: null, votes: [], createdAt: 2 };
      };
      export const subscribeBet = (code, cb) => { cb(betFor(code)); return () => {}; };
      export const subscribeMyBets = (uid, cb) => { cb([settled]); return () => {}; };
      export const hydrateBet = async b => b;
      const create = async (fields) => {
        const list = [...made(), fields];
        sessionStorage.setItem('e2e-created', JSON.stringify(list));
        // Slow enough for a second tap to land mid-save.
        await new Promise((resolve) => setTimeout(resolve, 300));
        return 'new' + (455 + list.length);
      };
      export const createBet = create;
      export const saveBet = async (code, fields) => code ? code : create(fields);
      export const castVote = async () => {};
      export const renameVote = async () => {};
      export const deleteBet = async () => {};
      export const undoSettle = async () => {};
      export const callOffBet = async () => {};
      export const settleBet = async () => settled;`,
  }));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async ({ text }) => {
        const shares = JSON.parse(sessionStorage.getItem('e2e-shares') || '[]');
        sessionStorage.setItem('e2e-shares', JSON.stringify([...shares, text]));
        throw new DOMException('Share canceled', 'AbortError');
      },
    });
  });
}

const created = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('e2e-created') || '[]'));
const shares = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('e2e-shares') || '[]'));

test('Run it back makes the same bet and lands on its tally, and back returns to the settled bet', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockRematch(page);

  await page.goto('/t/old123');
  await expect(page.getByRole('heading', { name: 'The final word' })).toBeVisible();
  const button = page.getByRole('button', { name: 'Run it back', exact: true });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('reveal-run-it-back.png'), animations: 'disabled', scale: 'css' });

  await button.click();
  await expect(page).toHaveURL(/\/t\/new456$/);
  expect(await created(page)).toEqual([{
    schemaVersion: 2,
    type: 'money-line',
    typeLabel: 'Money Line',
    question: 'Who takes the win?',
    stake: '$20 pot',
    closesAt: null,
    options: [{ id: 'a', label: 'Bears' }, { id: 'b', label: 'Packers' }],
    line: null,
    rematchOf: { code: 'old123' },
    createdByID: 'jack',
    createdByName: 'Jack',
  }]);

  // The new bet's tally, like one fresh from Create: the invite opens once.
  await expect(page.getByRole('heading', { name: 'The picks' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Text the crew', exact: true })).toBeVisible();
  await expect(page.locator('.tally-share.is-nudge')).toBeVisible();
  await expect.poll(() => shares(page)).toEqual([
    'New bet: Who takes the win?\nStakes: $20 pot\nPick your side: http://127.0.0.1:5173/b/new456',
  ]);
  await expect(page.getByRole('button', { name: 'Run it back', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('rematch-new-tally.png'), animations: 'disabled', scale: 'css' });

  // A push: back (the iOS swipe and Android back) is the settled bet again.
  await page.goBack();
  await expect(page).toHaveURL(/\/t\/old123$/);
  await expect(page.getByRole('heading', { name: 'The final word' })).toBeVisible();
  await expect(button).toBeEnabled();
  expect(await shares(page)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('a double tap on Run it back makes one bet', async ({ page }) => {
  await mockRematch(page);
  await page.goto('/t/old123');
  const button = page.getByRole('button', { name: 'Run it back', exact: true });
  await expect(button).toBeVisible();
  await button.evaluate((el) => {
    el.click();
    el.click();
  });
  await expect(page).toHaveURL(/\/t\/new456$/);
  await expect(page.getByRole('button', { name: 'Text the crew', exact: true })).toBeVisible();
  expect(await created(page)).toHaveLength(1);
});

test('a called-off bet has no Run it back', async ({ page }) => {
  await mockRematch(page, { patch: { calledOff: true } });
  await page.goto('/t/old123');
  await expect(page.getByRole('region', { name: 'Settled result' })).toContainText('This bet was called off.');
  await expect(page.getByRole('button', { name: 'Run it back', exact: true })).toHaveCount(0);
});

test('a voter gets no Run it back, on the tally or the vote page', async ({ page }) => {
  await mockRematch(page, { uid: 'sam' });
  await page.goto('/t/old123');
  await expect(page.getByRole('heading', { name: 'The final word' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run it back', exact: true })).toHaveCount(0);
  await page.goto('/b/old123');
  await expect(page.getByRole('region', { name: 'Settled result' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run it back', exact: true })).toHaveCount(0);
});
