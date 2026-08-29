'use client';

import Link from 'next/link';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  CANVAS,
  createImageLayer,
  createTextLayer,
  type AssetRecord,
  type BgmTrack,
  type MotionTemplateV1,
  type ProjectDocumentV1,
  type ProjectLayer,
  type ReelTemplateV1,
  type RenderableProject,
  type RenderJob,
} from '@usapon-reel/core';
import {api, uploadFile} from '@/src/lib/api-client';
import {EditorPreview} from './editor-preview';
import {RenderHistory} from './render-history';

type BootstrapPayload = {
  project: ProjectDocumentV1;
  projects: ProjectDocumentV1[];
  assets: AssetRecord[];
  motionTemplates: MotionTemplateV1[];
  reelTemplates: ReelTemplateV1[];
  bgmTracks: BgmTrack[];
  renderJobs: RenderJob[];
};

const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: {'Content-Type': 'application/json'},
  ...(body === undefined ? {} : {body: JSON.stringify(body)}),
});

function AppHeader() {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span>うさぽん リールメーカー</span>
      </Link>
      <nav className="nav-links" aria-label="メインメニュー">
        <Link className="nav-link active" href="/">新しいリール</Link>
        <a className="nav-link" href="#recent">最近作ったリール</a>
        <Link className="nav-link" href="/templates">雰囲気テンプレート</Link>
      </nav>
    </header>
  );
}

function filenameOf(asset: AssetRecord | undefined): string {
  return asset?.originalName ?? '未選択';
}

