import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'うさぽん リールメーカー',
  description: '素材を入れて、30秒のInstagram Reels動画をかんたん作成',
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
