import Landing from '../../../src/phone/Landing';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e1a14',
};

export const metadata = {
  title: 'Friendly',
  description: 'Create a wager, text the link, vote once — no app.',
};

export default function HomePage() {
  return <Landing />;
}
