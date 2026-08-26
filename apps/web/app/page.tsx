import {ReelMaker} from '@/src/components/reel-maker';
import {CloudReelMaker} from '@/src/components/cloud-reel-maker';

export default function HomePage() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )) {
    return <CloudReelMaker />;
  }
  return <ReelMaker />;
}
