/** @jest-environment node */
const { cleanName, planBackfill } = require('./backfill-votes-plan.cjs');
const { cleanName: appCleanName } = require('../src/phone/votes');

const bet = (votes, extra = {}) => ({ createdAt: 1000, votes, ...extra });

test('each array voter gets a doc with their side, name and time', () => {
  const plan = planBackfill(bet([
    { voterId: 'jack', name: ' Jack ', optionId: 'a', at: 5000 },
    { voterId: 'sam', name: 'Sam', optionId: 'b', at: 6000 },
  ]));
  expect(plan.creates).toEqual([
    { id: 'jack', voterId: 'jack', name: 'Jack', optionId: 'a', atMs: 5000 },
    { id: 'sam', voterId: 'sam', name: 'Sam', optionId: 'b', atMs: 6000 },
  ]);
  expect(plan.clear).toBe(false);
});

test('idempotent: a voter who already has a doc is skipped, the doc wins', () => {
  const plan = planBackfill(bet([{ voterId: 'jack', name: 'Jack', optionId: 'a', at: 5 }]), new Set(['jack']));
  expect(plan.creates).toEqual([]);
  expect(plan.skipped.hasDoc).toBe(1);
});

test('a voter listed twice gets one doc, from their last entry', () => {
  const plan = planBackfill(bet([
    { voterId: 'jack', name: 'Jack', optionId: 'a', at: 5 },
    { voterId: 'jack', name: 'Jackie', optionId: 'b', at: 9 },
  ]));
  expect(plan.creates).toEqual([{ id: 'jack', voterId: 'jack', name: 'Jackie', optionId: 'b', atMs: 9 }]);
  expect(plan.skipped.duplicate).toBe(1);
});

test('names are capped like the app; untimed entries keep their order', () => {
  const plan = planBackfill(bet([
    { voterId: 'a1', name: 'x'.repeat(40), optionId: 'a' },
    { voterId: 'b2', optionId: 'b' },
  ]));
  expect(plan.creates.map((item) => [item.name, item.atMs])).toEqual([['x'.repeat(30), 1000], ['', 1001]]);
  for (const name of ['  Jo ', '🎉'.repeat(16), `${'a'.repeat(29)} b`, '']) {
    expect(cleanName(name)).toBe(appCleanName(name));
  }
});

test('entries with no voterId or side are skipped and keep the array from being cleared', () => {
  const plan = planBackfill(bet([
    { name: 'Old', optionId: 'a' },
    { voterId: 'sam', optionId: null },
    { voterId: 'a/b', optionId: 'a' },
    { voterId: 'jack', optionId: 'a', at: 3 },
  ]), new Set(), { clearArray: true });
  expect(plan.creates.map((item) => item.id)).toEqual(['jack']);
  expect(plan.skipped).toMatchObject({ noVoterId: 2, badOptionId: 1 });
  expect(plan.clear).toBe(false);
});

test('--clear-array empties the array only when every entry has a doc', () => {
  const votes = [{ voterId: 'jack', optionId: 'a', at: 3 }, { voterId: 'sam', optionId: 'b', at: 4 }];
  expect(planBackfill(bet(votes), new Set(['sam']), { clearArray: true })).toMatchObject({ clear: true });
  expect(planBackfill(bet(votes), new Set(), { clearArray: false })).toMatchObject({ clear: false });
  expect(planBackfill(bet([]), new Set(), { clearArray: true })).toMatchObject({ creates: [], clear: false });
  expect(planBackfill({ createdAt: 1 }, new Set(), { clearArray: true })).toMatchObject({ creates: [], clear: false });
});
