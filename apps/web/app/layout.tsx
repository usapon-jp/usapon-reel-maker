import type {Metadata, Viewport} from 'next';
import {PwaRegister} from '@/src/components/pwa-register';
import './globals.css';

export const metadata: Metadata = {
  title: 'うさぽん リールメーカー',
  description: '素材を入れて、30秒のInstagram Reels動画をかんたん作成',
  applicationName: 'うさぽん リールメーカー',
  manifest: '/manifest.webmanifest',
  icons: {icon: '/icon.svg', apple: '/icon.svg'},
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
