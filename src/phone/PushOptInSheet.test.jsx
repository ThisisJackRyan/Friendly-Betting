import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PushOptInSheet from './PushOptInSheet';
import { acceptPushOptIn, declinePushOptIn } from './pushOptIn';
import { PUSH_COPY } from './pushCopy';

jest.mock('./pushOptIn', () => ({
  acceptPushOptIn: jest.fn(async () => 'granted'),
  declinePushOptIn: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

function renderSheet() {
  const onDone = jest.fn();
  render(<PushOptInSheet onDone={onDone} />);
  return onDone;
}

test('shows the UX copy verbatim, with the strings as accessible names', () => {
  renderSheet();
  const dialog = screen.getByRole('dialog', { name: 'Want to know when friends pick?' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveAccessibleDescription('We’ll ping you when picks come in and when it’s settled.');
  expect(screen.getByRole('heading', { name: PUSH_COPY.sheetTitle })).toBeInTheDocument();
  expect(screen.getByText(PUSH_COPY.sheetBody)).toBeInTheDocument();
  // Primary: the green 56px .cta. Decline: a muted text button, not a 56px one.
  expect(screen.getByRole('button', { name: 'Turn on notifications' })).toHaveClass('cta');
  const later = screen.getByRole('button', { name: 'Not now' });
  expect(later).toHaveClass('push-sheet-later');
  expect(later).not.toHaveClass('cta');
  expect(later).not.toHaveClass('dialog-keep');
  // Nothing else on the sheet says anything.
  expect(screen.getAllByRole('button')).toHaveLength(2);
});

test('"Not now" declines softly: no OS prompt, done once', async () => {
  const onDone = renderSheet();
  await userEvent.click(screen.getByRole('button', { name: PUSH_COPY.notNow }));
  expect(declinePushOptIn).toHaveBeenCalledTimes(1);
  expect(acceptPushOptIn).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledTimes(1);
});

test('the scrim and Escape are a soft decline too', async () => {
  const onDone = renderSheet();
  await userEvent.click(document.querySelector('.push-sheet-scrim'));
  expect(declinePushOptIn).toHaveBeenCalledTimes(1);
  expect(onDone).toHaveBeenCalledTimes(1);

  const again = jest.fn();
  render(<PushOptInSheet onDone={again} />);
  await userEvent.keyboard('{Escape}');
  expect(again).toHaveBeenCalledTimes(1);
  expect(acceptPushOptIn).not.toHaveBeenCalled();
});

test('"Turn on notifications" asks once, holds both buttons while it waits, then is done', async () => {
  let answer;
  acceptPushOptIn.mockImplementationOnce(() => new Promise((resolve) => {
    answer = resolve;
  }));
  const onDone = renderSheet();
  await userEvent.click(screen.getByRole('button', { name: PUSH_COPY.turnOn }));
  expect(acceptPushOptIn).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: PUSH_COPY.turnOn })).toBeDisabled();
  expect(screen.getByRole('button', { name: PUSH_COPY.notNow })).toBeDisabled();
  await userEvent.keyboard('{Escape}');
  expect(onDone).not.toHaveBeenCalled();
  await act(async () => answer('granted'));
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(declinePushOptIn).not.toHaveBeenCalled();
});

test('a throwing request never escapes the click: the sheet is still done', async () => {
  acceptPushOptIn.mockRejectedValueOnce(new Error('boom'));
  const onDone = renderSheet();
  await userEvent.click(screen.getByRole('button', { name: PUSH_COPY.turnOn }));
  await act(async () => {});
  expect(onDone).toHaveBeenCalledTimes(1);
});

test('focus stays inside the sheet', async () => {
  renderSheet();
  expect(screen.getByRole('dialog')).toHaveFocus();
  await userEvent.tab();
  expect(screen.getByRole('button', { name: PUSH_COPY.turnOn })).toHaveFocus();
  await userEvent.tab();
  expect(screen.getByRole('button', { name: PUSH_COPY.notNow })).toHaveFocus();
  await userEvent.tab();
  expect(screen.getByRole('button', { name: PUSH_COPY.turnOn })).toHaveFocus();
});
