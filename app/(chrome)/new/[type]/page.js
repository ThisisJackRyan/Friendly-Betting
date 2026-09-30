import CreateForm from '../../../../src/phone/CreateForm';
import { TYPE_META } from '../../../../src/phone/model';

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
