'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {Session} from '@supabase/supabase-js';
import {
  BUILTIN_MOTION_TEMPLATES,
  RemoteReelRequestSchema,
  type RemoteReelJobStatus,
  type RemoteReelRequestV1,
} from '@usapon-reel/core';
import {getSupabaseBrowserClient, isCloudConfigured} from '@/src/cloud/supabase';
import {uploadCloudFile, validateCloudFile} from '@/src/cloud/upload';
import {createSubmissionFingerprint} from '@/src/cloud/submission-fingerprint';

const BUCKET = 'reel-private';

type CloudJob = {
  id: string;
  userId: string;
  status: RemoteReelJobStatus;
  request: RemoteReelRequestV1;
  progress: number;
  outputObjectPath: string | null;
  thumbnailObjectPath: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

type CloudJobRow = {
  id: string;
  user_id: string;
  status: RemoteReelJobStatus;
  request: unknown;
  progress: number;
  output_object_path: string | null;
  thumbnail_object_path: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

function fromRow(row: CloudJobRow): CloudJob {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    request: RemoteReelRequestSchema.parse(row.request),
    progress: row.progress,
    outputObjectPath: row.output_object_path,
    thumbnailObjectPath: row.thumbnail_object_path,
    error: row.error,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function LoginPanel() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const {error: authError} = await getSupabaseBrowserClient().auth.signInWithOtp({
      email,
      options: {emailRedirectTo: window.location.origin},
    });
    setBusy(false);
    if (authError) setError(`ログインメールを送れません: ${authError.message}`);
    else setMessage('ログイン用リンクをメールへ送りました。この画面は閉じずにメールを確認してください。');
  };

  return (
    <main className="cloud-login-page">
      <section className="cloud-login-card panel">
        <div className="brand-mark cloud-login-mark">🐰</div>
        <div className="eyebrow">Usapon Reel Cloud</div>
        <h1>スマホから、リールを作ろう</h1>
        <p className="lead">素材を送ると、Macが30秒動画を作ります。完成後はこの端末で受け取れます。</p>
        <form onSubmit={sendLink} className="cloud-login-form">
          <label className="field">
            <span className="label">メールアドレス</span>
            <input
              className="text-input"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
            />
          </label>
          <button className="button primary big full" type="submit" disabled={busy}>
            {busy ? '送信しています…' : 'ログイン用リンクを受け取る'}
          </button>
        </form>
        {message ? <div className="notice">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}
        <p className="cloud-privacy-note">素材と完成動画は本人だけが開ける非公開領域に保存されます。</p>
      </section>
    </main>
  );
}

function CloudSetupPreview() {
  return (
    <main className="cloud-login-page">
      <section className="cloud-login-card panel cloud-setup-card">
        <div className="brand-mark cloud-login-mark">🐰</div>
        <div className="eyebrow">Cloud setup</div>
        <h1>スマホ版の画面は準備できています</h1>
        <p className="lead">Supabaseの接続設定と本番データベース反映後に、ログインして利用できるようになります。</p>
        <div className="cloud-demo-flow" aria-label="スマホ版の利用手順">
          <span>1　ログイン</span>
          <span>2　素材を選ぶ</span>
          <span>3　Macで生成</span>
          <span>4　MP4を保存</span>
        </div>
        <a className="button full" href="/">Macローカル版へ戻る</a>
      </section>
    </main>
  );
}

export function CloudReelMaker({demo = false}: {demo?: boolean}) {
  const configured = isCloudConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(configured);

  useEffect(() => {
    if (!configured) return;
    const client = getSupabaseBrowserClient();
    void client.auth.getSession().then(({data}) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const {data} = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, [configured]);

  if (demo) return <CloudEditorDemo />;
  if (!configured) return <CloudSetupPreview />;
  if (authLoading) return <main className="cloud-loading">読み込んでいます…</main>;
  if (!session) return <LoginPanel />;
  return <CloudEditor session={session} />;
}

function CloudEditorDemo() {
  const [mood, setMood] = useState('motion-soft');
  const [title, setTitle] = useState('うさぽん新作紹介');
  return (
    <div className="app-shell cloud-shell">
      <header className="topbar cloud-topbar">
        <a className="brand" href="#demo-editor"><span className="brand-mark">🐰</span><span>うさぽん リールメーカー</span></a>
        <nav className="nav-links"><a className="nav-link active" href="#demo-editor">作る</a><a className="nav-link" href="#demo-recent">完成動画</a></nav>
      </header>
      <main className="page cloud-page" id="demo-editor">
        <div className="notice warning cloud-demo-notice">これはクラウド接続前の画面確認用です。ファイルは送信されません。</div>
        <div className="page-heading cloud-heading"><div><div className="eyebrow">Mobile reel studio</div><h1>素材を選んで、Macへおまかせ</h1><p className="lead">スマホやiPadから30秒リールを作れます。</p></div><button className="button" type="button">完成通知を受け取る</button></div>
        <div className="cloud-workspace">
          <section className="panel cloud-preview-panel"><div className="cloud-phone-preview"><div className="cloud-preview-empty">背景とPNGの<br />簡易プレビュー</div><div className="cloud-preview-text"><strong>うさぽん新作</strong><span>できました！</span></div></div><p className="preview-note">配置と動きはMacがセーフゾーン内へ自動調整します</p></section>
          <section className="panel controls-panel cloud-controls">
            <div className="section"><div className="step-label"><span className="step-number">1</span>基本情報</div><label className="field cloud-field-gap"><span className="label">リール名</span><input className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} /></label></div>
            <div className="section"><div className="step-label"><span className="step-number">2</span>素材</div><div className="cloud-upload-list"><label className="upload-card cloud-upload-card"><input className="hidden-input" type="file" /><b>背景を追加</b><span>JPG・PNG・MOV・MP4</span></label><label className="upload-card cloud-upload-card"><input className="hidden-input" type="file" /><b>透過PNGを追加</b><span>うさぽん・商品・ロゴなど</span></label></div></div>
            <div className="section"><div className="step-label"><span className="step-number">3</span>テキスト（任意）</div><div className="field-row cloud-field-gap"><input className="text-input" defaultValue="うさぽん新作" /><input className="text-input" defaultValue="できました！" /></div></div>
            <div className="section"><div className="step-label"><span className="step-number">4</span>雰囲気</div><div className="mood-grid cloud-field-gap">{BUILTIN_MOTION_TEMPLATES.map((template) => <button className={`mood-card ${mood === template.id ? 'active' : ''}`} type="button" key={template.id} onClick={() => setMood(template.id)}>{template.name}<small>{template.description}</small></button>)}</div></div>
            <div className="section"><div className="step-label"><span className="step-number">5</span>BGM</div><label className="cloud-check"><input type="checkbox" defaultChecked /><span>Macに登録済みのおすすめBGMを使う</span></label><div className="upload-card cloud-upload-card cloud-bgm-card"><b>自分のBGMを追加</b><span>MP3・M4A・AAC・WAV</span></div></div>
            <button className="button primary big full cloud-create-button" type="button" disabled>リールを作る</button>
          </section>
        </div>
        <section className="history-section" id="demo-recent"><div className="section-head cloud-history-head"><div><div className="eyebrow">Recent reels</div><h2>完成動画・生成状況</h2></div></div><div className="history-grid cloud-history-grid"><article className="history-card"><div className="history-placeholder"><span className="cloud-job-badge processing">生成中 48%</span></div><div className="history-body"><h3>{title}</h3><div className="meta"><span className="tag">{BUILTIN_MOTION_TEMPLATES.find((item) => item.id === mood)?.name}</span><span>いま</span></div><div className="progress"><span style={{width: '48%'}} /></div></div></article></div></section>
      </main>
    </div>
  );
}

function CloudEditor({session}: {session: Session}) {
  const client = getSupabaseBrowserClient();
  const [title, setTitle] = useState('新しいリール');
  const [background, setBackground] = useState<File | null>(null);
  const [overlays, setOverlays] = useState<File[]>([]);
  const [texts, setTexts] = useState(['', '']);
  const [motionTemplateId, setMotionTemplateId] = useState('motion-soft');
  const [strength, setStrength] = useState(1);
  const [bgm, setBgm] = useState<File | null>(null);
  const [useDefaultBgm, setUseDefaultBgm] = useState(true);
  const [jobs, setJobs] = useState<CloudJob[]>([]);
  const [urls, setUrls] = useState<Record<string, {output?: string; thumbnail?: string}>>({});
  const [busy, setBusy] = useState(false);
  const [uploadLabel, setUploadLabel] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const previousStatuses = useRef<Record<string, RemoteReelJobStatus>>({});
  const submissionInFlight = useRef(false);
  const backgroundUrl = useObjectUrl(background);
  const overlayUrls = useMemo(() => overlays.map((file) => ({file, url: URL.createObjectURL(file)})), [overlays]);

  useEffect(() => () => overlayUrls.forEach((item) => URL.revokeObjectURL(item.url)), [overlayUrls]);

  const loadJobs = useCallback(async () => {
    const {data, error: queryError} = await client
      .schema('reel')
      .from('remote_reel_jobs')
      .select('id,user_id,status,request,progress,output_object_path,thumbnail_object_path,error,created_at,completed_at')
      .order('created_at', {ascending: false})
      .limit(30);
    if (queryError) {
      setError(`履歴を読み込めません: ${queryError.message}`);
      return;
    }
    const nextJobs = (data as CloudJobRow[]).map(fromRow);
    const nextUrls: Record<string, {output?: string; thumbnail?: string}> = {};
    await Promise.all(nextJobs.filter((job) => job.status === 'completed').map(async (job) => {
      const [output, thumbnail] = await Promise.all([
        job.outputObjectPath ? client.storage.from(BUCKET).createSignedUrl(job.outputObjectPath, 3600) : null,
        job.thumbnailObjectPath ? client.storage.from(BUCKET).createSignedUrl(job.thumbnailObjectPath, 3600) : null,
      ]);
      nextUrls[job.id] = {
        output: output?.data?.signedUrl,
        thumbnail: thumbnail?.data?.signedUrl,
      };
    }));
    if (notificationEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      for (const job of nextJobs) {
        if (job.status === 'completed' && previousStatuses.current[job.id] && previousStatuses.current[job.id] !== 'completed') {
          new Notification('リールが完成しました', {body: job.request.title, icon: '/reel-piyo-icon-192.png'});
        }
      }
    }
    previousStatuses.current = Object.fromEntries(nextJobs.map((job) => [job.id, job.status]));
    setJobs(nextJobs);
    setUrls(nextUrls);
  }, [client, notificationEnabled]);

  useEffect(() => {
    void loadJobs();
    const timer = window.setInterval(() => void loadJobs(), 5000);
    return () => window.clearInterval(timer);
  }, [loadJobs]);

  const selectFile = (kind: 'background' | 'audio', file: File | undefined) => {
    if (!file) return;
    try {
      validateCloudFile(kind, file);
      if (kind === 'background') setBackground(file);
      else {
        setBgm(file);
        setUseDefaultBgm(false);
      }
      setError(null);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    }
  };

  const selectOverlays = (files: FileList | null) => {
    if (!files) return;
    try {
      const next = Array.from(files).slice(0, 12 - overlays.length);
      next.forEach((file) => validateCloudFile('overlay', file));
      setOverlays((current) => [...current, ...next].slice(0, 12));
      setError(null);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    }
  };

  const requestNotification = async () => {
    if (typeof Notification === 'undefined') {
      setError('このブラウザでは通知を利用できません。');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationEnabled(permission === 'granted');
    if (permission !== 'granted') setError('通知は許可されませんでした。履歴画面では進み具合を確認できます。');
  };

  const createReel = async () => {
    if (!background) {
      setError('背景を追加してください。');
      return;
    }
    if (overlays.length === 0) {
      setError('透過PNGを1枚以上追加してください。');
      return;
    }
    if (submissionInFlight.current) {
      setError('同じ内容のリールをただいま生成中です。完成までお待ちください。');
      return;
    }
    submissionInFlight.current = true;
    setBusy(true);
    setError(null);
    const uploadedPaths: string[] = [];
    try {
      const submissionFingerprint = await createSubmissionFingerprint({
        title,
        motionTemplateId,
        globalStrength: strength,
        background,
        overlays,
        texts,
        bgm,
        useWorkerDefaultBgm: !bgm && useDefaultBgm,
      });
      const duplicate = jobs.some((job) =>
        (job.status === 'queued' || job.status === 'processing')
        && job.request.submissionFingerprint === submissionFingerprint,
      );
      if (duplicate) {
        setError('同じ内容のリールをただいま生成中です。完成までお待ちください。');
        return;
      }
      const total = 1 + overlays.length + (bgm ? 1 : 0);
      let completed = 0;
      const upload = async (kind: 'background' | 'overlay' | 'audio', file: File, label: string) => {
        setUploadLabel(label);
        const result = await uploadCloudFile({
          userId: session.user.id,
          kind,
          file,
          onProgress: (value) => setUploadProgress((completed + value) / total),
        });
        completed += 1;
        uploadedPaths.push(result.objectPath);
        return result;
      };
      const backgroundRef = await upload('background', background, '背景を送信しています');
      const overlayRefs = [];
      for (let index = 0; index < overlays.length; index += 1) {
        const ref = await upload('overlay', overlays[index], `PNG ${index + 1}/${overlays.length} を送信しています`);
        overlayRefs.push({...ref, role: index === 0 ? 'primary' as const : 'decoration' as const});
      }
      const bgmRef = bgm ? await upload('audio', bgm, 'BGMを送信しています') : null;
      const request = RemoteReelRequestSchema.parse({
        schemaVersion: 1,
        submissionFingerprint,
        title,
        motionTemplateId,
        globalStrength: strength,
        background: backgroundRef,
        overlays: overlayRefs,
        texts: texts.map((value) => value.trim()).filter(Boolean),
        bgm: bgmRef,
        useWorkerDefaultBgm: !bgmRef && useDefaultBgm,
      });
      setUploadLabel('生成を予約しています');
      const {error: insertError} = await client.schema('reel').from('remote_reel_jobs').insert({
        user_id: session.user.id,
        status: 'queued',
        request,
        progress: 0,
      });
      if (insertError) throw new Error(`生成を予約できません: ${insertError.message}`);
      setUploadProgress(1);
      setUploadLabel('Macへ生成を依頼しました');
      await loadJobs();
      document.querySelector('#cloud-recent')?.scrollIntoView({behavior: 'smooth'});
    } catch (value) {
      if (uploadedPaths.length > 0) await client.storage.from(BUCKET).remove(uploadedPaths).catch(() => undefined);
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      submissionInFlight.current = false;
      setBusy(false);
      window.setTimeout(() => {
        setUploadLabel(null);
        setUploadProgress(0);
      }, 1800);
    }
  };

  const retry = async (job: CloudJob) => {
    setError(null);
    const {error: insertError} = await client.schema('reel').from('remote_reel_jobs').insert({
      user_id: session.user.id,
      status: 'queued',
      request: job.request,
      progress: 0,
    });
    if (insertError) setError(`再試行できません: ${insertError.message}`);
    else await loadJobs();
  };

  const removeJob = async (job: CloudJob) => {
    if (!window.confirm(`「${job.request.title}」を履歴から削除しますか？`)) return;
    const {error: deleteError} = await client.schema('reel').from('remote_reel_jobs').delete().eq('id', job.id);
    if (deleteError) {
      setError(`削除できません: ${deleteError.message}`);
      return;
    }
    const paths = [
      job.request.background.objectPath,
      ...job.request.overlays.map((item) => item.objectPath),
      ...(job.request.bgm ? [job.request.bgm.objectPath] : []),
      ...(job.outputObjectPath ? [job.outputObjectPath] : []),
      ...(job.thumbnailObjectPath ? [job.thumbnailObjectPath] : []),
    ];
    await client.storage.from(BUCKET).remove(paths);
    await loadJobs();
  };

  const share = async (job: CloudJob) => {
    const url = urls[job.id]?.output;
    if (!url) return;
    if (navigator.share) {
      await navigator.share({title: job.request.title, text: '完成したうさぽんリール', url}).catch(() => undefined);
    } else window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="app-shell cloud-shell">
      <header className="topbar cloud-topbar">
        <a className="brand" href="#cloud-editor"><span className="brand-mark">🐰</span><span>うさぽん リールメーカー</span></a>
        <nav className="nav-links" aria-label="クラウド版メニュー">
          <a className="nav-link active" href="#cloud-editor">作る</a>
          <a className="nav-link" href="#cloud-recent">完成動画</a>
          <button className="nav-link cloud-signout" type="button" onClick={() => void client.auth.signOut()}>ログアウト</button>
        </nav>
      </header>
      <main className="page cloud-page" id="cloud-editor">
        <div className="page-heading cloud-heading">
          <div><div className="eyebrow">Mobile reel studio</div><h1>素材を選んで、Macへおまかせ</h1><p className="lead">スマホやiPadから30秒リールを作れます。</p></div>
          <button className="button" type="button" onClick={() => void requestNotification()}>
            {notificationEnabled ? '通知オン' : '完成通知を受け取る'}
          </button>
        </div>

        <div className="cloud-workspace">
          <section className="panel cloud-preview-panel" aria-label="簡易プレビュー">
            <div className="cloud-phone-preview">
              {backgroundUrl ? (
                background?.type.startsWith('video/')
                  ? <video src={backgroundUrl} autoPlay muted loop playsInline />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={backgroundUrl} alt="背景プレビュー" />
              ) : <div className="cloud-preview-empty">背景を選ぶと<br />ここに表示されます</div>}
              <div className="cloud-overlay-stack">
                {overlayUrls.slice(0, 4).map((item, index) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={`${item.file.name}-${index}`} src={item.url} alt="" style={{
                    width: index === 0 ? '64%' : '27%',
                    left: index === 0 ? '18%' : `${8 + (index - 1) * 29}%`,
                    top: index === 0 ? '34%' : '68%',
                  }} />
                ))}
              </div>
              <div className="cloud-preview-text"><strong>{texts[0]}</strong><span>{texts[1]}</span></div>
            </div>
            <p className="preview-note">配置と動きはMacがセーフゾーン内へ自動調整します</p>
          </section>

          <section className="panel controls-panel cloud-controls">
            <div className="section">
              <div className="step-label"><span className="step-number">1</span>基本情報</div>
              <label className="field cloud-field-gap"><span className="label">リール名</span><input className="text-input" value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} /></label>
            </div>
            <div className="section">
              <div className="step-label"><span className="step-number">2</span>素材</div>
              <div className="cloud-upload-list">
                <label className={`upload-card cloud-upload-card ${background ? 'selected' : ''}`}>
                  <input className="hidden-input" type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime,.mov" onChange={(event) => selectFile('background', event.target.files?.[0])} />
                  <b>{background ? '背景を変更' : '背景を追加'}</b><span>{background?.name ?? 'JPG・PNG・MOV・MP4'}</span>
                </label>
                <label className={`upload-card cloud-upload-card ${overlays.length ? 'selected' : ''}`}>
                  <input className="hidden-input" type="file" accept="image/png" multiple onChange={(event) => selectOverlays(event.target.files)} />
                  <b>透過PNGを追加</b><span>{overlays.length ? `${overlays.length}枚選択中` : 'うさぽん・商品・ロゴなど'}</span>
                </label>
              </div>
              {overlays.length ? <div className="cloud-selected-files">{overlays.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button type="button" aria-label={`${file.name}を外す`} onClick={() => setOverlays((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></span>)}</div> : null}
            </div>
            <div className="section">
              <div className="step-label"><span className="step-number">3</span>テキスト（任意）</div>
              <div className="field-row cloud-field-gap">
                <input className="text-input" value={texts[0]} maxLength={160} placeholder="タイトル" onChange={(event) => setTexts([event.target.value, texts[1]])} />
                <input className="text-input" value={texts[1]} maxLength={160} placeholder="ひとこと" onChange={(event) => setTexts([texts[0], event.target.value])} />
              </div>
            </div>
            <div className="section">
              <div className="step-label"><span className="step-number">4</span>雰囲気</div>
              <div className="mood-grid cloud-field-gap">{BUILTIN_MOTION_TEMPLATES.map((template) => <button className={`mood-card ${motionTemplateId === template.id ? 'active' : ''}`} type="button" key={template.id} onClick={() => setMotionTemplateId(template.id)}>{template.name}<small>{template.description}</small></button>)}</div>
              <label className="field cloud-field-gap"><span className="label">動きの強さ {Math.round(strength * 100)}%</span><input className="range" type="range" min="0" max="2" step="0.1" value={strength} onChange={(event) => setStrength(Number(event.target.value))} /></label>
            </div>
            <div className="section">
              <div className="step-label"><span className="step-number">5</span>BGM</div>
              <label className="cloud-check"><input type="checkbox" checked={useDefaultBgm && !bgm} disabled={Boolean(bgm)} onChange={(event) => setUseDefaultBgm(event.target.checked)} /><span>Macに登録済みのおすすめBGMを使う</span></label>
              <label className={`upload-card cloud-upload-card cloud-bgm-card ${bgm ? 'selected' : ''}`}>
                <input className="hidden-input" type="file" accept="audio/mpeg,audio/mp4,audio/aac,audio/wav,.mp3,.m4a,.aac,.wav" onChange={(event) => selectFile('audio', event.target.files?.[0])} />
                <b>{bgm ? 'BGMを変更' : '自分のBGMを追加'}</b><span>{bgm?.name ?? 'MP3・M4A・AAC・WAV'}</span>
              </label>
              {bgm ? <button className="button cloud-clear-bgm" type="button" onClick={() => {setBgm(null); setUseDefaultBgm(true);}}>登録済みBGMへ戻す</button> : null}
            </div>
            {uploadLabel ? <div className="cloud-upload-progress"><div><strong>{uploadLabel}</strong><span>{Math.round(uploadProgress * 100)}%</span></div><div className="progress"><span style={{width: `${Math.max(3, uploadProgress * 100)}%`}} /></div></div> : null}
            <button className="button primary big full cloud-create-button" type="button" disabled={busy} onClick={() => void createReel()}>{busy ? '送信しています…' : 'リールを作る'}</button>
          </section>
        </div>

        <section className="history-section" id="cloud-recent">
          <div className="section-head cloud-history-head"><div><div className="eyebrow">Recent reels</div><h2>完成動画・生成状況</h2></div><span className="lead">Macが停止中でも生成待ちとして残ります</span></div>
          {jobs.length === 0 ? <div className="empty-state">最初のリールを作ると、ここに進み具合が表示されます。</div> : <div className="history-grid cloud-history-grid">{jobs.map((job) => {
            const template = BUILTIN_MOTION_TEMPLATES.find((item) => item.id === job.request.motionTemplateId);
            const media = urls[job.id];
            return <article className="history-card" key={job.id}>
              {media?.thumbnail ? <a href={media.output} target="_blank" rel="noreferrer"><img className="history-media" src={media.thumbnail} alt={`${job.request.title}のサムネイル`} /></a> : <div className="history-placeholder"><span className={`cloud-job-badge ${job.status}`}>{job.status === 'queued' ? '生成待ち' : job.status === 'processing' ? `生成中 ${Math.round(job.progress * 100)}%` : job.status === 'failed' ? '生成できませんでした' : '完成'}</span>{job.error ? <small>{job.error}</small> : null}</div>}
              <div className="history-body"><h3 className="truncate">{job.request.title}</h3><div className="meta"><span className="tag">{template?.name ?? 'テンプレート'}</span><span>{formatDate(job.createdAt)}</span></div>
                {job.status === 'queued' || job.status === 'processing' ? <div className="progress"><span style={{width: `${Math.max(3, job.progress * 100)}%`}} /></div> : null}
                <div className="button-row cloud-history-actions">{job.status === 'completed' && media?.output ? <><a className="button primary" href={media.output} target="_blank" rel="noreferrer">動画を開く</a><button className="button" type="button" onClick={() => void share(job)}>共有</button></> : null}{job.status === 'failed' ? <button className="button" type="button" onClick={() => void retry(job)}>再試行</button> : null}{job.status === 'completed' || job.status === 'failed' ? <button className="button danger" type="button" onClick={() => void removeJob(job)}>削除</button> : null}</div>
              </div>
            </article>;
          })}</div>}
        </section>
      </main>
      {error ? <button className="error-banner" type="button" onClick={() => setError(null)}>{error}</button> : null}
    </div>
  );
}
