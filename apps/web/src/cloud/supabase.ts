'use client';

import {createClient, type SupabaseClient} from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

export function getCloudConfig(): {url: string; publishableKey: string} | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && publishableKey ? {url, publishableKey} : null;
}

export function isCloudConfigured(): boolean {
  return getCloudConfig() !== null;
}

export function getSupabaseBrowserClient(): SupabaseClient {
  const config = getCloudConfig();
  if (!config) throw new Error('クラウド接続がまだ設定されていません。');
  browserClient ??= createClient(config.url, config.publishableKey, {
    auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true},
  });
  return browserClient;
}
