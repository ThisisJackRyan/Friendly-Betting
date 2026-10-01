'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FiList, FiPlus } from 'react-icons/fi';
import { useCreateChrome } from './createChrome';

const AppShell = ({ children }) => {
  const pathname = usePathname() || '/';
  const { hidePhoneTabs, pinPhoneTabs } = useCreateChrome();
  const landing = pathname === '/' && !pinPhoneTabs;
  const phoneTabs = pathname === '/bets' || ((pathname === '/new' || pinPhoneTabs) && !hidePhoneTabs);
  const createActive = pathname === '/new' || pathname.startsWith('/new/');
  const betsActive = pathname === '/bets' || pathname.startsWith('/bets/');
  const shell = landing
    ? 'app-shell shell-stack shell-landing'
    : phoneTabs
      ? 'app-shell shell-tabs'
      : 'app-shell shell-stack';

  return (
    <div className={shell}>
      <div className="app-main">
        {children}
      </div>
      <nav className="tabbar app-nav" aria-label="Primary">
        <p className="wordmark nav-brand">Friendly</p>
        <Link href="/new" className={createActive ? 'tab active' : 'tab'}>
          <FiPlus size={22} aria-hidden="true" />
          <span>Create</span>
        </Link>
        <Link href="/bets" className={betsActive ? 'tab active' : 'tab'}>
          <FiList size={22} aria-hidden="true" />
          <span>My bets</span>
        </Link>
      </nav>
    </div>
  );
};

export default AppShell;
