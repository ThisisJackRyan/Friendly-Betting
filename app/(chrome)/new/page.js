import CreateForm from '../../../src/phone/CreateForm';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e1a14',
};

export const metadata = {
  title: 'New bet · Friendly',
};

export default function CreatePage() {
  return <CreateForm />;
}
