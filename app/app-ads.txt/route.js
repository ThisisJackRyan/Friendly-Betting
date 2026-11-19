import { appAdsTxt } from '../../src/server/appAdsTxt';

// Read the env on every request, so the live file always matches the deploy's
// settings. See docs/ADS.md.
export const dynamic = 'force-dynamic';

export function GET() {
  return new Response(appAdsTxt(process.env), {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
