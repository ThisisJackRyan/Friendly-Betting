// The voter's name field on the vote page, before and after picking.
export const NAME_PLACEHOLDER = 'ex: John';

// Adding or changing a voter's name after they've picked a side.
// PLACEHOLDER copy pending UX: every string below is a stand-in until UX signs
// off. Keep them plain and short, with no em dashes and no placeholder markers
// (noPlaceholders.test.jsx).
export const NAME_EDIT_COPY = {
  // PLACEHOLDER copy pending UX: button under "You're on ..." with no name yet.
  add: 'Add your name',
  // PLACEHOLDER copy pending UX: the same button once they have a name.
  edit: 'Edit name',
  // PLACEHOLDER copy pending UX: accessible name of that button, with their current name.
  editLabel: (name) => `Edit your name, now ${name}`,
  // PLACEHOLDER copy pending UX: label on the name input in the open form.
  label: 'Your name',
  // PLACEHOLDER copy pending UX: save button.
  save: 'Save name',
  // PLACEHOLDER copy pending UX: save button while saving.
  saving: 'Saving…',
  // PLACEHOLDER copy pending UX: closes the form without saving.
  cancel: 'Cancel',
  // PLACEHOLDER copy pending UX: shown when the save fails (offline, closed bet, rules).
  saveError: 'Couldn’t save your name. Your pick still counts.',
};
