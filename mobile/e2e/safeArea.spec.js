import { test, expect } from '@playwright/test';

// Overlays on an iPhone 15/16-sized screen: every close button sits fully on
// screen, at least 44x44, and nothing scrolls sideways. Same mocking as
// friends.spec.js: identity and api are swapped in the browser, and every
// Google/Firebase request is aborted.
test.use({ viewport: { width: 393, height: 852 } });

test.beforeEach(async ({ page }) => {
  // Preview checks must never send texts or change prod data.
  await page.route(/(?:googleapis\.com|firebaseio\.com|firebaseapp\.com)/, (route) => route.abort());
});

const options = [{ id: 'a', label: 'Bears' }, { id: 'b', label: 'Packers' }];
const BET = {
  id: 'live123', code: 'live123', schemaVersion: 2, type: 'money-line', typeLabel: 'Money Line',
  question: 'Who takes the win?', stake: '$20 pot', status: 'open', closesAt: null, line: null,
  createdByID: 'jack', createdByName: 'Jack', createdAt: 1, options,
  votes: [{ voterId: 'uid-ana', name: 'Ana', optionId: 'b' }],
};

async function mockSignedIn(page, uid = 'jack') {
  await page.route('**/src/phone/identity.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `const user = { uid: ${JSON.stringify(uid)}, providerData: [{ providerId: 'phone' }] };
      export const useIdentity = () => user;
      export const useSignedInUser = () => user;
      export const savedName = () => 'Jack';
      export const rememberName = () => {};
      export const creatorName = () => 'Jack';`,
  }));
  await page.route('**/src/phone/api.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `const bets = ${JSON.stringify([BET])};
      export const subscribeBet = (code, cb) => { cb(bets.find((bet) => bet.id === code) || null); return () => {}; };
      export const subscribeMyBets = (uid, cb) => { cb(bets); return () => {}; };
      export const hydrateBet = async b => b;
      export const createBet = async () => 'new123';
      export const saveBet = async () => 'new123';
      export const castVote = async () => {};
      export const renameVote = async () => {};
      export const deleteBet = async () => {};
      export const undoSettle = async () => {};
      export const callOffBet = async () => {};
      export const settleBet = async () => bets[0];`,
  }));
}

// A notched iPhone's insets, where the browser can fake them (Chromium).
async function notch(page) {
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } });
    return { top: 59, right: 0 };
  } catch {
    return { top: 0, right: 0 };
  }
}

async function expectOnScreen(page, locator, inset = { top: 0, right: 0 }) {
  const box = await locator.boundingBox();
  const { width, height } = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(inset.top);
  expect(box.x + box.width).toBeLessThanOrEqual(width - inset.right);
  expect(box.y + box.height).toBeLessThanOrEqual(height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

// The web house ad, mounted the way adService does it.
async function openHouseAd(page) {
  await page.evaluate(async () => {
    const loaded = performance.getEntriesByType('resource').map((entry) => entry.name);
    const phone = loaded.find((name) => name.includes('/src/phone/'));
    const { showHouseAd } = await import(phone.replace(/\/src\/phone\/.*$/, '/src/ads/HouseAd.jsx'));
    showHouseAd();
  });
  return page.getByRole('button', { name: 'Close ad' });
}

for (const inNotch of [false, true]) {
  test(`the house ad close button sits inside the screen${inNotch ? ' and below the notch' : ''}`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const inset = inNotch ? await notch(page) : { top: 0, right: 0 };
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Good times. Better stakes.' })).toBeVisible();
    const close = await openHouseAd(page);
    await expect(close).toBeFocused();
    await expectOnScreen(page, close, inset);
    // 12px in from the corner, so the 2px focus ring at a 4px offset clears it.
    const box = await close.boundingBox();
    expect(page.viewportSize().width - inset.right - (box.x + box.width)).toBeGreaterThanOrEqual(12);
    expect(box.y - inset.top).toBeGreaterThanOrEqual(12);
    await page.screenshot({ path: testInfo.outputPath(`house-ad${inNotch ? '-notch' : ''}.png`), animations: 'disabled', scale: 'css' });
    await close.click();
    await expect(page.getByTestId('house-ad')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('the Results inbox close button stays on screen on the vote page', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockSignedIn(page, 'sam');
  // Results only shows once a pick is saved for this person.
  await page.addInitScript(() => {
    // Init scripts run in every frame; some (about:blank, auth iframes) deny storage.
    try {
      localStorage.setItem('fb.results.sam', JSON.stringify({ codes: ['live123'], read: [] }));
    } catch {
      // Not the app's frame.
    }
  });
  await page.goto('/b/live123');
  await page.getByRole('button', { name: /Results/ }).click();
  const inbox = page.getByRole('dialog', { name: 'The final word' });
  await expect(inbox).toBeVisible();
  const close = inbox.getByRole('button', { name: 'Close results' });
  await expectOnScreen(page, close);
  const panel = await inbox.boundingBox();
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(page.viewportSize().width);
  await close.click();
  await expect(inbox).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the delete dialog on My bets stays on screen', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockSignedIn(page);
  await page.goto('/bets');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this bet?' });
  const keep = dialog.getByRole('button', { name: 'Keep it' });
  await expectOnScreen(page, keep);
  const box = await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  await keep.click();
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the Account sheet, Log out? and the Delete account page stay on screen, and Back returns to My bets', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockSignedIn(page);
  await page.goto('/bets');
  const icon = page.getByRole('button', { name: 'Account', exact: true });
  await expectOnScreen(page, icon);
  // Nothing under the bets any more.
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete account', exact: true })).toHaveCount(0);

  // Measured once the slide in is over.
  const settled = (locator) => locator.evaluate((node) => Promise.all(
    node.ownerDocument.getAnimations().map((animation) => animation.finished.catch(() => {})),
  ));
  await icon.click();
  const sheet = page.getByRole('dialog', { name: 'Account' });
  await settled(sheet);
  const logOut = sheet.getByRole('button', { name: 'Log out', exact: true });
  const remove = sheet.getByRole('button', { name: 'Delete account', exact: true });
  await expectOnScreen(page, remove);
  expect((await logOut.boundingBox()).height).toBeGreaterThanOrEqual(56);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(icon).toBeFocused();

  await icon.click();
  await logOut.click();
  const confirm = page.getByRole('dialog', { name: 'Log out?' });
  await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await expectOnScreen(page, confirm.getByRole('button', { name: 'Cancel', exact: true }));
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(confirm).toHaveCount(0);

  await remove.click();
  await expect(page).toHaveURL(/\/account\/delete$/);
  await expect(sheet).toHaveCount(0);
  const red = page.getByRole('button', { name: 'Delete account', exact: true });
  await settled(red);
  await expectOnScreen(page, red);
  await red.click();
  await expect(page.getByRole('dialog', { name: 'Delete your account?' }).getByRole('button', { name: 'Keep it' })).toBeFocused();
  await page.getByRole('button', { name: 'Keep it' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/bets$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('the Delete account page sends a visitor who is not signed in to My bets', async ({ page }) => {
  await page.goto('/account/delete');
  await expect(page).toHaveURL(/\/bets$/);
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toHaveCount(0);
});
