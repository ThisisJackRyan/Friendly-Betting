'use client';

import Link from 'next/link';
import { FiList, FiPlus } from 'react-icons/fi';
import { Brand } from './ProductUI';

export default function AppHeader({
  className = '',
  location = 'The clubhouse',
  createActive = false,
  onHomeClick,
  onActionClick,
}) {
  return (
    <header className={`app-header ${className}`}>
      <Link href="/" className="header-brand" aria-label="Friendly home" onClick={onHomeClick}>
        <Brand />
      </Link>
      <span className="header-location">{location}</span>
      <span className="header-note">
        <span className="live-dot" />
        Good friends. Friendly bets.
      </span>
      <Link
        className="header-action"
        href={createActive ? '/bets' : '/new'}
        onClick={onActionClick}
      >
        {createActive ? 'My bets' : 'New bet'}
        {createActive ? <FiList aria-hidden="true" /> : <FiPlus aria-hidden="true" />}
      </Link>
    </header>
  );
}
