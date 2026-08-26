import {NextResponse, type NextRequest} from 'next/server';

export function proxy(_request: NextRequest) {
  const cloudMode = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ));
  if (cloudMode) {
    return new NextResponse(JSON.stringify({error: 'このAPIはMacローカル版専用です。'}), {
      status: 404,
      headers: {'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff'},
    });
  }
  return NextResponse.next();
}

export const config = {matcher: '/api/:path*'};
