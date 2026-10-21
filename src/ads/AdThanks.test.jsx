import { act, fireEvent, render, screen } from '@testing-library/react';
import AdThanks, { AD_THANKS_LINE, continueButtonStyle, thanksLayerStyle } from './AdThanks';

afterEach(() => {
  jest.useRealTimers();
});

const dialog = () => screen.getByTestId('ad-thanks');

test('the exact thank-you line, as a fixed full-screen dialog on body with safe-area insets', () => {
  const { container } = render(<AdThanks onContinue={() => {}} label="Text the crew" />);
  expect(AD_THANKS_LINE).toBe('Thanks for watching. That keeps Friendly free.');
  expect(screen.getByRole('dialog', { name: AD_THANKS_LINE })).toBe(dialog());
  // Portaled to body, so nothing in the screen under it moves.
  expect(container).toBeEmptyDOMElement();
  expect(dialog().parentElement).toBe(document.body);
  expect(dialog().style.position).toBe('fixed');
  expect(dialog().getAttribute('style')).toContain('inset: 0');
  // jsdom drops env(), so check the style the layer is given.
  ['top', 'right', 'bottom', 'left'].forEach((side) => {
    expect(thanksLayerStyle.padding).toContain(`env(safe-area-inset-${side})`);
  });
});

test('the continue button is at least a 44pt tap target, reuses the given label, and has focus', () => {
  render(<AdThanks onContinue={() => {}} label="Text the crew" />);
  const button = screen.getByRole('button', { name: 'Text the crew' });
  expect(continueButtonStyle.minHeight).toBeGreaterThanOrEqual(44);
  expect(continueButtonStyle.minWidth).toBeGreaterThanOrEqual(44);
  expect(button.style.minHeight).toBe('44px');
  expect(button.style.minWidth).toBe('44px');
  expect(button).toHaveFocus();
});

test('a tap anywhere continues, once', () => {
  const onContinue = jest.fn();
  render(<AdThanks onContinue={onContinue} label="Text the crew" />);
  fireEvent.click(screen.getByText(AD_THANKS_LINE));
  fireEvent.click(screen.getByRole('button', { name: 'Text the crew' }));
  fireEvent.click(dialog());
  expect(onContinue).toHaveBeenCalledTimes(1);
});

test('the button continues inside its own click event', () => {
  let insideClick = null;
  render(<AdThanks onContinue={() => { insideClick = window.event?.type; }} label="Text the crew" />);
  fireEvent.click(screen.getByRole('button', { name: 'Text the crew' }));
  expect(insideClick).toBe('click');
});

test('continues by itself after autoContinueMs, and not before', () => {
  jest.useFakeTimers();
  const onContinue = jest.fn();
  render(<AdThanks onContinue={onContinue} autoContinueMs={1500} label="Text the crew" />);
  act(() => { jest.advanceTimersByTime(1499); });
  expect(onContinue).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(1); });
  expect(onContinue).toHaveBeenCalledTimes(1);
  fireEvent.click(dialog());
  expect(onContinue).toHaveBeenCalledTimes(1);
});

test('with no autoContinueMs it waits for a tap', () => {
  jest.useFakeTimers();
  const onContinue = jest.fn();
  render(<AdThanks onContinue={onContinue} label="Text the crew" />);
  act(() => { jest.advanceTimersByTime(60000); });
  expect(onContinue).not.toHaveBeenCalled();
});

test('with no label: no visible button text; the whole layer is one control named by the line', () => {
  const onContinue = jest.fn();
  render(<AdThanks onContinue={onContinue} />);
  const buttons = screen.getAllByRole('button');
  expect(buttons).toHaveLength(1);
  const [cover] = buttons;
  expect(cover).toHaveAccessibleName(AD_THANKS_LINE);
  expect(cover).toHaveTextContent('');
  expect(cover).toHaveFocus();
  expect(cover.style.position).toBe('absolute');
  expect(cover.getAttribute('style')).toContain('inset: 0');
  fireEvent.click(cover);
  fireEvent.click(dialog());
  expect(onContinue).toHaveBeenCalledTimes(1);
});

test('while it is up, focus stays on its button: Tab and focus moving behind it come back', () => {
  render(
    <>
      <button type="button">Under the layer</button>
      <AdThanks onContinue={() => {}} label="Text the crew" />
    </>,
  );
  const button = screen.getByRole('button', { name: 'Text the crew' });
  expect(button).toHaveFocus();
  fireEvent.keyDown(button, { key: 'Tab' });
  expect(button).toHaveFocus();
  fireEvent.keyDown(button, { key: 'Tab', shiftKey: true });
  expect(button).toHaveFocus();
  act(() => { screen.getByRole('button', { name: 'Under the layer' }).focus(); });
  expect(button).toHaveFocus();
});

test('once it is gone, focus is free again', () => {
  const { rerender } = render(
    <>
      <button type="button">Under the layer</button>
      <AdThanks onContinue={() => {}} label="Text the crew" />
    </>,
  );
  rerender(<button type="button">Under the layer</button>);
  const under = screen.getByRole('button', { name: 'Under the layer' });
  act(() => { under.focus(); });
  expect(under).toHaveFocus();
});
