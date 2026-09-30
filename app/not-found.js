import AppShell from '../src/phone/AppShell';
import NotFound from '../src/phone/NotFound';

export const metadata = {
  title: 'Lost that one · Friendly',
};

export default function NotFoundPage() {
  return (
    <AppShell>
      <NotFound />
    </AppShell>
  );
}
