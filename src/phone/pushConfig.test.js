import { MAX_PUSH_DEVICES, pushEnabled, validDeviceId, validPushPlatform, validPushToken } from './pushConfig';

const saved = process.env.NEXT_PUBLIC_PUSH_ENABLED;

afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  else process.env.NEXT_PUBLIC_PUSH_ENABLED = saved;
});

test('push defaults off', () => {
  delete process.env.NEXT_PUBLIC_PUSH_ENABLED;
  expect(pushEnabled()).toBe(false);
});

test.each(['', '0', 'true', 'TRUE', 'yes', 'on', ' 1', '1 ', '01', '2'])('%p is off', (value) => {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = value;
  expect(pushEnabled()).toBe(false);
});

test('exactly 1 is on', () => {
  process.env.NEXT_PUBLIC_PUSH_ENABLED = '1';
  expect(pushEnabled()).toBe(true);
});

test('validators accept a per-install id, an opaque token and ios or android only', () => {
  expect(MAX_PUSH_DEVICES).toBe(10);
  expect(validDeviceId('3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f')).toBe(true);
  ['', 'short', 'a/b/c/d/e/f', 'x'.repeat(129), 'has space here', null, 42].forEach((id) => expect(validDeviceId(id)).toBe(false));
  expect(validPushToken('dGVzdA:APA91bH-abc_123')).toBe(true);
  ['', ' ', 'two words', 'x'.repeat(4097), 'line\nbreak', null, {}].forEach((t) => expect(validPushToken(t)).toBe(false));
  expect(validPushPlatform('ios')).toBe(true);
  expect(validPushPlatform('android')).toBe(true);
  ['web', 'iOS', '', undefined].forEach((p) => expect(validPushPlatform(p)).toBe(false));
});
