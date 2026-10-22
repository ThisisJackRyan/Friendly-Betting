import { cleanName, mergeVotes, NAME_MAX, voteFromDoc, withVotes } from './votes';

const at = (seconds) => ({ seconds, nanoseconds: 0 });

describe('cleanName', () => {
  test('trims and caps at 30', () => {
    expect(NAME_MAX).toBe(30);
    expect(cleanName('  Jack  ')).toBe('Jack');
    expect(cleanName('x'.repeat(31))).toBe('x'.repeat(30));
    expect(cleanName(`${'a'.repeat(29)} b`)).toBe('a'.repeat(29));
    expect(cleanName(null)).toBe('');
    expect(cleanName(undefined)).toBe('');
  });

  test('counts an emoji as 2, like the rules and maxLength, and never splits one', () => {
    expect(cleanName('🎉'.repeat(16))).toBe('🎉'.repeat(15));
    expect(cleanName(`${'a'.repeat(29)}🎉`)).toBe('a'.repeat(29));
  });
});

describe('voteFromDoc', () => {
  test('reads a doc into the array shape, the time in ms', () => {
    expect(voteFromDoc('sam', { voterId: 'sam', name: 'Sam', optionId: 'a', at: at(2) }))
      .toEqual({ voterId: 'sam', name: 'Sam', optionId: 'a', at: 2000 });
    expect(voteFromDoc('sam', { optionId: 'a', at: null })).toEqual({ voterId: 'sam', name: '', optionId: 'a', at: null });
    expect(voteFromDoc('sam', undefined)).toBeNull();
  });
});

describe('mergeVotes', () => {
  const jack = { voterId: 'jack', name: 'Jack', optionId: 'a', at: 1000 };
  const sam = { voterId: 'sam', name: 'Sam', optionId: 'b', at: 2000 };

  test('the array alone comes back as it is', () => {
    const list = [jack, sam];
    expect(mergeVotes(list, [])).toEqual(list);
    expect(mergeVotes(undefined, undefined)).toEqual([]);
  });

  test('vote docs join the array, in the order the picks were cast', () => {
    const maya = { voterId: 'maya', name: 'Maya', optionId: 'a', at: 1500 };
    expect(mergeVotes([jack, sam], [maya])).toEqual([jack, maya, sam]);
  });

  test('a voter\'s doc wins over their array entry', () => {
    const samDoc = { voterId: 'sam', name: 'Sammy', optionId: 'a', at: 3000 };
    expect(mergeVotes([jack, sam], [samDoc])).toEqual([jack, samDoc]);
  });

  test('a renamed array pick copied to a doc moves to its new time', () => {
    const jackDoc = { ...jack, name: 'John', at: 5000 };
    expect(mergeVotes([jack, sam], [jackDoc])).toEqual([sam, jackDoc]);
  });

  test('a voter listed twice in the array counts once, at their last entry', () => {
    const again = { ...jack, optionId: 'b', at: 3000 };
    expect(mergeVotes([jack, sam, again], [])).toEqual([sam, again]);
  });

  test('entries with no voterId or time keep their place ahead of timed docs', () => {
    const old = { name: 'Old', optionId: 'a' };
    const untimed = { voterId: 'lee', name: 'Lee', optionId: 'b' };
    const doc = { voterId: 'maya', name: 'Maya', optionId: 'a', at: 10 };
    expect(mergeVotes([old, untimed], [doc])).toEqual([old, untimed, doc]);
  });

  test('a pending doc with no server time yet sorts with the untimed', () => {
    const pending = { voterId: 'maya', name: 'Maya', optionId: 'a', at: null };
    expect(mergeVotes([jack], [pending])).toEqual([pending, jack]);
  });
});

test('withVotes puts the merged list on the bet, and leaves a missing bet alone', () => {
  const bet = { id: 'abc', votes: [{ voterId: 'jack', optionId: 'a', at: 1 }] };
  expect(withVotes(bet, [{ voterId: 'sam', optionId: 'b', at: 2 }]).votes.map((vote) => vote.voterId)).toEqual(['jack', 'sam']);
  expect(withVotes(null, [])).toBeNull();
  expect(withVotes(undefined, [])).toBeUndefined();
});
