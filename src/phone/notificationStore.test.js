import { markResultRead, rememberBet, watchResults } from './notificationStore';

afterEach(() => jest.restoreAllMocks());

test('registrations and read receipts are deduplicated and scoped to the participant', () => {
  const changed = jest.fn();
  const stop = watchResults('store-player', changed);
  rememberBet('store-player', 'abc123');
  rememberBet('store-player', 'abc123');
  markResultRead('store-player', 'abc123:123');
  markResultRead('store-player', 'abc123:123');
  expect(changed).toHaveBeenLastCalledWith({ codes: ['abc123'], read: ['abc123:123'] });
  expect(changed).toHaveBeenCalledTimes(3);
  const other = jest.fn();
  const stopOther = watchResults('store-other', other);
  expect(other).toHaveBeenLastCalledWith({ codes: [], read: [] });
  stop();
  stopOther();
});

test('a full browser store keeps new picks and read receipts for the current visit', () => {
  rememberBet('quota-player', 'oldbet');
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
  const changed = jest.fn();
  const stop = watchResults('quota-player', changed);
  rememberBet('quota-player', 'newbet');
  markResultRead('quota-player', 'newbet:123');
  expect(changed).toHaveBeenLastCalledWith({ codes: ['oldbet', 'newbet'], read: ['newbet:123'] });
  stop();
});

test('corrupt browser data does not become a Firestore document subscription', () => {
  localStorage.setItem('fb.results.corrupt-player', JSON.stringify({ codes: [null, 'bad/path'], read: [] }));
  const changed = jest.fn();
  const stop = watchResults('corrupt-player', changed);
  expect(changed).toHaveBeenLastCalledWith({ codes: [], read: [] });
  stop();
});
