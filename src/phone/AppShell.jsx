'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FiList, FiPlus } from 'react-icons/fi';
import { useCreateChrome } from './createChrome';

const AppShell = ({ children }) => {
  const pathname = usePathname() || '/';
  const { hidePhoneTabs } = useCreateChrome();
  const phoneTabs = pathname === '/bets' || (pathname === '/' && !hidePhoneTabs);
  const createActive = pathname === '/' || pathname.startsWith('/new');
  const betsActive = pathname === '/bets' || pathname.startsWith('/bets/');

  return (
    <div className={phoneTabs ? 'app-shell shell-tabs' : 'app-shell shell-stack'}>
      <div className="app-main">
        {children}
      </div>
      <nav className="tabbar app-nav" aria-label="Primary">
        <p className="wordmark nav-brand">Friendly</p>
        <Link href="/" className={createActive ? 'tab active' : 'tab'}>
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
