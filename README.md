# うさぽん リールメーカー

背景、透過PNG、テキスト、BGMを選ぶだけで、Instagram Reels向けの30秒縦動画を作るローカルWebアプリです。画像そのものを動かすため、キャラクターの絵柄を変えません。

## 起動

必要環境はmacOS、Node.js 24.14.0、最新Chromeです。システムへのFFmpegインストールは不要です。

```bash
npm install
npm run dev
```

Chromeで `http://127.0.0.1:3000` を開きます。Web UIと動画生成ワーカーが同時に起動します。

実データは既定で `~/Library/Application Support/うさぽん リールメーカー/` に保存されます。開発・テスト時は次のように上書きできます。

```bash
USAPON_REEL_DATA_DIR=.local-data npm run dev
```

このMVPはMac内で使うローカルアプリです。認証を持たないため、ポート開放やトンネルを使ってインターネットへ直接公開しないでください。詳しくは [SECURITY.md](./SECURITY.md) を参照してください。

## 基本操作

1. JPG、PNG、MOV、MP4の背景を追加します。
2. 透過PNGを1枚以上追加します。
3. 必要ならテキストを追加します。
4. 雰囲気テンプレートとBGMを選びます。
5. プレビューを確認して「リールを作る」を押します。
6. 最近作ったリールから再生、別名保存、再編集、複製、削除ができます。

BGMはMP3、M4A、AAC、WAVに対応します。登録時にBPM、ビート位置、音量を解析し、以後はプリセットとして再利用します。解析結果の信頼度が低い場合は、BPMと先頭拍を手動補正できます。

音源ファイルはリポジトリに同梱しません。利用者が権利を持つ音源をアプリへ登録し、Mac内の管理領域で再利用します。

## 設計

- `apps/web`: Next.js UIとローカルAPI
- `apps/worker`: 動画変換、音声解析、Remotion書き出しを行う単一ジョブワーカー
- `packages/core`: バージョン付きデータ型、動きテンプレート、レイアウト、保存・生成インターフェース
- `packages/local`: SQLiteとMac内ファイル保存のadapter
- `packages/renderer`: プレビューとMP4で共有するRemotion Composition

雰囲気テンプレートは、再利用可能な動きプリミティブと設定JSONの組み合わせです。初期4種類は読み取り専用で、複製後に画面から調整できます。新しい組み合わせの追加にはコード変更が不要です。

保存先は `BlobStorage`、Repository、`RenderQueue`、`BGMProvider` の境界で分離しています。将来はUIや動画生成を変えずに、Supabase Database／Storage adapterを追加できます。

## 確認コマンド

```bash
npm run typecheck
npm test
USAPON_REEL_DATA_DIR=.local-data npm run build
npm run verify:output -- /path/to/completed-reel.mp4
```

完成MP4は1080×1920、30fps、30秒、H.264、AAC-LC 48kHz／192kbps、yuv420p、faststart付きです。

## ライセンス上の注意

Remotionは利用者・組織規模や提供形態によってライセンス条件が変わります。Essentia.jsはAGPL-3.0です。社外配布、クラウド提供、4人以上の組織利用へ広げる前に、両方の最新条件を確認してください。

AI音楽生成、AI動画生成、自由タイムライン、口パク、手足だけのアニメーションはMVPには含めていません。
