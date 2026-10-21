// The voter's name field on the vote page, before and after picking.
export const NAME_PLACEHOLDER = 'ex: John';

// Adding or changing a voter's name after they've picked a side.
// UX approved this copy. Keep it plain and short, with no em dashes
// (noPlaceholders.test.jsx).
export const NAME_EDIT_COPY = {
  // Button under "You’re on ..." with no name yet.
  add: 'Add your name',
  // The same button once they have a name.
  edit: 'Edit name',
  // Accessible name of that button, with their current name.
  editLabel: (name) => `Edit your name, currently ${name}`,
  // Label on the name input in the open form.
  label: 'Your name',
  // Save button.
  save: 'Save name',
  // Save button while saving.
  saving: 'Saving…',
  // Closes the form without saving.
  cancel: 'Cancel',
  // Shown when the save fails (offline, closed bet, rules).
  saveError: 'Couldn’t save your name. Your pick still counts.',
};
