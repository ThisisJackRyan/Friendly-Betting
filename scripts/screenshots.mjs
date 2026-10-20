// Regenerates the README screenshots in docs/screenshots.
//
//   npm run screenshots
//   npm run screenshots -- live-tally.png settled.png --copy-to=/tmp/shots
//
// File names pick shots; --copy-to also writes each image to that directory.
// Shots marked docs: false (many-voters.png, results-open.png, the settled
// reveal variants winner-b.png, loser-b.png, creator-t.png,
// nobody-called-it.png, and the tally right after Create with its share sheet
// up, tally-after-create.png, or dismissed, tally-after-create-dismissed.png,
// and the creator's Wanna vote? link under the invite, creator-vote-link.png,
// and a bet called off by status alone on /t/ and /b/, tally-called-off.png
// and vote-called-off.png, and a settled bet whose winners all skipped their
// name, reveal-unnamed-winners.png, and with ads on, the web house ad over the
// tally, house-ad.png, and the thank-you after it, thank-you.png, and the
// same after a Settle & notify with no Undo, settle-house-ad.png, settle-thank-you.png, and
// the reveal once the thank-you continues, settle-reveal-after-ad.png, and Pro:
// the paywall at /pro, paywall.png, a founder's own badge on the tally,
// pro-badge.png, and a Pro creator's Text the crew with ads on and no ad,
// tally-pro-no-ad.png, and Friends on My bets, friends.png, with Maya opened,
// friends-open.png, and the settled reveal with Share as image under Share
// the result, winner-card-reveal.png, and the winner card PNG that button
// makes, winner-card.png, and the same for long text and many winners,
// winner-card-long.png, and F8: Call off on an open tally,
// f8-call-off-button.png, its confirm, f8-call-off-confirm.png, the reveal
// with its Undo countdown, f8-undo-countdown.png, and the tally once called
// off, f8-called-off.png) only go to --copy-to.
//
// SCREENSHOTS_BASE points at an app preview already running elsewhere, for
// when another checkout holds port 5173.
// Drives the Vite app preview (npm run mobile:dev) in Playwright's Chromium at
// iPhone size. Every Google/Firebase request is aborted and the two data
// modules (src/phone/identity.js, src/phone/api.js) are swapped for fixtures
// in the browser, the same way mobile/e2e/app.spec.js does, and vote links
// show the production origin (src/phone/routes.js), as the app's do. Nothing here
// signs in, creates a bet or touches prod, and no app code knows about it.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const BASE = process.env.SCREENSHOTS_BASE || 'http://127.0.0.1:5173';
const CODE = 'k7q2xm';

const JACK = { uid: 'jack', providerData: [{ providerId: 'phone' }] };
const MAYA = { uid: 'maya', providerData: [] };
const JAKE = { uid: 'jake', providerData: [] };

