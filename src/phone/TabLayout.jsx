import { Outlet, useLocation } from 'react-router-dom';
import { useIdentity } from './identity';

const TabLayout = () => {
  const { pathname } = useLocation();
  useIdentity();

  return (
    <div className="phone">
      <div className="scroll screen-fade" key={pathname}>
        <Outlet />
      </div>
    </div>
  );
};

export default TabLayout;
