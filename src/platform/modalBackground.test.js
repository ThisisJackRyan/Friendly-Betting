import { appRoot, holdBackground } from './modalBackground';

function makeRoot(id = 'root') {
  const root = document.createElement('div');
  root.id = id;
  document.body.appendChild(root);
  return root;
}

function makeDialog(parent = document.body) {
  const dialog = document.createElement('div');
  const button = document.createElement('button');
  dialog.appendChild(button);
  parent.appendChild(dialog);
  return { dialog, button };
}

afterEach(() => {
  document.body.innerHTML = '';
});

test('an overlay inside the app root does not make it inert', () => {
  const root = makeRoot();
  const { dialog } = makeDialog(root);
  expect(appRoot(dialog)).toBeNull();
  const release = holdBackground(dialog);
  expect(root).not.toHaveAttribute('inert');
  release();
  expect(root).not.toHaveAttribute('inert');
});

test('overlapping overlays: inert stays until the last one closes, in either order', () => {
  const root = makeRoot();
  const opener = document.createElement('button');
  root.appendChild(opener);
  opener.focus();
  const first = makeDialog();
  const releaseFirst = holdBackground(first.dialog);
  first.button.focus();
  const second = makeDialog();
  const releaseSecond = holdBackground(second.dialog);
  second.button.focus();
  expect(root).toHaveAttribute('inert');

  releaseFirst();
  expect(root).toHaveAttribute('inert');
  // Focus was in the second overlay, not the first: left alone.
  expect(second.button).toHaveFocus();
  releaseFirst();
  expect(root).toHaveAttribute('inert');

  second.dialog.remove();
  releaseSecond();
  expect(root).not.toHaveAttribute('inert');
});

test('inert set by someone else is never removed', () => {
  const root = makeRoot();
  root.setAttribute('inert', '');
  const { dialog } = makeDialog();
  const release = holdBackground(dialog);
  release();
  expect(root).toHaveAttribute('inert');
});
