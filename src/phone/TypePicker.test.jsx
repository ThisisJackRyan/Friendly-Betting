import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TypePicker, { visibleEarlyTypes } from './TypePicker';
import EntitlementSync from './EntitlementSync';
import { subscribeEntitlement } from './entitlementApi';
import { __resetEntitlementForTests } from './useEntitlement';

jest.mock('next/navigation');
jest.mock('./identity', () => {
  const jack = { uid: 'jack', providerData: [{ providerId: 'phone' }] };
  return { useIdentity: () => jack, useSignedInUser: () => jack };
});

const FAKE = [{ id: 'fake-type', label: 'Fake Type', hint: 'Only in tests.' }];
const flag = process.env.NEXT_PUBLIC_PRO_EARLY_TYPES;

function asMember(entitlement) {
  subscribeEntitlement.mockImplementation((_uid, onChange) => {
    onChange(entitlement);
    return () => {};
  });
}

beforeEach(() => {
  __resetEntitlementForTests();
  subscribeEntitlement.mockReset();
  asMember(null);
});

afterEach(() => {
  if (flag === undefined) delete process.env.NEXT_PUBLIC_PRO_EARLY_TYPES;
  else process.env.NEXT_PUBLIC_PRO_EARLY_TYPES = flag;
});

function picker(entitlement, onPick = jest.fn()) {
  asMember(entitlement);
  render(<><EntitlementSync /><TypePicker onPick={onPick} earlyTypes={FAKE} /></>);
  return onPick;
}

test('flag on and Pro: early types follow the regular ones and can be picked', async () => {
  process.env.NEXT_PUBLIC_PRO_EARLY_TYPES = '1';
  const onPick = picker({ plan: 'pro' });
  const buttons = screen.getAllByRole('button');
  expect(buttons).toHaveLength(4);
  expect(buttons[3]).toHaveTextContent('Fake Type');
  expect(buttons[3]).toHaveTextContent('Pro');
  await userEvent.click(buttons[3]);
  expect(onPick).toHaveBeenCalledWith('fake-type');
});

test('flag on but not Pro: no early types', () => {
  process.env.NEXT_PUBLIC_PRO_EARLY_TYPES = '1';
  picker(null);
  expect(screen.getAllByRole('button')).toHaveLength(3);
  expect(screen.queryByText('Fake Type')).toBeNull();
});

test('flag off: no early types, even for a founder', () => {
  delete process.env.NEXT_PUBLIC_PRO_EARLY_TYPES;
  picker({ plan: 'founder', founderNumber: 1 });
  expect(screen.getAllByRole('button')).toHaveLength(3);
});

test('visibleEarlyTypes gates on both, and defaults to the shipped empty list', () => {
  process.env.NEXT_PUBLIC_PRO_EARLY_TYPES = '1';
  expect(visibleEarlyTypes({ isPro: true, earlyTypes: FAKE })).toBe(FAKE);
  expect(visibleEarlyTypes({ isPro: true })).toEqual([]);
  expect(visibleEarlyTypes({ isPro: false, earlyTypes: FAKE })).toEqual([]);
  act(() => { delete process.env.NEXT_PUBLIC_PRO_EARLY_TYPES; });
  expect(visibleEarlyTypes({ isPro: true, earlyTypes: FAKE })).toEqual([]);
});
