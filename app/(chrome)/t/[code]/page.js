import TallyScreen from '../../../../src/phone/TallyScreen';
import { previewOrigin, tallyMetadata } from '../../../../src/server/betPreview';

// The tally keeps its own title. Once the bet is settled, called off or has
// its picks in, the link (the result SMS sends /t/{code}?s=...) unfurls with
// the closed card from /b/{code}/opengraph-image.
export async function generateMetadata({ params }) {
  const { code } = await params;
  return { metadataBase: new URL(previewOrigin()), ...(await tallyMetadata(code, 'Tally · Friendly Bets')) };
}

export default function TallyPage() {
  return <TallyScreen />;
}
