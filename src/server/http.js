// Bet codes are 6 chars today; legacy codes differ, so only bound the shape.
const CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// The native app's WebView origins (iOS, Android) and the production site.
export const ALLOWED_ORIGINS = new Set(['capacitor://localhost', 'https://localhost', 'https://www.friendly-bets.com']);

export function validCode(code) {
  return typeof code === 'string' && CODE_PATTERN.test(code);
}

export function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Echoes an exact allowed origin only. No credentials: the ID token is a header, not a cookie.
export function withCors(request, response, methods = 'POST, OPTIONS') {
  response.headers.append('Vary', 'Origin');
  const origin = request.headers.get('origin');
  if (!ALLOWED_ORIGINS.has(origin)) return response;
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', methods);
  response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.headers.set('Access-Control-Max-Age', '600');
  return response;
}

// Preflight never touches auth or the database.
export function preflight(request, methods) {
  return withCors(request, new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } }), methods);
}
