const HOME = 'home';

export function armHomeArrival() {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.arrive = HOME;
}

export function homeArrivalPending() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.arrive === HOME;
}

export function clearHomeArrival() {
  if (typeof document === 'undefined') return;
  delete document.documentElement.dataset.arrive;
}

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
