import { notFound } from 'next/navigation';
import Paywall from '../../../src/phone/Paywall';
import { proPaywallEnabled } from '../../../src/phone/proConfig';

export const metadata = {
  title: 'Go Pro · Friendly',
};

// Behind NEXT_PUBLIC_PRO_PAYWALL (docs/PRO.md): a real 404 when it is off.
export default function ProPage() {
  if (!proPaywallEnabled()) notFound();
  return <Paywall />;
}
