'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FiArrowUpRight, FiHome, FiList, FiPlus, FiMessageCircle } from 'react-icons/fi';
import { Brand } from './ProductUI';
import { useCreateChrome } from './createChrome';

const AppShell = ({ children }) => {
  const pathname = usePathname() || '/';
  const { hidePhoneTabs, pinPhoneTabs } = useCreateChrome();
  const landing = pathname === '/' && !pinPhoneTabs;
  const phoneTabs =
    pathname === '/bets' || ((pathname === '/new' || pinPhoneTabs) && !hidePhoneTabs);
  const createActive = pathname === '/new' || pathname.startsWith('/new/');
  const betsActive = pathname === '/bets' || pathname.startsWith('/bets/');
  const shell = landing
    ? 'app-shell shell-stack shell-landing'
    : phoneTabs
      ? 'app-shell shell-tabs'
      : 'app-shell shell-stack';

  return (
    <div className={shell}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-main">
        <header className="app-header">
          <Link href="/" className="header-brand" aria-label="Friendly home">
            <Brand />
          </Link>
          <span className="header-location">
            {createActive
              ? 'Create a bet'
              : betsActive
                ? 'My bets'
                : pathname.startsWith('/t/') || pathname.startsWith('/Bet/')
                  ? 'Your bet'
                  : 'The clubhouse'}
          </span>
          <span className="header-note">
            <span className="live-dot" />
            Good friends. Friendly bets.
          </span>
          <Link className="header-action" href={createActive ? '/bets' : '/new'}>
            {createActive ? 'My bets' : 'New bet'}
            {createActive ? <FiList aria-hidden="true" /> : <FiPlus aria-hidden="true" />}
          </Link>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <nav className="tabbar app-nav" aria-label="Primary">
        <Link href="/" className="nav-brand" aria-label="Friendly home">
          <Brand />
        </Link>
        <p className="nav-caption">YOUR CLUBHOUSE</p>
        <Link
          href="/"
          className={pathname === '/' ? 'tab active' : 'tab'}
          aria-current={pathname === '/' ? 'page' : undefined}
        >
          <FiHome size={20} aria-hidden="true" />
          <span>Home</span>
        </Link>
        <Link
          href="/bets"
          className={betsActive ? 'tab active' : 'tab'}
          aria-current={betsActive ? 'page' : undefined}
        >
          <FiList size={20} aria-hidden="true" />
          <span>My bets</span>
        </Link>
        <Link
          href="/new"
          className={createActive ? 'tab active' : 'tab'}
          aria-current={createActive ? 'page' : undefined}
        >
          <FiPlus size={22} aria-hidden="true" />
          <span>Create</span>
        </Link>
        <div className="nav-bottom">
          <div className="nav-note">
            <FiMessageCircle size={24} aria-hidden="true" />
            <strong>Better with your people.</strong>
            <p>
              One link. A few friends.
              <br />A story worth settling.
            </p>
            <Link href="/#how-it-works">
              How it works
              <FiArrowUpRight aria-hidden="true" />
            </Link>
          </div>
          <span className="nav-footnote">A little rivalry goes a long way.</span>
        </div>
      </nav>
    </div>
  );
};

export default AppShell;
