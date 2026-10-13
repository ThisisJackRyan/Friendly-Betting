const React = require('react');

// `replace` shows as data-replace, so tests can tell a tab link from a push.
function Link({ href, children, replace, ...props }) {
  const to = typeof href === 'string' ? href : href?.pathname || '';
  return React.createElement('a', { href: to, 'data-replace': replace ? 'true' : undefined, ...props }, children);
}

module.exports = Link;
