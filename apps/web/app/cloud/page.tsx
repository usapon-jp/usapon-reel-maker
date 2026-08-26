import {CloudReelMaker} from '@/src/components/cloud-reel-maker';

export default async function CloudPage({searchParams}: {searchParams: Promise<{demo?: string}>}) {
  const query = await searchParams;
  return <CloudReelMaker demo={query.demo === '1'} />;
}
