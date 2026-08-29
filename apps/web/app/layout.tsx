import type {Metadata, Viewport} from 'next';
import {PwaRegister} from '@/src/components/pwa-register';
import './globals.css';

export const metadata: Metadata = {
  title: 'うさぽん リールメーカー',
  description: '素材を入れて、30秒のInstagram Reels動画をかんたん作成',
  applicationName: 'うさぽん リールメーカー',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      {url: '/reel-piyo-icon-32.png', sizes: '32x32', type: 'image/png'},
      {url: '/reel-piyo-icon-192.png', sizes: '192x192', type: 'image/png'},
    ],
    apple: [{url: '/reel-piyo-icon-180.png', sizes: '180x180', type: 'image/png'}],
  },
  appleWebApp: {capable: true, statusBarStyle: 'default', title: 'うさぽんリール'},
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#fff8f2',
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="ja">
      <body>{children}<PwaRegister /></body>
    </html>
  );
}
