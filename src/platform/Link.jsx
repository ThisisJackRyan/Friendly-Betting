// Shared screens depend on this small adapter; the app build supplies React Router.
import NextLink from 'next/link';
import { isTabRoot } from './tabRoots';

// A tab takes the current entry's place, so browser back never ping-pongs between tabs.
export default function Link({ href, replace, ...props }) {
  return <NextLink href={href} replace={replace || isTabRoot(href)} {...props} />;
}
