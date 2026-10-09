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
// and vote-called-off.png)
// only go to --copy-to.
//
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
const BASE = 'http://127.0.0.1:5173';
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
const CROWD_BET = {
  ...FULL_BET,
  votes: [
    ...FULL_BET.votes,
    ...['Kim', 'Lee', 'Ana', 'Ravi', 'Zoe', 'Omar'].map((name) => ({ voterId: name.toLowerCase(), name, optionId: 'a' })),
  ],
};

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
async function fixtures(page, { user, name, bet, settled = false, shareSheet = null }) {
  const winnerId = settled === true ? 'a' : settled;
  await page.route(/(?:googleapis\.com|firebaseio\.com|firebaseapp\.com|gstatic\.com|google\.com)/, (route) => route.abort());
  await page.route('**/src/phone/identity.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `const user = ${JSON.stringify(user)};
      export const watchIdentity = (cb) => { cb(user); return () => {}; };
      export const useIdentity = () => user;
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
      export const subscribeMyBets = (uid, cb) => { cb([bet]); return () => {}; };
      export const hydrateBet = async (b) => b;
      export const createBet = async () => ${JSON.stringify(CODE)};
      export const saveBet = async () => ${JSON.stringify(CODE)};
      export const castVote = async () => {};
      export const settleBet = async () => bet;
      export const deleteBet = async () => {};`,
  }));
  await page.route('**/src/phone/routes.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `export function voteUrl(code) { return 'https://www.friendly-bets.com/b/' + encodeURIComponent(code); }`,
  }));
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

const SHOTS = [
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
    await fixtures(page, { user: shot.user, name: shot.name || '', bet: shot.bet, settled: shot.settled, shareSheet: shot.shareSheet });
    await shot.run(page);
    await settle(page);
    if (errors.length) throw new Error(`${shot.file}: ${errors.join('; ')}`);
    const png = await page.screenshot({ animations: 'disabled' });
    const optimized = await sharp(png).png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 }).toBuffer();
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
