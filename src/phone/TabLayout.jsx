'use client';

import { usePathname } from '../platform/navigation';
import { useIdentity } from './identity';

const TabLayout = ({ children }) => {
  const pathname = usePathname() || '/';
  useIdentity();

  if (pathname === '/') return children;

  return (
    <div className="phone">
      <div className="scroll screen-fade" key={pathname}>
        {children}
      </div>
    </div>
  );
};

export default TabLayout;
