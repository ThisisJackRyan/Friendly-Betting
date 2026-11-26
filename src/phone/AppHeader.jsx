'use client';

import Link from '../platform/Link';
import { FiList, FiPlus } from 'react-icons/fi';
import { Brand } from './ProductUI';
import ResultsMenu from './ResultsMenu';
import AccountMenu from './AccountMenu';

export default function AppHeader({
  className = '',
  location,
  createActive = false,
  account = false,
  onHomeClick,
  onActionClick,
}) {
  return (
    <header className={`app-header ${className}`}>
      <Link href="/" className="header-brand" aria-label="Friendly Bets home" onClick={onHomeClick}>
        <Brand />
      </Link>
      {location ? <span className="header-location">{location}</span> : null}
      <ResultsMenu />
      <Link
        className="header-action"
        href={createActive ? '/bets' : '/new'}
        onClick={onActionClick}
      >
        {createActive ? 'My bets' : 'New bet'}
        {createActive ? <FiList aria-hidden="true" /> : <FiPlus aria-hidden="true" />}
      </Link>
      {account && <AccountMenu />}
    </header>
  );
}
