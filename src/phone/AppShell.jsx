import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { FiList, FiPlus } from 'react-icons/fi';

const AppShell = () => {
  const { pathname } = useLocation();
  const phoneTabs = pathname === '/' || pathname === '/bets';

  return (
    <div className={phoneTabs ? 'app-shell shell-tabs' : 'app-shell shell-stack'}>
      <div className="app-main">
        <Outlet />
      </div>
      <nav className="tabbar app-nav" aria-label="Primary">
        <p className="wordmark nav-brand">Friendly</p>
        <NavLink
          to="/"
          end
          className={({ isActive }) => (
            (isActive || pathname.startsWith('/new')) ? 'tab active' : 'tab'
          )}
        >
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

export default AppShell;
