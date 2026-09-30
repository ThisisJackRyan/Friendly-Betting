export function voteUrl(code) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/b/${code}`;
}