const OPEN_BET = {
  id: CODE, code: CODE, schemaVersion: 2, type: 'money-line', typeLabel: 'Money Line',
  question: 'Chiefs cover -3?', stake: '$20 pot', status: 'open', closesAt: null,
  createdByID: 'jack', createdByName: 'Jack',
  options: [{ id: 'a', label: 'Chiefs -3' }, { id: 'b', label: 'Bills +3' }],
  votes: [
    { voterId: 'jack', name: 'Jack', optionId: 'a' },
    { voterId: 'jake', name: 'Jake', optionId: 'b' },
    { voterId: 'tyler', name: 'Tyler', optionId: 'b' },
  ],
};
// Right after Create: nobody has picked yet.
const FRESH_BET = { ...OPEN_BET, votes: [] };
// Named friends, two picks with no name and one very long name, so the
// voter lists under each bar show every case.
const FULL_BET = {
  ...OPEN_BET,
  votes: [
    ...OPEN_BET.votes,
    { voterId: 'maya', name: 'Maya', optionId: 'a' },
    { voterId: 'sam', name: 'Sam', optionId: 'a' },
    { voterId: 'anon-1', name: '', optionId: 'a' },
    { voterId: 'anon-2', name: '', optionId: 'a' },
    { voterId: 'bart', name: 'Bartholomew Maximilian Fitzgerald-Worthington the Third', optionId: 'b' },
  ],
};
// Jack made the bet but sat it out, so his settled tally shows the plain
// "who won" reveal rather than his own result.
const SAT_OUT_BET = { ...FULL_BET, votes: FULL_BET.votes.filter((vote) => vote.voterId !== 'jack') };
// Everyone took the favorite; settled on the other side, nobody called it.
const UPSET_BET = { ...FULL_BET, votes: FULL_BET.votes.map((vote) => ({ ...vote, optionId: 'a' })) };
// Called off by status alone, no calledOff flag, with a close time still
// ahead and Jack yet to pick: every open-bet cue would show if it read as open.
const CALLED_OFF_BET = {
  ...OPEN_BET,
  status: 'called-off',
  closesAt: Date.now() + 2 * 86400000,
  votes: OPEN_BET.votes.filter((vote) => vote.voterId !== 'jack'),
};
// Settled on side a, where every pick skipped their name: the reveal counts
// friends instead of naming anyone.
const UNNAMED_WINNERS_BET = {
  ...OPEN_BET,
  votes: [
    ...['anon-1', 'anon-2', 'anon-3'].map((voterId) => ({ voterId, name: '', optionId: 'a' })),
    { voterId: 'jake', name: 'Jake', optionId: 'b' },
    { voterId: 'tyler', name: 'Tyler', optionId: 'b' },
  ],
};
const CROWD_BET = {
  ...FULL_BET,
  votes: [
    ...FULL_BET.votes,
    ...['Kim', 'Lee', 'Ana', 'Ravi', 'Zoe', 'Omar'].map((name) => ({ voterId: name.toLowerCase(), name, optionId: 'a' })),
  ],
};
// The winner card at its limits: a question past three lines, long names
// and more winners than the reveal names.
const LONG_CARD_BET = {
  ...OPEN_BET,
  question: 'Will the whole crew make it to the cabin before midnight on Friday, with the snacks, '
    + 'the playlist sorted, and nobody taking the scenic route again this year?',
  stake: 'Loser buys the whole table brunch and does the dishes all weekend long',
  options: [{ id: 'a', label: 'Everyone there before midnight' }, { id: 'b', label: 'Somebody gets lost' }],
  votes: [
    { voterId: 'bart', name: 'Bartholomew Maximilian Fitzgerald-Worthington', optionId: 'a' },
    { voterId: 'anastasia', name: 'Anastasia Konstantinopoulou', optionId: 'a' },
    ...['Kim', 'Lee', 'Ana', 'Ravi'].map((name) => ({ voterId: name.toLowerCase(), name, optionId: 'a' })),
    { voterId: 'jake', name: 'Jake', optionId: 'b' },
  ],
};

