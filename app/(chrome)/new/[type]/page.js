import CreateForm from '../../../../src/phone/CreateForm';
import { TYPE_META } from '../../../../src/phone/model';

export function generateMetadata({ params }) {
  const meta = TYPE_META[params.type];
  return {
    title: meta ? `${meta.label} · Friendly` : 'Friendly Bets',
  };
}

export default function NewBetPage() {
  return <CreateForm />;
}
