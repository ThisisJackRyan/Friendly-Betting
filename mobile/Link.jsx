import { forwardRef } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { isTabRoot } from '../src/platform/tabRoots';
import { goToRoot } from './navigation';

// Links to a tab (Home, My bets) reset to it rather than push (see goToRoot).
const Link = forwardRef(function Link({ href, children, onClick, ...props }, ref) {
  const navigate = useNavigate();
  const root = isTabRoot(href);
  const click = (event) => {
    onClick?.(event);
    if (!root || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    goToRoot(navigate, href);
  };
  return <RouterLink ref={ref} to={href} onClick={click} {...props}>{children}</RouterLink>;
});

export default Link;
