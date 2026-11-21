import VoteScreen from '../../../src/phone/VoteScreen';
import { PROD_ORIGIN } from '../../../src/platform/runtime';
import { voteMetadata } from '../../../src/server/betPreview';

// The link preview: the bet's question as the title, a generic line, and the
// card from opengraph-image.js. Falls back to the generic title on any miss.
export async function generateMetadata({ params }) {
  const { code } = await params;
  return { metadataBase: new URL(PROD_ORIGIN), ...(await voteMetadata(code)) };
}

export default function VotePage() {
  return <VoteScreen />;
}
