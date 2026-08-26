import {MotionTemplateEditor} from '@/src/components/motion-template-editor';
import {redirect} from 'next/navigation';

export default function TemplatesPage() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )) redirect('/');
  return <MotionTemplateEditor />;
}
