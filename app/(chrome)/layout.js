import AppShell from '../../src/phone/AppShell';
import { CreateChromeProvider } from '../../src/phone/createChrome';

export default function ChromeLayout({ children }) {
  return (
    <CreateChromeProvider>
      <AppShell>{children}</AppShell>
    </CreateChromeProvider>
  );
}
