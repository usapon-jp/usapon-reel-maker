import type {MetadataRoute} from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'うさぽん リールメーカー',
    short_name: 'うさぽんリール',
    description: 'スマホから素材を送り、30秒のInstagram Reels動画を作成',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8f2e9',
    theme_color: '#fff8f2',
    orientation: 'any',
    icons: [
      {src: '/reel-piyo-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any'},
      {src: '/reel-piyo-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any'},
      {src: '/reel-piyo-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
    ],
  };
}
