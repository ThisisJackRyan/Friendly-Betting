import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Preview checks must never send texts or change prod data.
  await page.route(/(?:googleapis\.com|firebaseio\.com|firebaseapp\.com)/, (route) => route.abort());
});

test('shared mobile home, create slides, stake and creator gate', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good times. Better stakes.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('home.png'), animations: 'disabled', scale: 'css' });
  await page.getByRole('link', { name: 'Start a bet', exact: true }).click();
  await expect(page).toHaveURL(/\/new$/);
  await page.getByRole('button', { name: /Money Line/ }).click();
  await expect(page.getByLabel('Option A')).toBeVisible();
  await page.getByLabel(/Question/).fill('Who takes the win?');
  await page.getByLabel('Option A').fill('Bears');
  await page.getByLabel('Option B').fill('Packers');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Stake', { exact: true }).fill('$20 pot');
  await expect(page.locator('.create-pane.is-leaving')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('stake.png'), animations: 'disabled', scale: 'css' });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Phone +1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /send code/i })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('direct routes retain all bet types, My bets and missing-link recovery', async ({ page }) => {
  for (const [type, label] of [['money-line', /Option A/], ['over-under', /Line/], ['prop', /Question/]]) {
    await page.goto(`/new/${type}`);
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  await page.goto('/bets');
  await expect(page.getByRole('textbox', { name: 'Phone +1', exact: true })).toBeVisible();
  await page.goto('/missing');
  await expect(page.getByRole('link', { name: /home/i })).toBeVisible();
});

test('browser back walks the create steps and keeps the draft', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('link', { name: 'Start a bet', exact: true }).click();
  await expect(page).toHaveURL(/\/new$/);
  await page.getByRole('button', { name: /Money Line/ }).click();
  await expect(page).toHaveURL(/\/new#step-2$/);
  await page.getByLabel(/Question/).fill('Who takes the win?');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/\/new#step-3$/);
  await page.getByLabel('Stake', { exact: true }).fill('$20 pot');

  // The same history back the iOS swipe and Android back button use.
  await page.goBack();
  await expect(page).toHaveURL(/\/new#step-2$/);
  await expect(page.getByLabel(/Question/)).toHaveValue('Who takes the win?');
  await page.goForward();
  await expect(page.getByLabel('Stake', { exact: true })).toHaveValue('$20 pot');

  // On-screen back is a history back too, down to the type picker, then home.
  await page.locator('.create-pane:not(.is-leaving)').getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/new#step-2$/);
  await page.locator('.create-pane:not(.is-leaving)').getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByRole('button', { name: /Money Line/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/127\.0\.0\.1:5173\/$/);
  await expect(page.getByRole('heading', { name: 'Good times. Better stakes.' })).toBeVisible();

  // A refresh on a step hash starts Create over cleanly.
  await page.goto('/new/prop#step-3');
  await expect(page).toHaveURL(/\/new\/prop$/);
  await expect(page.getByLabel(/Option 1/)).toBeVisible();
  expect(errors).toEqual([]);
});

async function mockCrew(page, { votes, share, patch } = {}) {
  const bet = {
    id: 'crew123', code: 'crew123', schemaVersion: 2, type: 'money-line',
    question: 'Who takes the win?', stake: '$20 pot', status: 'open',
    createdByID: 'jack', createdByName: 'Jack',
    options: [{ id: 'a', label: 'Bears' }, { id: 'b', label: 'Packers' }],
    votes: votes || [{ voterId: 'jack', name: 'Jack', optionId: 'a' }, { voterId: 'sam', name: 'Sam', optionId: 'b' }],
    ...patch,
  };
  await page.route('**/src/phone/identity.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `const user = { uid: 'jack', providerData: [{ providerId: 'phone' }] };
      export const useIdentity = () => user;
      export const savedName = () => 'Jack';
      export const rememberName = () => {};
      export const creatorName = () => 'Jack';`,
  }));
  await page.route('**/src/phone/api.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `import { buildSettlement } from ${JSON.stringify(new URL('./settlement.js', route.request().url()).href)};
      // Kept in sessionStorage so a settle survives page.goto within the test.
      let bet = JSON.parse(sessionStorage.getItem('crew-bet') || 'null') || ${JSON.stringify(bet)};
      const listeners = new Set();
      export const subscribeBet = (code, cb) => { listeners.add(cb); cb(bet); return () => listeners.delete(cb); };
      export const subscribeMyBets = (uid, cb) => { cb([bet]); return () => {}; };
      export const hydrateBet = async b => b;
      export const createBet = async () => 'crew123';
      export const saveBet = async () => 'crew123';
      export const castVote = async (code, vote) => {
        bet = { ...bet, votes: [...bet.votes.filter(v => v.voterId !== vote.voterId), { ...vote, at: 1 }] };
        sessionStorage.setItem('crew-bet', JSON.stringify(bet));
        listeners.forEach(cb => cb(bet));
      };
      export const deleteBet = async () => {};
      export const settleBet = async (code, winnerId) => {
        bet = { ...bet, status: 'closed', winnerId, settledAt: 123, settlement: buildSettlement(bet, winnerId) };
        sessionStorage.setItem('crew-bet', JSON.stringify(bet));
        listeners.forEach(cb => cb(bet)); return bet;
      };`,
  }));
  if (share === 'none') {
    // A desktop browser with no share sheet and no clipboard: only manual copying is left.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Macintosh)' });
    });
    return;
  }
  await page.addInitScript((dismiss) => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async ({ text }) => {
        window.sharedResult = text;
        // Counted across reloads, so a second sheet would show up.
        const shares = JSON.parse(sessionStorage.getItem('e2e-shares') || '[]');
        sessionStorage.setItem('e2e-shares', JSON.stringify([...shares, text]));
        if (dismiss) throw new DOMException('Share canceled', 'AbortError');
      },
    });
  }, share === 'dismiss');
}

test('making a bet lands on its live tally, opens the share sheet once, and back goes home', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockCrew(page, { votes: [], share: 'dismiss' });
  const shares = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('e2e-shares') || '[]'));
  const invite = 'New bet: Who takes the win?\nStakes: $20 pot\nPick your side: http://127.0.0.1:5173/b/crew123';

  await page.goto('/');
  await page.getByRole('link', { name: 'Start a bet', exact: true }).click();
  await page.getByRole('button', { name: /Money Line/ }).click();
  await page.getByLabel(/Question/).fill('Who takes the win?');
  await page.getByLabel('Option A').fill('Bears');
  await page.getByLabel('Option B').fill('Packers');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Step 3 of 3')).toBeVisible();
  await page.getByLabel('Stake', { exact: true }).fill('$20 pot');
  await page.getByRole('button', { name: 'Text friends', exact: true }).click();

  // No recap step: the tally takes Create's place.
  await expect(page).toHaveURL(/\/t\/crew123$/);
  await expect(page.getByRole('heading', { name: 'The picks' })).toBeVisible();
  const button = page.getByRole('button', { name: 'Text the crew', exact: true });
  await expect(button).toHaveClass(/cta-nudge/);
  await expect(page.locator('.tally-share.is-nudge')).toBeVisible();
  // Under the invite, only the creator's own way to vote: no raw vote URL.
  await expect(page.locator('.tally-share a')).toHaveCount(1);
  await expect(page.locator('.tally-share a')).toHaveText('Wanna vote?');
  await expect(page.locator('.tally-share')).not.toContainText('/b/crew123');
  await expect(page.getByText('Saved. Text when you’re ready.')).toBeVisible();
  expect(await shares()).toEqual([invite]);
  await page.screenshot({ path: testInfo.outputPath('tally-after-create.png'), animations: 'disabled', scale: 'css' });

  // The button sends the very same text.
  await button.click();
  await expect.poll(shares).toEqual([invite, invite]);

  // A reload never opens it again.
  await page.reload();
  await expect(button).toBeVisible();
  await expect(page.getByText('Saved. Text when you’re ready.')).toHaveCount(0);
  expect(await shares()).toHaveLength(2);

  // Back (the iOS swipe and Android back use the same history) skips Create.
  await page.goBack();
  await expect(page).toHaveURL(/127\.0\.0\.1:5173\/$/);
  await expect(page.getByRole('heading', { name: 'Good times. Better stakes.' })).toBeVisible();
  // Forward returns to the tally, again with no sheet.
  await page.goForward();
  await expect(page).toHaveURL(/\/t\/crew123$/);
  await expect(button).toBeVisible();
  expect(await shares()).toHaveLength(2);
  // Past the tally, forward is only ever a fresh Create, never the sent step.
  await page.goForward();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByRole('button', { name: /Money Line/ })).toBeVisible();
  expect(await shares()).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('after Create, Wanna vote? opens the vote page, back returns to the tally, and a pick hides it', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockCrew(page, { votes: [], share: 'dismiss' });
  const shares = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('e2e-shares') || '[]'));

  await page.goto('/');
  await page.getByRole('link', { name: 'Start a bet', exact: true }).click();
  await page.getByRole('button', { name: /Money Line/ }).click();
  await page.getByLabel(/Question/).fill('Who takes the win?');
  await page.getByLabel('Option A').fill('Bears');
  await page.getByLabel('Option B').fill('Packers');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Stake', { exact: true }).fill('$20 pot');
  await page.getByRole('button', { name: 'Text friends', exact: true }).click();
  await expect(page).toHaveURL(/\/t\/crew123$/);

  const link = page.getByRole('link', { name: 'Wanna vote?', exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/b/crew123');
  await expect(page.locator('.tally-share.is-nudge').getByRole('link')).toHaveText('Wanna vote?');
  await page.screenshot({ path: testInfo.outputPath('creator-vote-link.png'), animations: 'disabled', scale: 'css' });

  // In-app navigation: the vote page, then history back to the same tally.
  await link.click();
  await expect(page).toHaveURL(/\/b\/crew123$/);
  await expect(page.getByRole('heading', { name: 'What’s your call?' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/t\/crew123$/);
  await expect(page.getByRole('heading', { name: 'The picks' })).toBeVisible();
  await expect(link).toBeVisible();
  // Coming back never reopens the share sheet.
  expect(await shares()).toHaveLength(1);

  // Once the creator picks, the tally drops the link.
  await link.click();
  await expect(page).toHaveURL(/\/b\/crew123$/);
  await page.getByRole('button', { name: 'Bears', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What’s your call?' })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/t\/crew123$/);
  await expect(page.locator('.voter-list')).toContainText('Jack');
  await expect(page.getByRole('button', { name: 'Text the crew', exact: true })).toBeVisible();
  await expect(link).toHaveCount(0);
  expect(await shares()).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('a bet called off by status alone shows the reveal on the tally and blocks voting', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // No calledOff flag, a future close time and zero picks: everything that
  // would light up the open-bet invite for the creator.
  await mockCrew(page, { votes: [], share: 'dismiss', patch: { status: 'called-off', closesAt: Date.now() + 86400000 } });

  await page.goto('/t/crew123');
  const reveal = page.getByRole('region', { name: 'Settled result' });
  await expect(reveal).toContainText('This bet was called off.');
  await expect(reveal).toContainText('Nobody won this one.');
  await expect(page.getByRole('button', { name: 'Text the crew', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Wanna vote?', exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Picks close/)).toHaveCount(0);
  await expect(page.locator('.is-nudge, .cta-nudge')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /close & settle/i })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('tally-called-off.png'), animations: 'disabled', scale: 'css' });

  await page.goto('/b/crew123');
  await expect(page.getByRole('region', { name: 'Settled result' })).toContainText('This bet was called off.');
  await expect(page.getByRole('heading', { name: 'What’s your call?' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bears', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Packers', exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Picks close/)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('vote-called-off.png'), animations: 'disabled', scale: 'css' });
  expect(await page.evaluate(() => sessionStorage.getItem('e2e-shares'))).toBeNull();
  expect(errors).toEqual([]);
});

test('with no share sheet and no clipboard, the tally shows the whole invite to copy', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockCrew(page, { votes: [], share: 'none' });
  await page.goto('/t/crew123');
  const card = page.locator('.tally-share.is-nudge');
  await expect(card).toBeVisible();
  await expect(card.locator('.manual-message')).toHaveCount(0);
  await page.getByRole('button', { name: 'Text the crew', exact: true }).click();
  await expect(card.getByText('Copy the message below.')).toBeVisible();
  await expect(card.locator('.manual-message')).toHaveText(
    'New bet: Who takes the win?\nStakes: $20 pot\nPick your side: http://127.0.0.1:5173/b/crew123',
  );
  // No raw vote URL to tap; the creator's only link is Wanna vote?.
  await expect(card.locator('a')).toHaveText(['Wanna vote?']);
  expect(page.url()).toMatch(/\/t\/crew123$/);
  expect(errors).toEqual([]);
});

for (const [side, winner, ping, headline, subline] of [
  ['Bears', 'Jack', 'You called it.', 'You called it.', 'Solo win. Bragging rights, secured.'],
  ['Packers', 'Sam', 'This one’s settled.', 'Sam won.', 'Not your day. Get ’em next time.'],
]) {
  test(`settle in the app: ${winner} wins, with the right participant ping`, async ({ page }, testInfo) => {
    page.on('pageerror', (error) => console.error('App preview error:', error.message));
    await mockCrew(page);
    await page.goto('/t/crew123');
    await page.getByRole('button', { name: 'Close & settle', exact: true }).click();
    await page.getByRole('button', { name: side, exact: true }).click();
    await expect(page.getByRole('region', { name: 'Result preview' })).toContainText(`${winner} won the $20 pot`);
    await page.getByRole('button', { name: 'Settle & notify', exact: true }).click();
    const reveal = page.getByRole('region', { name: 'Settled result' });
    await expect(reveal).toContainText(`${side} won`);
    await expect(reveal).toContainText(subline);
    await expect(reveal).toContainText('Stakes: $20 pot');
    // The reveal replaces the per-side breakdown and voter lists.
    await expect(page.locator('.bars, .voter-list')).toHaveCount(0);
    // Only the viewer who lost gets the way back in.
    await expect(page.getByRole('link', { name: 'Start a bet', exact: true })).toHaveCount(winner === 'Jack' ? 0 : 1);
    // Nothing floats over the settled screen; Results lives in the header now.
    await expect(page.locator('.results-trigger, .result-toast')).toHaveCount(0);
    await expect(reveal.getByRole('heading', { name: headline, exact: true })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const header = await page.locator('.tally-screen > .nav-row').boundingBox();
    await expect.poll(async () => (await page.getByRole('region', { name: 'Settled result' }).boundingBox()).y).toBeGreaterThanOrEqual(header.y + header.height + 8);
    await page.screenshot({ path: testInfo.outputPath('settled.png'), animations: 'disabled', scale: 'css' });
    await page.getByRole('button', { name: 'Share the result', exact: true }).click();
    expect(await page.evaluate(() => window.sharedResult)).toContain(`FRIENDLY · Closed · ${winner} won the $20 pot`);

    // The vote link's header carries Results, with the unread count and the participant line.
    await page.goto('/b/crew123');
    const results = page.locator('.vote-header').getByRole('button', { name: 'Results 1 new' });
    await results.click();
    const inbox = page.getByRole('dialog', { name: 'The final word' });
    await expect(inbox).toContainText(ping);
    await expect(inbox.getByRole('link', { name: new RegExp(ping) })).toHaveAttribute('href', '/b/crew123');
    await page.keyboard.press('Escape');
    await expect(inbox).toHaveCount(0);
    await expect(page.locator('.vote-header').getByRole('button', { name: /^Results/ })).toBeFocused();
  });
}

// The app as Capacitor runs it: a native platform, with the App plugin's back
// button and minimize recorded on window so a test can press back.
async function mockNative(page) {
  await page.addInitScript(() => {
    window.CapacitorCustomPlatform = { name: 'android' };
  });
  await page.route('**/node_modules/.vite/deps/@capacitor_app.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `const handlers = {};
      window.minimized = 0;
      window.appEmit = (event, data) => (handlers[event] || new Set()).forEach((callback) => callback(data));
      window.appListens = (event) => Boolean(handlers[event]?.size);
      export const App = {
        addListener: async (event, callback) => {
          (handlers[event] ||= new Set()).add(callback);
          return { remove: async () => handlers[event].delete(callback) };
        },
        getLaunchUrl: async () => undefined,
        minimizeApp: async () => { window.minimized += 1; },
      };`,
  }));
}

const tab = (page, name) => page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name, exact: true });
const androidBack = (page) => page.evaluate(() => window.appEmit('backButton', { canGoBack: window.history.length > 1 }));
const appIndex = (page) => page.evaluate(() => window.history.state?.idx);

test('tabs are roots: Home has nothing behind it after switching tabs', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockCrew(page);
  await page.goto('/bets');
  await tab(page, 'Home').click();
  await expect(page).toHaveURL(/127\.0\.0\.1:5173\/$/);
  await tab(page, 'My bets').click();
  await expect(page).toHaveURL(/\/bets$/);
  await tab(page, 'Home').click();
  await expect(page).toHaveURL(/127\.0\.0\.1:5173\/$/);
  expect(await appIndex(page)).toBe(0);

  // The history back the iOS swipe uses never lands on My bets.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/bets$/);
  expect(errors).toEqual([]);
});

test('a tally opened from My bets backs out to My bets, and Home from Create unwinds', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockCrew(page);
  await page.goto('/');
  await page.getByRole('link', { name: /View your bets/ }).click();
  await expect(page).toHaveURL(/\/bets$/);
  expect(await appIndex(page)).toBe(0);
  await page.getByRole('link', { name: /Who takes the win\?/ }).click();
  await expect(page).toHaveURL(/\/t\/crew123$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/bets$/);
  await expect(tab(page, 'My bets')).toHaveAttribute('aria-current', 'page');

  // Home from a Create step walks back to the first entry rather than pushing.
  await tab(page, 'Create').click();
  await page.getByRole('button', { name: /Money Line/ }).click();
  await expect(page).toHaveURL(/\/new#step-2$/);
  expect(await appIndex(page)).toBe(2);
  await page.locator('.create-pane:not(.is-leaving)').getByRole('link', { name: /friendly/i }).first().click();
  await expect(page).toHaveURL(/127\.0\.0\.1:5173\/$/);
  await expect(page.getByRole('heading', { name: 'Good times. Better stakes.' })).toBeVisible();
  expect(await appIndex(page)).toBe(0);
  await page.goBack();
  await expect(page).not.toHaveURL(/127\.0\.0\.1:5173\/(?:bets|new.*)$/);
  expect(errors).toEqual([]);
});

test('making a bet from My bets lands on its tally, and back returns to My bets', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockCrew(page, { votes: [], share: 'dismiss' });
  await page.goto('/bets');
  await tab(page, 'Create').click();
  await expect(page).toHaveURL(/\/new$/);
  await page.getByRole('button', { name: /Money Line/ }).click();
  await page.getByLabel(/Question/).fill('Who takes the win?');
  await page.getByLabel('Option A').fill('Bears');
  await page.getByLabel('Option B').fill('Packers');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Stake', { exact: true }).fill('$20 pot');
  await page.getByRole('button', { name: 'Text friends', exact: true }).click();
  await expect(page).toHaveURL(/\/t\/crew123$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/bets$/);
  expect(errors).toEqual([]);
});

test('in the app, Android back on Home minimizes and on My bets goes Home', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockCrew(page);
  await mockNative(page);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.appListens?.('backButton'))).toBe(true);

  // Home -> My bets -> a tally -> back -> Home.
  await tab(page, 'My bets').click();
  await expect(page).toHaveURL(/\/bets$/);
  await page.getByRole('link', { name: /Who takes the win\?/ }).click();
  await expect(page).toHaveURL(/\/t\/crew123$/);
  await androidBack(page);
  await expect(page).toHaveURL(/\/bets$/);
  expect(await page.evaluate(() => window.minimized)).toBe(0);
  await androidBack(page);
  await expect(page).toHaveURL(/127\.0\.0\.1:5173\/$/);
  expect(await appIndex(page)).toBe(0);
  expect(await page.evaluate(() => window.minimized)).toBe(0);
  await androidBack(page);
  await expect.poll(() => page.evaluate(() => window.minimized)).toBe(1);
  await expect(page).toHaveURL(/127\.0\.0\.1:5173\/$/);

  // Even with app entries behind Home, back there leaves the app.
  await page.evaluate(() => {
    window.history.pushState({ ...window.history.state, idx: 1 }, '', '/');
  });
  await androidBack(page);
  await expect.poll(() => page.evaluate(() => window.minimized)).toBe(2);
  await expect(page).toHaveURL(/127\.0\.0\.1:5173\/$/);
  expect(errors).toEqual([]);
});
