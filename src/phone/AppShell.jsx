'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import Link from '../platform/Link';
import { usePathname, useRouter } from '../platform/navigation';
import { FiArrowUpRight, FiHome, FiList, FiPlus, FiMessageCircle } from 'react-icons/fi';
import { Brand } from './ProductUI';
import { useCreateChrome } from './createChrome';
import { SLIDE_MS } from './createMotion';
import CreatePick from './CreatePick';
import AppHeader from './AppHeader';

// The green pill under the active tab. It sits at the active tab's box and
// slides there on transform only. Only a change of active tab, after the pill
// has settled, slides. Every other placement (first paint, hydration, fonts,
// resize, a shell change, coming back after being hidden) snaps: data-ready
// comes off, the new spot is set, style is flushed so the browser commits it
// with no transition, and data-ready goes back on two frames later.
function useTabPill(activeTab, shell) {
  const navRef = useRef(null);
  const pillRef = useRef(null);
  const activeRef = useRef(activeTab);
  const frame = useRef(0);
  const placed = useRef({ tab: null, box: '' });
  const observer = useRef(null);
  const watched = useRef(null);

  const cancelFrame = () => {
    if (frame.current) window.cancelAnimationFrame(frame.current);
    frame.current = 0;
  };

  // tabChange: this call comes from a new active tab, so it may slide.
  const place = useCallback((tabChange) => {
    const nav = navRef.current;
    const pill = pillRef.current;
    if (!nav || !pill) return;
    const tab = nav.querySelector('.tab.active');
    if (tab && observer.current && watched.current !== tab) {
      if (watched.current) observer.current.unobserve(watched.current);
      observer.current.observe(tab);
      watched.current = tab;
    }
    const width = tab ? tab.offsetWidth : 0;
    const height = tab ? tab.offsetHeight : 0;
    if (!width || !height) {
      cancelFrame();
      delete pill.dataset.shown;
      delete pill.dataset.ready;
      placed.current = { tab: null, box: '' };
      return;
    }
    const key = activeRef.current;
    const box = `${tab.offsetLeft},${tab.offsetTop},${width},${height}`;
    const shown = pill.dataset.shown !== undefined;
    if (shown && box === placed.current.box) {
      placed.current.tab = key;
      return;
    }
    const slide =
      tabChange &&
      shown &&
      pill.dataset.ready !== undefined &&
      placed.current.tab !== null &&
      placed.current.tab !== key;
    if (!slide) {
      cancelFrame();
      delete pill.dataset.ready;
    }
    pill.style.setProperty('--pill-x', `${tab.offsetLeft}px`);
    pill.style.setProperty('--pill-y', `${tab.offsetTop}px`);
    pill.style.setProperty('--pill-w', `${width}px`);
    pill.style.setProperty('--pill-h', `${height}px`);
    pill.dataset.shown = '';
    placed.current = { tab: key, box };
    if (slide) return;
    // Commit the snapped spot with the transition off before it comes back on.
    void window.getComputedStyle(pill).transform;
    if (typeof window.requestAnimationFrame !== 'function') return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = window.requestAnimationFrame(() => {
        frame.current = 0;
        if (pill.dataset.shown !== undefined) pill.dataset.ready = '';
      });
    });
  }, []);

  useLayoutEffect(() => {
    activeRef.current = activeTab;
    place(true);
  }, [activeTab, shell, place]);

  useEffect(() => {
    let live = true;
    const remeasure = () => {
      if (live) place(false);
    };
    const nav = navRef.current;
    if (typeof window.ResizeObserver === 'function' && nav) {
      observer.current = new window.ResizeObserver(remeasure);
      observer.current.observe(nav);
      // Siblings above a tab can move it without the nav changing size.
      [...nav.children].forEach((child) => observer.current.observe(child));
      watched.current = null;
      place(false);
    }
    window.addEventListener('resize', remeasure);
    window.addEventListener('orientationchange', remeasure);
    window.addEventListener('load', remeasure);
    const fonts = document.fonts;
    fonts?.ready?.then(remeasure, () => {});
    fonts?.addEventListener?.('loadingdone', remeasure);
    const late =
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame(remeasure)
        : 0;
    return () => {
      live = false;
      observer.current?.disconnect();
      observer.current = null;
      watched.current = null;
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('orientationchange', remeasure);
      window.removeEventListener('load', remeasure);
      fonts?.removeEventListener?.('loadingdone', remeasure);
      if (late) window.cancelAnimationFrame(late);
      cancelFrame();
    };
  }, [place]);

  return { navRef, pillRef };
}

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
  const homeTab = pathname === '/' && !enteringCreate;
  const betsTab = betsActive && !enteringCreate;
  const createTab = createActive || enteringCreate;
  const activeTab = createTab ? 'new' : betsTab ? 'bets' : homeTab ? 'home' : '';
  const { navRef, pillRef } = useTabPill(activeTab, shell);

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
      <nav ref={navRef} className="tabbar app-nav" aria-label="Primary">
        <span ref={pillRef} className="tab-pill" aria-hidden="true" />
        <Link href="/" className="nav-brand" aria-label="Friendly home" onClick={cancelCreateEntry}>
          <Brand />
        </Link>
        <Link
          href="/"
          className={homeTab ? 'tab active' : 'tab'}
          aria-current={homeTab ? 'page' : undefined}
          onClick={cancelCreateEntry}
        >
          <FiHome size={20} aria-hidden="true" />
          <span>Home</span>
        </Link>
        <Link
          href="/bets"
          className={betsTab ? 'tab active' : 'tab'}
          aria-current={betsTab ? 'page' : undefined}
          onClick={cancelCreateEntry}
        >
          <FiList size={20} aria-hidden="true" />
          <span>My bets</span>
        </Link>
        <Link
          href="/new"
          className={createTab ? 'tab active' : 'tab'}
          aria-current={createTab ? 'page' : undefined}
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
