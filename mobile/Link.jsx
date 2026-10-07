import { forwardRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';

const Link = forwardRef(function Link({ href, children, ...props }, ref) {
  return <RouterLink ref={ref} to={href} {...props}>{children}</RouterLink>;
});

export default Link;
