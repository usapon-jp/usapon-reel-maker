self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // 素材や完成動画を端末キャッシュへ保存しない。ネットワークとSupabaseの権限制御をそのまま使う。
});