// Taps Share as image with no share sheet (Chromium on Linux has none) and
// returns the PNG it downloads.
async function winnerCardPng(page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Share as image', exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Jack's bets for Friends on My bets. Jack picks on every settled one, so
// Maya (opened in friends-open.png) has a W, an L, a same-side bet with no
// pill, one called off and one still open.
const FRIEND_BETS = [
  { ...OPEN_BET, id: 'f1', code: 'f1', createdAt: 6, question: 'Chiefs cover -3?', status: 'closed', winnerId: 'a', settledAt: 6,
    votes: [...OPEN_BET.votes, { voterId: 'maya', name: 'Maya', optionId: 'b' }] },
  { ...OPEN_BET, id: 'f5', code: 'f5', createdAt: 5, question: 'First score a field goal?', stake: 'Coffee', status: 'closed', winnerId: 'b', settledAt: 5,
    votes: [{ voterId: 'jack', name: 'Jack', optionId: 'a' }, { voterId: 'maya', name: 'Maya', optionId: 'b' }, { voterId: 'sam', name: 'Sam', optionId: 'b' }] },
  { ...FULL_BET, id: 'f2', code: 'f2', createdAt: 4, question: 'Over 47.5 points?', stake: 'Loser buys wings', status: 'closed', winnerId: 'b', settledAt: 4 },
  { ...OPEN_BET, id: 'f3', code: 'f3', createdAt: 3, question: 'Game goes to overtime?', status: 'called-off',
    votes: [{ voterId: 'maya', name: 'Maya', optionId: 'a' }, { voterId: 'jake', name: 'Jake', optionId: 'b' }] },
  { ...FULL_BET, id: 'f4', code: 'f4', createdAt: 2, question: 'Mahomes throws 3 TDs?', stake: 'Coffee', status: 'open', closesAt: null },
];

async function serverUp() {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
}

async function startServer() {
  if (await serverUp()) return null;
  const vite = spawn('npm', ['run', 'mobile:dev'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 120; i += 1) {
    if (await serverUp()) return vite;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  process.kill(-vite.pid);
  throw new Error(`Vite did not start on ${BASE}.`);
}

// `bet` is the fixture every subscription sees. `settled` closes it with a
// real settlement snapshot built by the app's own buildSettlement: true
// settles on side a, or pass the winning option id. `shareSheet` gives the
// page a navigator.share (Chromium on Linux has none): 'open' never closes,
// like a sheet still on screen, and 'dismiss' is closed without sending.
// `ads` swaps in src/ads/config.js with the ads flag on, as the e2e does.
// `plan` is the signed-in user's entitlement (src/phone/entitlementApi.js is
// swapped too), and `paywall` turns the paywall flag on in proConfig.js.
// `bets` is My bets' whole list, when it should hold more than `bet`.
// `noUndo` makes Settle & notify come back with a number settledAt, as an
// older build wrote: no Undo, the one settle the ad still shows on.
async function fixtures(page, { user, name, bet, bets = null, settled = false, shareSheet = null, ads = false, plan = null, paywall = false, noUndo = false }) {
  const winnerId = settled === true ? 'a' : settled;
  await page.route(/(?:googleapis\.com|firebaseio\.com|firebaseapp\.com|gstatic\.com|google\.com)/, (route) => route.abort());
  await page.route('**/src/phone/identity.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `const user = ${JSON.stringify(user)};
      export const watchIdentity = (cb) => { cb(user); return () => {}; };
      export const useIdentity = () => user;
      export const useSignedInUser = () => user;
      export const savedName = () => ${JSON.stringify(name)};
      export const rememberName = () => {};
      export const creatorName = () => 'Jack';`,
  }));
  await page.route('**/src/phone/api.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `import { buildSettlement } from ${JSON.stringify(new URL('./settlement.js', route.request().url()).href)};
      let bet = ${JSON.stringify(bet)};
      const winnerId = ${JSON.stringify(winnerId || null)};
      if (winnerId) bet = { ...bet, status: 'closed', winnerId, settledAt: Date.now(), settlement: buildSettlement(bet, winnerId) };
      export const subscribeBet = (code, cb) => { cb(bet); return () => {}; };
      const bets = ${JSON.stringify(bets)};
      export const subscribeMyBets = (uid, cb) => { cb(bets || [bet]); return () => {}; };
      export const hydrateBet = async (b) => b;
      export const createBet = async () => ${JSON.stringify(CODE)};
      export const saveBet = async () => ${JSON.stringify(CODE)};
      export const castVote = async () => {};
      // settledAt null, as the real settleBet returns before the server time.
      export const settleBet = async (code, id) => ({ ...bet, status: 'closed', winnerId: id, settledAt: ${noUndo ? 'Date.now()' : 'null'}, settlement: buildSettlement(bet, id) });
      export const undoSettle = async () => ({ ...bet, status: 'open', winnerId: null });
      export const callOffBet = async () => ({ ...bet, status: 'closed', calledOff: true, settledAt: null });
      export const deleteBet = async () => {};`,
  }));
  await page.route('**/src/phone/routes.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `export function voteUrl(code) { return 'https://www.friendly-bets.com/b/' + encodeURIComponent(code); }`,
  }));
  await page.route('**/src/phone/entitlementApi.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `const plan = ${JSON.stringify(plan)};
      export const subscribeEntitlement = (uid, cb) => { cb(plan); return () => {}; };
      export const fetchFounderCount = async () => 12;
      export const requestMockPurchase = async () => ({ ok: true });`,
  }));
  if (paywall) {
    await page.route('**/src/phone/proConfig.js*', async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /export function proPaywallEnabled\(\) \{[\s\S]*?\n\}/,
        'export function proPaywallEnabled() { return true; }',
      );
      await route.fulfill({ response, body });
    });
  }
  if (ads) {
    await page.route('**/src/ads/config.js*', async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /export function adsEnabled\(\) \{[\s\S]*?\n\}/,
        'export function adsEnabled() { return true; }',
      );
      await route.fulfill({ response, body });
    });
  }
  if (shareSheet) {
    await page.addInitScript((mode) => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: () => (mode === 'open'
          ? new Promise(() => {})
          : Promise.reject(new DOMException('Share canceled', 'AbortError'))),
      });
    }, shareSheet);
  }
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = 'vite-error-overlay { display: none !important; } *, *::before, *::after { caret-color: transparent !important; }';
    document.addEventListener('DOMContentLoaded', () => document.head.append(style));
  });
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.locator('.friendly-load').waitFor({ state: 'detached' }).catch(() => {});
  await page.waitForTimeout(400);
}

// Scroll the screen so `selector` sits near the top, bringing the group's
// picks and their voter lists into view.
async function showBars(page, selector = '.results-heading') {
  await page.locator(selector).first().evaluate((node) => {
    const scroller = node.closest('.scroll');
    scroller.scrollTop += node.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24;
  });
}

// Create a bet the way a creator does; Create hands off to the live tally.
async function makeBet(page) {
  await page.goto('/new/money-line');
  await page.getByLabel(/Question/).fill('Chiefs cover -3?');
  await page.getByLabel('Option A').fill('Chiefs -3');
  await page.getByLabel('Option B').fill('Bills +3');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Stake', { exact: true }).fill('$20 pot');
  await page.getByRole('button', { name: 'Text friends', exact: true }).click();
  await page.waitForURL(`**/t/${CODE}`);
  await page.locator('.tally-share.is-nudge').waitFor();
}

// The tally's Text the crew with ads on: the web house ad comes up first.
async function inviteAd(page) {
  await page.goto(`/t/${CODE}`);
  await page.getByText('Updated live').waitFor();
  await page.getByRole('button', { name: 'Text the crew', exact: true }).click();
  await page.getByRole('dialog', { name: 'Ad', exact: true }).waitFor();
}

// Close & settle on the tally with ads on, Chiefs -3 wins: the house ad comes up.
async function settleAd(page) {
  await page.goto(`/t/${CODE}`);
  await page.getByText('Updated live').waitFor();
  await page.getByRole('button', { name: 'Close & settle', exact: true }).click();
  await page.getByRole('button', { name: 'Chiefs -3', exact: true }).click();
  await page.getByRole('button', { name: 'Settle & notify', exact: true }).click();
  await page.getByRole('dialog', { name: 'Ad', exact: true }).waitFor();
}

// Bring a control into view near the bottom of the tally.
async function showControl(page, locator) {
  await locator.evaluate((node) => {
    const scroller = node.closest('.scroll');
    scroller.scrollTop += node.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom + 24;
  });
}

async function openCallOff(page) {
  await page.goto(`/t/${CODE}`);
  await page.getByText('Updated live').waitFor();
  const button = page.getByRole('button', { name: 'Call off', exact: true });
  await button.waitFor();
  await showControl(page, button);
  return button;
}

const SHOTS = [
  {
    file: 'f8-call-off-button.png',
    docs: false,
    user: JACK,
    bet: OPEN_BET,
    run: openCallOff,
  },
  {
    file: 'f8-call-off-confirm.png',
    docs: false,
    user: JACK,
    bet: OPEN_BET,
    async run(page) {
      await (await openCallOff(page)).click();
      await page.getByRole('dialog', { name: 'Call off this bet?' }).waitFor();
    },
  },
  {
    file: 'f8-called-off.png',
    docs: false,
    user: JACK,
    bet: OPEN_BET,
    async run(page) {
      await (await openCallOff(page)).click();
      await page.getByRole('button', { name: 'Call off bet', exact: true }).click();
      await page.getByText('This bet was called off.').waitFor();
    },
  },
  {
    file: 'f8-undo-countdown.png',
    docs: false,
    user: JACK,
    bet: OPEN_BET,
    async run(page) {
      await page.goto(`/t/${CODE}`);
      await page.getByText('Updated live').waitFor();
      await page.getByRole('button', { name: 'Close & settle', exact: true }).click();
      await page.getByRole('button', { name: 'Chiefs -3', exact: true }).click();
      await page.getByRole('button', { name: 'Settle & notify', exact: true }).click();
      const undo = page.getByRole('button', { name: 'Undo', exact: true });
      await undo.waitFor();
      await page.locator('.reveal-wrap').evaluate((node) => {
        const scroller = node.closest('.scroll');
        scroller.scrollTop += node.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24;
      });
    },
  },
  {
    file: 'create-bet.png',
    user: JACK,
    bet: OPEN_BET,
    async run(page) {
      await page.goto('/new/money-line');
      await page.getByLabel(/Question/).fill('Chiefs cover -3?');
      await page.getByLabel('Option A').fill('Chiefs -3');
      await page.getByLabel('Option B').fill('Bills +3');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByLabel('Stake', { exact: true }).fill('$20 pot');
      await page.locator('.create-pane.is-leaving').waitFor({ state: 'detached' });
      await page.getByLabel('Stake', { exact: true }).blur();
    },
  },
  {
    file: 'text-the-crew.png',
    user: JACK,
    bet: FRESH_BET,
    run: makeBet,
  },
  {
    file: 'tally-after-create.png',
    docs: false,
    user: JACK,
    bet: FRESH_BET,
    shareSheet: 'open',
    run: makeBet,
  },
  {
    file: 'tally-after-create-dismissed.png',
    docs: false,
    user: JACK,
    bet: FRESH_BET,
    shareSheet: 'dismiss',
    async run(page) {
      await makeBet(page);
      await page.getByText('Saved. Text when you’re ready.').waitFor();
    },
  },
  {
    file: 'creator-vote-link.png',
    docs: false,
    user: JACK,
    bet: FRESH_BET,
    async run(page) {
      await makeBet(page);
      await page.getByRole('link', { name: 'Wanna vote?', exact: true }).waitFor();
    },
  },
  {
    file: 'tally-called-off.png',
    docs: false,
    user: JACK,
    bet: CALLED_OFF_BET,
    async run(page) {
      await page.goto(`/t/${CODE}`);
      await page.getByRole('region', { name: 'Settled result' }).waitFor();
    },
  },
  {
    file: 'vote-called-off.png',
    docs: false,
    user: MAYA,
    name: 'Maya',
    bet: CALLED_OFF_BET,
    async run(page) {
      await page.goto(`/b/${CODE}`);
      await page.getByRole('region', { name: 'Settled result' }).waitFor();
    },
  },
  {
    file: 'vote.png',
    user: MAYA,
    name: 'Maya',
    bet: OPEN_BET,
    async run(page) {
      await page.goto(`/b/${CODE}`);
      await page.getByRole('heading', { name: 'What’s your call?' }).waitFor();
    },
  },
  {
    file: 'live-tally.png',
    user: JACK,
    bet: FULL_BET,
    async run(page) {
      await page.goto(`/t/${CODE}`);
      await page.getByText('Updated live').waitFor();
      await showBars(page);
    },
  },
  {
    file: 'many-voters.png',
    docs: false,
    user: JACK,
    bet: CROWD_BET,
    async run(page) {
      await page.goto(`/t/${CODE}`);
      await page.getByText('Updated live').waitFor();
      await showBars(page);
    },
  },
  {
    file: 'settled.png',
    user: MAYA,
    name: 'Maya',
    bet: FULL_BET,
    settled: true,
    async run(page) {
      await page.goto(`/b/${CODE}`);
      await page.getByText('You called it.').waitFor();
      await showBars(page, '.reveal');
    },
  },
  {
    file: 'winner-b.png',
    docs: false,
    user: MAYA,
    name: 'Maya',
    bet: FULL_BET,
    settled: true,
    async run(page) {
      await page.goto(`/b/${CODE}`);
      await page.getByText('You called it.').waitFor();
      await showBars(page, '.reveal');
    },
  },
  {
    file: 'loser-b.png',
    docs: false,
    user: JAKE,
    name: 'Jake',
    bet: FULL_BET,
    settled: true,
    async run(page) {
      await page.goto(`/b/${CODE}`);
      await page.getByRole('link', { name: 'Start a bet', exact: true }).waitFor();
      await showBars(page, '.reveal');
    },
  },
  {
    file: 'creator-t.png',
    docs: false,
    user: JACK,
    bet: SAT_OUT_BET,
    settled: true,
    async run(page) {
      await page.goto(`/t/${CODE}`);
      await page.getByText('Bragging rights, secured.').waitFor();
      await showBars(page, '.reveal');
    },
  },
  {
    file: 'nobody-called-it.png',
    docs: false,
    user: MAYA,
    name: 'Maya',
    bet: UPSET_BET,
    settled: 'b',
    async run(page) {
      await page.goto(`/b/${CODE}`);
      await page.getByText('Nobody called it.').waitFor();
      await showBars(page, '.reveal');
    },
  },
  {
    file: 'reveal-unnamed-winners.png',
    docs: false,
    user: MAYA,
    name: 'Maya',
    bet: UNNAMED_WINNERS_BET,
    settled: true,
    async run(page) {
      await page.goto(`/b/${CODE}`);
      await page.getByText('3 friends called it.').waitFor();
      await showBars(page, '.reveal');
    },
  },
  {
    file: 'house-ad.png',
    docs: false,
    user: JACK,
    bet: OPEN_BET,
    shareSheet: 'open',
    ads: true,
    run: inviteAd,
  },
  {
    file: 'thank-you.png',
    docs: false,
    user: JACK,
    bet: OPEN_BET,
    shareSheet: 'open',
    ads: true,
    async run(page) {
      await inviteAd(page);
      await page.getByRole('button', { name: 'Close ad' }).click();
      await page.getByRole('dialog', { name: 'Thanks for watching. That keeps Friendly free.' }).waitFor();
    },
  },
  {
    file: 'settle-house-ad.png',
    docs: false,
    user: JACK,
    bet: OPEN_BET,
    ads: true,
    noUndo: true,
    run: settleAd,
  },
  {
    file: 'settle-thank-you.png',
    docs: false,
    user: JACK,
    bet: OPEN_BET,
    ads: true,
    noUndo: true,
    async run(page) {
      // Held on the thank-you, which would otherwise continue after 1.5 s.
      await page.clock.install();
      await settleAd(page);
      await page.getByRole('button', { name: 'Close ad' }).click();
      await page.getByRole('dialog', { name: 'Thanks for watching. That keeps Friendly free.' }).waitFor();
      await page.clock.pauseAt(Date.now() + 200);
    },
  },
  {
    file: 'settle-reveal-after-ad.png',
    docs: false,
    user: JACK,
    bet: OPEN_BET,
    ads: true,
    noUndo: true,
    async run(page) {
      await settleAd(page);
      await page.getByRole('button', { name: 'Close ad' }).click();
      await page.getByRole('dialog', { name: 'Thanks for watching. That keeps Friendly free.' }).waitFor({ state: 'detached' });
      await page.getByRole('region', { name: 'Settled result' }).waitFor();
    },
  },
  {
    file: 'results-open.png',
    docs: false,
    user: MAYA,
    name: 'Maya',
    bet: FULL_BET,
    settled: true,
    async run(page) {
      await page.goto(`/b/${CODE}`);
      await page.getByRole('button', { name: /^Results/ }).click();
      await page.getByRole('dialog', { name: 'The final word' }).waitFor();
    },
  },
  {
    file: 'paywall.png',
    docs: false,
    user: JACK,
    bet: OPEN_BET,
    paywall: true,
    async run(page) {
      await page.goto('/pro');
      await page.getByText('Founder: $40 once, Pro for life. First 100 only.').waitFor();
    },
  },
  {
    file: 'pro-badge.png',
    docs: false,
    user: JACK,
    bet: FULL_BET,
    plan: { plan: 'founder', source: 'mock', founderNumber: 12, expiresAt: null },
    async run(page) {
      await page.goto(`/t/${CODE}`);
      await page.locator('.voter-name .pro-badge').waitFor();
      await showBars(page);
    },
  },
  {
    file: 'tally-pro-no-ad.png',
    docs: false,
    user: JACK,
    bet: OPEN_BET,
    shareSheet: 'dismiss',
    ads: true,
    plan: { plan: 'pro', source: 'mock', expiresAt: null },
    async run(page) {
      await page.goto(`/t/${CODE}`);
      await page.getByText('Updated live').waitFor();
      await page.getByRole('button', { name: 'Text the crew', exact: true }).click();
      await page.getByText('Saved. Text when you’re ready.').waitFor();
      if (await page.getByRole('dialog').count()) throw new Error('an ad showed for a Pro member');
    },
  },
  {
    file: 'friends.png',
    docs: false,
    user: JACK,
    bet: OPEN_BET,
    bets: FRIEND_BETS,
    async run(page) {
      await page.goto('/bets');
      await page.getByRole('button', { name: /^Friends/ }).click();
      await page.getByRole('region', { name: 'Head to head' }).waitFor();
      await showBars(page, '.bets-toolbar');
    },
  },
  {
    file: 'friends-open.png',
    docs: false,
    user: JACK,
    bet: OPEN_BET,
    bets: FRIEND_BETS,
    async run(page) {
      await page.goto('/bets');
      await page.getByRole('button', { name: /^Friends/ }).click();
      await page.getByRole('button', { name: /^Maya/ }).click();
      await showBars(page, '.friend-row[aria-expanded="true"]');
    },
  },
  {
    file: 'winner-card-reveal.png',
    docs: false,
    user: JAKE,
    name: 'Jake',
    bet: SAT_OUT_BET,
    settled: true,
    async run(page) {
      await page.goto(`/b/${CODE}`);
      await page.getByRole('button', { name: 'Share as image', exact: true }).waitFor();
      await showBars(page, '.reveal');
    },
  },
  {
    file: 'winner-card.png',
    docs: false,
    user: JAKE,
    name: 'Jake',
    bet: SAT_OUT_BET,
    settled: true,
    async run(page) {
      await page.goto(`/b/${CODE}`);
      await page.getByRole('button', { name: 'Share as image', exact: true }).waitFor();
    },
    capture: winnerCardPng,
  },
  {
    file: 'winner-card-long.png',
    docs: false,
    user: JAKE,
    name: 'Jake',
    bet: LONG_CARD_BET,
    settled: true,
    async run(page) {
      await page.goto(`/b/${CODE}`);
      await page.getByRole('button', { name: 'Share as image', exact: true }).waitFor();
    },
    capture: winnerCardPng,
  },
];

const args = process.argv.slice(2);
const copyTo = args.find((arg) => arg.startsWith('--copy-to='))?.slice('--copy-to='.length);
const only = args.filter((arg) => !arg.startsWith('--'));
const server = await startServer();
const browser = await chromium.launch();
let failed = false;
try {
  await mkdir(OUT, { recursive: true });
  if (copyTo) await mkdir(copyTo, { recursive: true });
  const picked = SHOTS.filter((item) => (only.length ? only.includes(item.file) : item.docs !== false || copyTo));
  for (const shot of picked) {
    const context = await browser.newContext({
      baseURL: BASE,
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await fixtures(page, { user: shot.user, name: shot.name || '', bet: shot.bet, bets: shot.bets, settled: shot.settled, shareSheet: shot.shareSheet, ads: shot.ads, plan: shot.plan, paywall: shot.paywall, noUndo: shot.noUndo });
    await shot.run(page);
    await settle(page);
    if (errors.length) throw new Error(`${shot.file}: ${errors.join('; ')}`);
    // A shot with `capture` saves the image the app made, as it made it.
    const png = shot.capture ? await shot.capture(page) : await page.screenshot({ animations: 'disabled' });
    const optimized = shot.capture ? png : await sharp(png).png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 }).toBuffer();
    if (shot.docs !== false) await writeFile(`${OUT}${shot.file}`, optimized);
    if (copyTo) await writeFile(join(copyTo, shot.file), optimized);
    console.log(`${shot.file}  ${(optimized.length / 1024).toFixed(0)} KB`);
    await context.close();
  }
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await browser.close();
  if (server) process.kill(-server.pid);
}
process.exit(failed ? 1 : 0);
