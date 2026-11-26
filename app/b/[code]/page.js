import VoteScreen from '../../../src/phone/VoteScreen';
import { previewOrigin, voteMetadata } from '../../../src/server/betPreview';

// The link preview: the bet's question as the title, a generic line, and the
// card from opengraph-image.js. A closed bet gets its status title and line
// and a ?s= card URL (closedPreviewTags). Falls back to the generic title on
// any miss.
export async function generateMetadata({ params }) {
  const { code } = await params;
  return { metadataBase: new URL(previewOrigin()), ...(await voteMetadata(code)) };
}

export default function VotePage() {
  return <VoteScreen />;
}
