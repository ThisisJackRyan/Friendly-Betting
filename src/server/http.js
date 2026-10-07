// Bet codes are 6 chars today; legacy codes differ, so only bound the shape.
const CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function validCode(code) {
  return typeof code === 'string' && CODE_PATTERN.test(code);
}

export function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
