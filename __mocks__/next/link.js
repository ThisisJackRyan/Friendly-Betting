const React = require('react');

function Link({ href, children, ...props }) {
  const to = typeof href === 'string' ? href : href?.pathname || '';
  return React.createElement('a', { href: to, ...props }, children);
}

module.exports = Link;
