'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FiArrowUpRight, FiHome, FiList, FiPlus, FiMessageCircle } from 'react-icons/fi';
import { Brand } from './ProductUI';
import { useCreateChrome } from './createChrome';
import { SLIDE_MS } from './createMotion';
import CreatePick from './CreatePick';
import AppHeader from './AppHeader';

const AppShell = ({ children }) => {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { hidePhoneTabs, pinPhoneTabs, setPinPhoneTabs } = useCreateChrome();
  const landing = pathname === '/' && !pinPhoneTabs;
  const phoneTabs =
    pathname === '/bets' || ((pathname === '/new' || pinPhoneTabs) && !hidePhoneTabs);
  const createActive = pathname === '/new' || pathname.startsWith('/new/');
  const enteringCreate = pinPhoneTabs && !createActive;
  const betsActive = pathname === '/bets' || pathname.startsWith('/bets/');
  const shell = landing
    ? 'app-shell shell-stack shell-landing'
    : phoneTabs
      ? 'app-shell shell-tabs'
      : 'app-shell shell-stack';

  useEffect(() => {
    if (!enteringCreate) return undefined;
    const id = window.setTimeout(() => router.push('/new'), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [enteringCreate, pathname, router]);

  const onCreateClick = (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return;
    if (createActive || !window.matchMedia?.('(max-width: 767px)').matches) return;
    event.preventDefault();
    setPinPhoneTabs(true);
  };

  const cancelCreateEntry = () => setPinPhoneTabs(false);

  return (
    <div className={`${shell}${createActive || enteringCreate ? ' shell-creating' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-main">
        <AppHeader
          location={
            createActive
              ? 'Create a bet'
              : betsActive
                ? 'My bets'
                : pathname.startsWith('/t/') || pathname.startsWith('/Bet/')
                  ? 'Your bet'
                  : 'The clubhouse'
          }
          createActive={createActive}
          onHomeClick={cancelCreateEntry}
          onActionClick={createActive ? cancelCreateEntry : onCreateClick}
        />
        <main id="main-content" className="main-content" tabIndex={-1}>
          <div
            className={
              enteringCreate
                ? 'route-content create-pane is-leaving slide-forward'
                : 'route-content'
            }
            aria-hidden={enteringCreate || undefined}
            inert={enteringCreate || undefined}
          >
            {children}
          </div>
          {enteringCreate && (
            <div className="route-content create-pane is-entering slide-forward" inert>
              <div className="phone create-flow">
                <div className="create-viewport">
                  <div className="create-pane form-fill create-step-pick" data-step="1">
                    <CreatePick
                      onBack={() => {}}
                      onHomeClick={(event) => event.preventDefault()}
                      onPick={() => {}}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      <nav className="tabbar app-nav" aria-label="Primary">
        <Link href="/" className="nav-brand" aria-label="Friendly home" onClick={cancelCreateEntry}>
          <Brand />
        </Link>
        <p className="nav-caption">YOUR CLUBHOUSE</p>
        <Link
          href="/"
          className={pathname === '/' && !enteringCreate ? 'tab active' : 'tab'}
          aria-current={pathname === '/' && !enteringCreate ? 'page' : undefined}
          onClick={cancelCreateEntry}
        >
          <FiHome size={20} aria-hidden="true" />
          <span>Home</span>
        </Link>
        <Link
          href="/bets"
          className={betsActive && !enteringCreate ? 'tab active' : 'tab'}
          aria-current={betsActive && !enteringCreate ? 'page' : undefined}
          onClick={cancelCreateEntry}
        >
          <FiList size={20} aria-hidden="true" />
          <span>My bets</span>
        </Link>
        <Link
          href="/new"
          className={createActive || enteringCreate ? 'tab active' : 'tab'}
          aria-current={createActive || enteringCreate ? 'page' : undefined}
          onClick={onCreateClick}
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
            <Link href="/#how-it-works" onClick={cancelCreateEntry}>
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
