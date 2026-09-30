import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { FiList, FiPlus } from 'react-icons/fi';
import { useIdentity } from './identity';

const TabLayout = () => {
  const { pathname } = useLocation();
  useIdentity();

  return (
    <div className="phone">
      <div className="scroll screen-fade" key={pathname}>
        <Outlet />
      </div>
      <nav className="tabbar" aria-label="Primary">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
          <FiPlus size={22} aria-hidden="true" />
          <span>Create</span>
        </NavLink>
        <NavLink to="/bets" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
          <FiList size={22} aria-hidden="true" />
          <span>My bets</span>
        </NavLink>
      </nav>
    </div>
  );
};

export default TabLayout;
