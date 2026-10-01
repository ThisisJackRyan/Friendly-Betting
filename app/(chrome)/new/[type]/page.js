import CreateForm from '../../../../src/phone/CreateForm';
import { TYPE_META } from '../../../../src/phone/model';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e1a14',
};

export async function generateMetadata({ params }) {
  const { type } = await params;
  const meta = TYPE_META[type];
  return {
    title: meta ? `${meta.label} · Friendly` : 'Friendly Bets',
  };
}

export default function NewBetPage() {
  return <CreateForm />;
}
