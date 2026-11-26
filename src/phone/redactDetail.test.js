import { redactDetail, redactDigits } from './redactDetail';

describe('redactDigits', () => {
  test.each([
    ['slashes 555/123/4567', 'slashes [redacted]'],
    ['underscores 555_123_4567', 'underscores [redacted]'],
    ['commas 555,123,4567', 'commas [redacted]'],
    ['en dash 555–123–4567', 'en dash [redacted]'],
    ['arabic ٥٥٥١٢٣٤٥٦٧', 'arabic [redacted]'],
    ['nbsp 555 123 4567', 'nbsp [redacted]'],
    ['call +1 (555) 123-4567 now', 'call [redacted] now'],
    ['dots 555.123.4567', 'dots [redacted]'],
    ['code 123456 stays', 'code 123456 stays'],
    ['error 1', 'error 1'],
    ['RuntimeError error 1.)', 'RuntimeError error 1.)'],
    // Letters break a run, so short groups around words survive.
    ['iOS 17 build 22A3354', 'iOS 17 build 22A3354'],
    // Four separators between digit groups also break a run.
    ['555 -- 123 -- 4567', '555 -- 123 -- 4567'],
    // 7+ digits bridged only by non-letters are redacted, even across a version.
    ['v 1.2.3 4.5.6.7', 'v [redacted]'],
  ])('%p -> %p', (input, output) => {
    expect(redactDigits(input)).toBe(output);
  });

  test('no digits of a 10 digit number survive in any script', () => {
    const out = redactDigits('x ٥٥٥ ١٢٣-٤٥٦٧ y');
    expect(out).toBe('x [redacted] y');
  });
});

describe('redactDetail', () => {
  test('redacts then truncates', () => {
    expect(redactDetail(`555/123/4567 ${'a'.repeat(400)}`).startsWith('[redacted] ')).toBe(true);
    expect(redactDetail('a'.repeat(400))).toHaveLength(160);
  });
});