export function ReelMaker() {
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [project, setProject] = useState<ProjectDocumentV1 | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedReelTemplateId, setSelectedReelTemplateId] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [safeArea, setSafeArea] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  const refresh = useCallback(async (replaceProject = false) => {
    const payload = await api<BootstrapPayload>('/api/bootstrap', {cache: 'no-store'});
    setData(payload);
    if (replaceProject || !initialized.current) {
      setProject(payload.project);
      initialized.current = true;
    }
  }, []);

  useEffect(() => {
    void refresh(true).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [refresh]);

  useEffect(() => {
    if (!project || !initialized.current) return;
    setSaving(true);
    const timer = window.setTimeout(async () => {
      try {
        await api(`/api/projects/${project.id}`, jsonInit('PATCH', project));
        setSaving(false);
      } catch (reason) {
        setSaving(false);
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [project]);

  const hasProcessing = Boolean(
    data?.assets.some((asset) => asset.status === 'processing') ||
      data?.bgmTracks.some((track) => track.status === 'processing') ||
      data?.renderJobs.some((job) => job.status === 'queued' || job.status === 'processing'),
  );
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = window.setInterval(() => void refresh(false).catch(() => undefined), 1400);
    return () => window.clearInterval(timer);
  }, [hasProcessing, refresh]);

  const assetsById = useMemo(
    () => Object.fromEntries((data?.assets ?? []).map((asset) => [asset.id, asset])),
    [data?.assets],
  );
  const selectedLayer = project?.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const backgroundAsset = project?.background.assetId ? assetsById[project.background.assetId] : undefined;
  const selectedTrack = data?.bgmTracks.find((track) => track.id === project?.bgm?.trackId) ?? null;

  const renderable = useMemo<RenderableProject | null>(() => {
    if (!data || !project) return null;
    const template = data.motionTemplates.find((value) => value.id === project.motionTemplateId);
    if (!template) return null;
    const backgroundRecord = project.background.assetId ? assetsById[project.background.assetId] : null;
    const background = backgroundRecord && backgroundRecord.status === 'ready'
      ? {...backgroundRecord, src: `/api/assets/${backgroundRecord.id}`}
      : null;
    const imageAssets = Object.fromEntries(
      project.layers
        .filter((layer) => layer.type === 'image')
        .map((layer) => assetsById[layer.assetId])
        .filter((asset): asset is AssetRecord => Boolean(asset && asset.status === 'ready'))
        .map((asset) => [asset.id, {...asset, src: `/api/assets/${asset.id}`}]),
    );
    const track = project.bgm ? data.bgmTracks.find((value) => value.id === project.bgm?.trackId) : null;
    const bgm = track?.status === 'ready' ? {...track, src: `/api/assets/${track.assetId}?source=original`} : null;
    return {project, template, background, imageAssets, bgm};
  }, [assetsById, data, project]);

  const updateProject = (updater: (current: ProjectDocumentV1) => ProjectDocumentV1) => {
    setProject((current) => (current ? updater(current) : current));
  };
  const updateLayer = (layerId: string, updater: (layer: ProjectLayer) => ProjectLayer) => {
    updateProject((current) => ({
      ...current,
      layers: current.layers.map((layer) => (layer.id === layerId ? updater(layer) : layer)),
    }));
  };

  const uploadBackground = async (file: File) => {
    setBusy('background');
    try {
      const result = await uploadFile<{asset: AssetRecord}>('/api/assets', file, {kind: 'background'});
      setData((current) => (current ? {...current, assets: [result.asset, ...current.assets]} : current));
      updateProject((current) => ({...current, background: {...current.background, assetId: result.asset.id}}));
    } finally {
      setBusy(null);
    }
  };

  const uploadOverlay = async (file: File) => {
    setBusy('overlay');
    try {
      const result = await uploadFile<{asset: AssetRecord}>('/api/assets', file, {kind: 'overlay'});
      const count = project?.layers.filter((layer) => layer.type === 'image').length ?? 0;
      const layer = createImageLayer(result.asset.id, count);
      setData((current) => (current ? {...current, assets: [result.asset, ...current.assets]} : current));
      updateProject((current) => ({...current, layers: [...current.layers, layer]}));
      setSelectedLayerId(layer.id);
    } finally {
      setBusy(null);
    }
  };

  const uploadBgm = async (file: File) => {
    setBusy('bgm');
    try {
      const result = await uploadFile<{track: BgmTrack}>('/api/bgm', file);
      setData((current) => (current ? {...current, bgmTracks: [result.track, ...current.bgmTracks]} : current));
      updateProject((current) => ({...current, bgm: {trackId: result.track.id, trimStartMs: 0, volume: 1}}));
    } finally {
      setBusy(null);
    }
  };

  const runAction = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };

  const createRender = () => runAction('render', async () => {
    if (!project) return;
    await api('/api/renders', jsonInit('POST', {projectId: project.id, project}));
    await refresh(false);
    document.querySelector('#recent')?.scrollIntoView({behavior: 'smooth'});
  });

  const addText = () => {
    const count = project?.layers.filter((layer) => layer.type === 'text').length ?? 0;
    const layer = createTextLayer(count);
    updateProject((current) => ({...current, layers: [...current.layers, layer]}));
    setSelectedLayerId(layer.id);
    setDetailsOpen(true);
  };

  const autoLayout = () => runAction('layout', async () => {
    if (!project) return;
    const result = await api<{project: ProjectDocumentV1}>(
      `/api/projects/${project.id}/auto-layout`,
      jsonInit('POST', {project}),
    );
    setProject(result.project);
  });

  const createNew = () => runAction('new', async () => {
    const result = await api<{project: ProjectDocumentV1}>('/api/projects', {method: 'POST'});
    setProject(result.project);
    setSelectedLayerId(null);
    await refresh(false);
    window.scrollTo({top: 0, behavior: 'smooth'});
  });

  const loadProject = (projectId: string | null) => runAction('load', async () => {
    if (!projectId) throw new Error('元のリールが見つかりません。');
    const result = await api<{project: ProjectDocumentV1}>(`/api/projects/${projectId}`);
    setProject(result.project);
    window.scrollTo({top: 0, behavior: 'smooth'});
  });

  const duplicateProject = (projectId: string | null) => runAction('duplicate', async () => {
    if (!projectId) throw new Error('複製元のリールが見つかりません。');
    const result = await api<{project: ProjectDocumentV1}>(`/api/projects/${projectId}/duplicate`, {method: 'POST'});
    setProject(result.project);
    await refresh(false);
    window.scrollTo({top: 0, behavior: 'smooth'});
  });

  const projectFromRender = (job: RenderJob, action: 'reedit' | 'duplicate') => runAction(action, async () => {
    const result = await api<{project: ProjectDocumentV1}>(`/api/renders/${job.id}`, jsonInit('POST', {action}));
    setProject(result.project);
    setSelectedLayerId(null);
    await refresh(false);
    window.scrollTo({top: 0, behavior: 'smooth'});
  });

  const saveReelTemplate = () => runAction('save-template', async () => {
    if (!project) return;
    const name = window.prompt('テンプレート名', project.title);
    if (!name) return;
    await api('/api/reel-templates', jsonInit('POST', {projectId: project.id, name, project}));
    await refresh(false);
  });

  const applyReelTemplate = () => runAction('apply-template', async () => {
    if (!project || !selectedReelTemplateId) return;
    const result = await api<{project: ProjectDocumentV1; unresolvedBgm: boolean}>(
      `/api/reel-templates/${selectedReelTemplateId}/apply`,
      jsonInit('POST', {projectId: project.id, project}),
    );
    setProject(result.project);
    if (result.unresolvedBgm) setError('保存時のBGMが見つからないため、BGMを選び直してください。');
  });

  const exportReelTemplate = () => {
    const template = data?.reelTemplates.find((value) => value.id === selectedReelTemplateId);
    if (!template) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(template, null, 2)], {type: 'application/json'}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${template.name}.reel-template.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importReelTemplate = async (file: File) => {
    await runAction('import-template', async () => {
      await api('/api/reel-templates', jsonInit('POST', {action: 'import', json: await file.text()}));
      await refresh(false);
    });
  };

  const editBgm = async (updates: Partial<{title: string; bpm: number; firstBeatOffsetMs: number; tags: string[]}>) => {
    if (!selectedTrack) return;
    const result = await api<{track: BgmTrack}>(`/api/bgm/${selectedTrack.id}`, jsonInit('PATCH', updates));
    setData((current) => current ? {...current, bgmTracks: current.bgmTracks.map((track) => track.id === result.track.id ? result.track : track)} : current);
  };

  if (!data || !project) {
    return <main className="app-shell"><AppHeader /><div className="page"><div className="empty-state">アプリを準備しています…</div></div></main>;
  }

  return (
    <main className="app-shell">
      <AppHeader />
      <div className="page">
        <div className="page-heading">
          <div>
            <div className="eyebrow">30 seconds · 9:16</div>
            <h1>素材を入れたら、リール完成。</h1>
            <p className="lead">絵柄を変えずに、背景・PNG・文字を音楽に合わせて動かします。</p>
          </div>
          <div className="button-row">
            <button className="button" type="button" onClick={() => void createNew()} disabled={busy === 'new'}>＋ 新しいリール</button>
            <select
              className="select-input"
              aria-label="保存済みリールを開く"
              value={project.id}
              onChange={(event) => void loadProject(event.target.value)}
              style={{width: 190}}
            >
              {data.projects.map((value) => <option key={value.id} value={value.id}>{value.title}</option>)}
            </select>
          </div>
        </div>

        <div className="workspace">
          <section className="panel controls-panel">
            <div className="section">
              <div className="field">
                <label className="label" htmlFor="reel-title">リール名</label>
                <input id="reel-title" className="text-input" value={project.title} onChange={(event) => updateProject((current) => ({...current, title: event.target.value}))} />
              </div>
            </div>

            <div className="section">
              <div className="section-head"><h2 className="step-label"><span className="step-number">1</span>素材を入れる</h2></div>
              <div className="upload-grid">
                <label className="upload-card">
                  🖼️ 背景を追加
                  <span>JPG・PNG・MOV・MP4</span>
                  <input className="hidden-input" type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime,.mov" disabled={busy === 'background'} onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void runAction('background', () => uploadBackground(file));
                    event.currentTarget.value = '';
                  }} />
                </label>
                <label className="upload-card">
                  🐰 PNGを追加
                  <span>透過PNG・複数枚OK</span>
                  <input className="hidden-input" type="file" accept="image/png" disabled={busy === 'overlay'} onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void runAction('overlay', () => uploadOverlay(file));
                    event.currentTarget.value = '';
                  }} />
                </label>
              </div>
              {backgroundAsset ? (
                <div className="asset-chip">
                  <span>{backgroundAsset.status === 'processing' ? '⏳' : '✓'}</span>
                  <div className="grow truncate">背景：{filenameOf(backgroundAsset)}</div>
                  <button className="button" type="button" onClick={() => updateProject((current) => ({...current, background: {...current.background, assetId: null}}))}>外す</button>
                </div>
              ) : null}
              {project.layers.filter((layer) => layer.type === 'image').map((layer) => (
                <button className="asset-chip full" type="button" key={layer.id} onClick={() => {setSelectedLayerId(layer.id); setDetailsOpen(true);}}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/assets/${layer.assetId}`} alt="" />
                  <span className="grow truncate">{layer.name} · {filenameOf(assetsById[layer.assetId])}</span>
                  <span>調整 ›</span>
                </button>
              ))}
              <div className="button-row" style={{marginTop: 10}}>
                <button className="button soft" type="button" onClick={addText}>＋ テキスト</button>
                <button className="button" type="button" onClick={() => void autoLayout()} disabled={busy === 'layout' || project.layers.length === 0}>✨ いい感じに配置</button>
              </div>
            </div>

            <div className="section">
              <div className="section-head">
                <h2 className="step-label"><span className="step-number">2</span>雰囲気を選ぶ</h2>
                <Link className="button" href="/templates">追加・調整</Link>
              </div>
              <div className="mood-grid">
                {data.motionTemplates.map((template) => (
                  <button
                    className={`mood-card ${project.motionTemplateId === template.id ? 'active' : ''}`}
                    type="button"
                    key={template.id}
                    onClick={() => updateProject((current) => ({...current, motionTemplateId: template.id}))}
                  >
                    {template.name}<small>{template.builtin ? '初期' : 'カスタム'}</small>
                  </button>
                ))}
              </div>
              <div className="field" style={{marginTop: 12}}>
                <label className="label">動きの強さ：{Math.round(project.globalStrength * 100)}%</label>
                <input className="range" type="range" min="0" max="2" step="0.05" value={project.globalStrength} onChange={(event) => updateProject((current) => ({...current, globalStrength: Number(event.target.value)}))} />
              </div>
            </div>

            <div className="section">
              <div className="section-head"><h2 className="step-label"><span className="step-number">3</span>BGMを選ぶ</h2></div>
              <div className="field-row">
                <select
                  className="select-input"
                  value={project.bgm?.trackId ?? ''}
                  onChange={(event) => updateProject((current) => ({...current, bgm: event.target.value ? {trackId: event.target.value, trimStartMs: 0, volume: 1} : null}))}
                >
                  <option value="">BGMなし</option>
                  {data.bgmTracks.map((track) => <option key={track.id} value={track.id} disabled={track.status !== 'ready'}>{track.title}{track.status === 'processing' ? '（解析中）' : ''}</option>)}
                </select>
                <label className="button">
                  ＋ 音源を追加
                  <input className="hidden-input" type="file" accept="audio/mpeg,audio/mp4,audio/aac,audio/wav,.m4a,.mp3,.wav,.aac" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void runAction('bgm', () => uploadBgm(file));
                    event.currentTarget.value = '';
                  }} />
                </label>
              </div>
              {selectedTrack ? (
                <div className="detail-drawer">
                  <div className="meta">
                    <span className="tag">{selectedTrack.bpm ? `${selectedTrack.bpm} BPM` : '解析中'}</span>
                    <span className="tag">{selectedTrack.durationMs ? `${(selectedTrack.durationMs / 1000).toFixed(1)}秒` : '長さ解析中'}</span>
                    {selectedTrack.rmsDb !== null ? <span className="tag">RMS {selectedTrack.rmsDb.toFixed(1)} dB</span> : null}
                  </div>
                  {selectedTrack.analysisWarning ? <p className="notice warning" style={{marginTop: 10}}>{selectedTrack.analysisWarning}</p> : null}
                  <div className="field-row" style={{marginTop: 10}}>
                    <label className="field"><span className="label">BPM</span><input className="number-input" type="number" min="40" max="240" step="0.1" defaultValue={selectedTrack.bpm ?? ''} onBlur={(event) => {const value = Number(event.target.value); if (value) void editBgm({bpm: value});}} /></label>
                    <label className="field"><span className="label">先頭拍（ms）</span><input className="number-input" type="number" min="0" step="10" defaultValue={selectedTrack.firstBeatOffsetMs} onBlur={(event) => void editBgm({firstBeatOffsetMs: Number(event.target.value)})} /></label>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="section">
              <div className="section-head"><h2>素材差し替え用テンプレート</h2></div>
              <div className="field-row">
                <select className="select-input" value={selectedReelTemplateId} onChange={(event) => setSelectedReelTemplateId(event.target.value)}>
                  <option value="">テンプレートを選択</option>
                  {data.reelTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
                <button className="button" type="button" disabled={!selectedReelTemplateId} onClick={() => void applyReelTemplate()}>適用</button>
              </div>
              <div className="button-row" style={{marginTop: 9}}>
                <button className="button" type="button" onClick={() => void saveReelTemplate()}>今の設定を保存</button>
                <button className="button" type="button" disabled={!selectedReelTemplateId} onClick={exportReelTemplate}>JSON書き出し</button>
                <label className="button">JSON読み込み<input className="hidden-input" type="file" accept="application/json,.json" onChange={(event) => {const file = event.target.files?.[0]; if (file) void importReelTemplate(file); event.currentTarget.value = '';}} /></label>
              </div>
            </div>

            <div className="section">
              <button className="button primary big full" type="button" onClick={() => void createRender()} disabled={busy === 'render' || !project.background.assetId || !project.layers.some((layer) => layer.type === 'image')}>
                {busy === 'render' ? '準備しています…' : '🎬 リールを作る'}
              </button>
              <p className="preview-note">1080×1920 · 30秒 · H.264 / AAC</p>
            </div>
          </section>

          <section className="panel preview-panel">
            <div className="preview-toolbar">
              <div>
                <h2 style={{marginBottom: 2}}>プレビュー</h2>
                <span className="save-status"><span className={`status-dot ${saving ? 'saving' : ''}`} />{saving ? '保存中…' : '保存済み'}</span>
              </div>
              <div className="button-row">
                <button className="button" type="button" onClick={() => setSafeArea((value) => !value)}>{safeArea ? 'ガイドを隠す' : 'ガイドを表示'}</button>
                <button className="button" type="button" onClick={() => setDetailsOpen((value) => !value)}>詳細設定</button>
              </div>
            </div>
            <EditorPreview
              input={renderable}
              selectedLayer={selectedLayer}
              showSafeArea={safeArea}
              onMoveLayer={(x, y) => selectedLayerId && updateLayer(selectedLayerId, (layer) => ({...layer, transform: {...layer.transform, x, y}}))}
            />
            <p className="preview-note">素材を選んでドラッグすると位置を調整できます。</p>

            {detailsOpen ? (
              <div className="detail-drawer">
                <div className="section-head"><h3>詳細設定</h3><span className="lead">自由タイムラインは使いません</span></div>
                <div className="layer-list">
                  {project.layers.map((layer) => <button key={layer.id} type="button" className={`layer-pill ${selectedLayerId === layer.id ? 'active' : ''}`} onClick={() => setSelectedLayerId(layer.id)}>{layer.name}</button>)}
                </div>
                {selectedLayer ? (
                  <>
                    {selectedLayer.type === 'text' ? (
                      <label className="field"><span className="label">文字</span><textarea className="textarea" value={selectedLayer.text} onChange={(event) => updateLayer(selectedLayer.id, (layer) => layer.type === 'text' ? {...layer, text: event.target.value} : layer)} /></label>
                    ) : (
                      <label className="field"><span className="label">素材の役割</span><select className="select-input" value={selectedLayer.role} onChange={(event) => updateLayer(selectedLayer.id, (layer) => layer.type === 'image' ? {...layer, role: event.target.value as 'primary' | 'logo' | 'decoration'} : layer)}><option value="primary">主役</option><option value="logo">ロゴ</option><option value="decoration">装飾</option></select></label>
                    )}
                    <div className="detail-grid">
                      <label className="field"><span className="label">横位置 %</span><input className="number-input" type="number" value={Math.round(selectedLayer.transform.x * 100)} onChange={(event) => updateLayer(selectedLayer.id, (layer) => ({...layer, transform: {...layer.transform, x: Number(event.target.value) / 100}}))} /></label>
                      <label className="field"><span className="label">縦位置 %</span><input className="number-input" type="number" value={Math.round(selectedLayer.transform.y * 100)} onChange={(event) => updateLayer(selectedLayer.id, (layer) => ({...layer, transform: {...layer.transform, y: Number(event.target.value) / 100}}))} /></label>
                      <label className="field"><span className="label">大きさ %</span><input className="number-input" type="number" min="2" max="200" value={Math.round(selectedLayer.transform.width * 100)} onChange={(event) => updateLayer(selectedLayer.id, (layer) => ({...layer, transform: {...layer.transform, width: Number(event.target.value) / 100}}))} /></label>
                      <label className="field"><span className="label">回転 °</span><input className="number-input" type="number" min="-360" max="360" value={selectedLayer.transform.rotation} onChange={(event) => updateLayer(selectedLayer.id, (layer) => ({...layer, transform: {...layer.transform, rotation: Number(event.target.value)}}))} /></label>
                      <label className="field"><span className="label">重なり順</span><input className="number-input" type="number" min="0" max="999" value={selectedLayer.zIndex} onChange={(event) => updateLayer(selectedLayer.id, (layer) => ({...layer, zIndex: Number(event.target.value)}))} /></label>
                      <label className="field"><span className="label">動き %</span><input className="number-input" type="number" min="0" max="200" value={Math.round(selectedLayer.strength * 100)} onChange={(event) => updateLayer(selectedLayer.id, (layer) => ({...layer, strength: Number(event.target.value) / 100}))} /></label>
                      <label className="field"><span className="label">開始 秒</span><input className="number-input" type="number" min="0" max="29.9" step="0.1" value={(selectedLayer.startFrame / CANVAS.fps).toFixed(1)} onChange={(event) => updateLayer(selectedLayer.id, (layer) => ({...layer, startFrame: Math.round(Number(event.target.value) * CANVAS.fps)}))} /></label>
                      <label className="field"><span className="label">終了 秒</span><input className="number-input" type="number" min="0.1" max="30" step="0.1" value={(selectedLayer.endFrame / CANVAS.fps).toFixed(1)} onChange={(event) => updateLayer(selectedLayer.id, (layer) => ({...layer, endFrame: Math.round(Number(event.target.value) * CANVAS.fps)}))} /></label>
                      {selectedLayer.type === 'text' ? <label className="field"><span className="label">文字サイズ</span><input className="number-input" type="number" min="20" max="240" value={selectedLayer.style.fontSize} onChange={(event) => updateLayer(selectedLayer.id, (layer) => layer.type === 'text' ? {...layer, style: {...layer.style, fontSize: Number(event.target.value)}} : layer)} /></label> : null}
                    </div>
                    <button className="button danger" style={{marginTop: 11}} type="button" onClick={() => {updateProject((current) => ({...current, layers: current.layers.filter((layer) => layer.id !== selectedLayer.id)})); setSelectedLayerId(null);}}>この素材を削除</button>
                  </>
                ) : <div className="notice">素材またはテキストを選ぶと、位置と動きを調整できます。</div>}
              </div>
            ) : null}
          </section>
        </div>

        <RenderHistory
          jobs={data.renderJobs}
          templates={data.motionTemplates}
          tracks={data.bgmTracks}
          onReedit={(job) => void projectFromRender(job, 'reedit')}
          onDuplicate={(job) => void projectFromRender(job, 'duplicate')}
          onRetry={(job) => void runAction('retry', async () => {await api(`/api/renders/${job.id}`, {method: 'POST'}); await refresh(false);})}
          onDelete={(job) => {
            if (!window.confirm('この生成履歴と完成MP4を削除します。原素材やBGMは残ります。')) return;
            void runAction('delete', async () => {await api(`/api/renders/${job.id}`, {method: 'DELETE'}); await refresh(false);});
          }}
        />
      </div>
      {error ? <button className="error-banner" type="button" onClick={() => setError(null)}>{error}<span style={{float: 'right'}}>×</span></button> : null}
    </main>
  );
}
