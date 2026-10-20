import { test, expect } from '@playwright/test';

// Share as image on the settled reveal. Same mocking as app.spec.js: identity
// and api are swapped in the browser, and every Google/Firebase request is
// aborted.
test.beforeEach(async ({ page }) => {
  await page.route(/(?:googleapis\.com|firebaseio\.com|firebaseapp\.com)/, (route) => route.abort());
});

const crewBet = {
  id: 'crew123', code: 'crew123', schemaVersion: 2, type: 'money-line', typeLabel: 'Money Line',
  question: 'Who takes the win?', stake: '$20 pot', status: 'open', closesAt: null,
  createdByID: 'jack', createdByName: 'Jack', createdAt: 1,
  options: [{ id: 'a', label: 'Bears' }, { id: 'b', label: 'Packers' }],
  votes: [
    { voterId: 'jack', name: 'Jack', optionId: 'a' },
    { voterId: 'maya', name: 'Maya', optionId: 'a' },
    { voterId: 'sam', name: 'Sam', optionId: 'b' },
  ],
};

// `state`: 'settled', 'called-off' or 'open'.
async function mockBet(page, { state = 'settled', uid = 'jack' } = {}) {
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
      const open = ${JSON.stringify(crewBet)};
      const state = ${JSON.stringify(state)};
      const bet = state === 'settled'
        ? { ...open, status: 'closed', winnerId: 'a', settledAt: 123, settlement: buildSettlement(open, 'a') }
        : state === 'called-off' ? { ...open, status: 'called-off' } : open;
      export const subscribeBet = (code, cb) => { cb(bet); return () => {}; };
      export const subscribeMyBets = (uid, cb) => { cb([bet]); return () => {}; };
      export const hydrateBet = async b => b;
      export const createBet = async () => 'crew123';
      export const saveBet = async () => 'crew123';
      export const castVote = async () => {};
      export const deleteBet = async () => {};
      export const settleBet = async () => bet;`,
  }));
}

// A browser whose share sheet takes files: what it was handed lands on window.
async function fileShareSheet(page) {
  await page.addInitScript(() => {
    window.sharedFiles = [];
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data) => Boolean(data?.files?.length) && data.files.every((file) => file instanceof File),
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data) => {
        for (const file of data.files || []) {
          const bytes = Array.from(new Uint8Array(await file.arrayBuffer()).slice(0, 8));
          const bitmap = await createImageBitmap(file);
          window.sharedFiles.push({ name: file.name, type: file.type, size: file.size, bytes, width: bitmap.width, height: bitmap.height });
        }
        window.sharedText = data.text ?? null;
      },
    });
  });
}

// No share sheet at all: a desktop browser.
async function noShareSheet(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
  });
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const imageButton = (page) => page.getByRole('button', { name: 'Share as image', exact: true });

test('settled: Share as image hands the share sheet a 1080x1350 PNG', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockBet(page);
  await fileShareSheet(page);
  await page.goto('/t/crew123');
  await expect(page.getByRole('region', { name: 'Settled result' })).toContainText('Bears won');
  await expect(page.getByRole('button', { name: 'Share the result', exact: true })).toBeVisible();
  await expect(imageButton(page)).toBeVisible();
  await imageButton(page).click();
  await expect(page.getByRole('status').filter({ hasText: 'The group chat gets the final word.' })).toBeVisible();
  const files = await page.evaluate(() => window.sharedFiles);
  expect(files).toHaveLength(1);
  expect(files[0]).toMatchObject({ name: 'friendly-result.png', type: 'image/png', width: 1080, height: 1350, bytes: PNG_SIGNATURE });
  expect(files[0].size).toBeGreaterThan(5000);
  expect(errors).toEqual([]);
});

test('settled with no share sheet: Share as image downloads the PNG', async ({ page }) => {
  await mockBet(page, { uid: 'maya' });
  await noShareSheet(page);
  await page.goto('/b/crew123');
  await expect(page.getByRole('region', { name: 'Settled result' })).toContainText('You called it.');
  const download = page.waitForEvent('download');
  await imageButton(page).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('friendly-result.png');
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  // IHDR: width and height, big-endian, right after the signature.
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1080, 1350]);
  await expect(page.getByRole('status').filter({ hasText: 'Image saved. Drop it in the group chat.' })).toBeVisible();
});

test('in the app without a file share sheet, the card shows to press and hold', async ({ page }) => {
  await page.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android' }; });
  await mockBet(page);
  await noShareSheet(page);
  await page.goto('/t/crew123');
  await imageButton(page).click();
  await expect(page.getByRole('status').filter({ hasText: 'Press and hold the card to save it.' })).toBeVisible();
  const preview = page.locator('img.result-share-preview');
  await expect(preview).toBeVisible();
  expect(await preview.evaluate((img) => [img.naturalWidth, img.naturalHeight])).toEqual([1080, 1350]);
});

for (const route of ['/t/crew123', '/b/crew123']) {
  test(`called off on ${route}: no Share as image`, async ({ page }) => {
    await mockBet(page, { state: 'called-off', uid: route.startsWith('/t/') ? 'jack' : 'maya' });
    await fileShareSheet(page);
    await page.goto(route);
    await expect(page.getByRole('region', { name: 'Settled result' })).toContainText('This bet was called off.');
    await expect(imageButton(page)).toHaveCount(0);
  });
}

test('an open tally has no Share as image', async ({ page }) => {
  await mockBet(page, { state: 'open' });
  await fileShareSheet(page);
  await page.goto('/t/crew123');
  await expect(page.getByRole('button', { name: 'Text the crew', exact: true })).toBeVisible();
  await expect(imageButton(page)).toHaveCount(0);
});
