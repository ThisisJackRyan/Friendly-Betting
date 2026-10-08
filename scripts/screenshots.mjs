// Regenerates the README screenshots in docs/screenshots.
//
//   npm run screenshots
//   npm run screenshots -- live-tally.png settled.png --copy-to=/tmp/shots
//
// File names pick shots; --copy-to also writes each image to that directory.
// Shots marked docs: false (many-voters.png, settled-tally.png, results-open.png)
// only go to --copy-to.
//
// Drives the Vite app preview (npm run mobile:dev) in Playwright's Chromium at
// iPhone size. Every Google/Firebase request is aborted and the two data
// modules (src/phone/identity.js, src/phone/api.js) are swapped for fixtures
// in the browser, the same way mobile/e2e/app.spec.js does. Nothing here
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
// real settlement snapshot built by the app's own buildSettlement.
async function fixtures(page, { user, name, bet, settled = false }) {
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
      if (${settled}) bet = { ...bet, status: 'closed', winnerId: 'a', settledAt: Date.now(), settlement: buildSettlement(bet, 'a') };
      export const subscribeBet = (code, cb) => { cb(bet); return () => {}; };
      export const subscribeMyBets = (uid, cb) => { cb([bet]); return () => {}; };
      export const hydrateBet = async (b) => b;
      export const createBet = async () => ${JSON.stringify(CODE)};
      export const saveBet = async () => ${JSON.stringify(CODE)};
      export const castVote = async () => {};
      export const settleBet = async () => bet;
      export const deleteBet = async () => {};`,
  }));
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
    bet: OPEN_BET,
    async run(page) {
      await page.goto('/new/money-line');
      await page.getByLabel(/Question/).fill('Chiefs cover -3?');
      await page.getByLabel('Option A').fill('Chiefs -3');
      await page.getByLabel('Option B').fill('Bills +3');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByLabel('Stake', { exact: true }).fill('$20 pot');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByText('Put the group chat on the line.').waitFor();
      await page.locator('.create-pane.is-leaving').waitFor({ state: 'detached' });
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
      await page.getByText('Bragging rights, secured.').first().waitFor();
      await showBars(page, '.result-card');
    },
  },
  {
    file: 'settled-tally.png',
    docs: false,
    user: MAYA,
    name: 'Maya',
    bet: FULL_BET,
    settled: true,
    async run(page) {
      await page.goto(`/b/${CODE}`);
      await page.getByText('Bragging rights, secured.').first().waitFor();
      await showBars(page);
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
    await fixtures(page, { user: shot.user, name: shot.name || '', bet: shot.bet, settled: shot.settled });
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
