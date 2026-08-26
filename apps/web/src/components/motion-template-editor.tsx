'use client';

import Link from 'next/link';
import {useEffect, useMemo, useState} from 'react';
import {Player} from '@remotion/player';
import {
  CANVAS,
  createDefaultProject,
  createImageLayer,
  type AssetRecord,
  type BeatPrimitive,
  type MotionPrimitive,
  type MotionRecipe,
  type MotionTemplateV1,
  type RenderableProject,
} from '@usapon-reel/core';
import {ReelComposition} from '@usapon-reel/renderer';
import {api} from '@/src/lib/api-client';

type Target = 'background' | 'image' | 'text';
const targetLabels: Record<Target, string> = {background: '背景', image: 'PNG素材', text: 'テキスト'};
const idleLabels: Record<MotionPrimitive, string> = {
  floatY: '上下',
  swayX: '左右',
  slowZoom: 'ゆっくりズーム',
  rotate: '回転',
  panX: '横パン',
  panY: '縦パン',
};
const beatLabels: Record<BeatPrimitive, string> = {pulse: '拡大', jump: 'ジャンプ', rotate: '回転'};

const SAMPLE_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
  <ellipse cx="250" cy="450" rx="135" ry="24" fill="#dcbfa9" opacity=".45"/>
  <ellipse cx="175" cy="98" rx="47" ry="115" fill="#fff9f1" stroke="#6a5548" stroke-width="12" transform="rotate(-9 175 98)"/>
  <ellipse cx="325" cy="98" rx="47" ry="115" fill="#fff9f1" stroke="#6a5548" stroke-width="12" transform="rotate(9 325 98)"/>
  <ellipse cx="250" cy="290" rx="160" ry="155" fill="#fff9f1" stroke="#6a5548" stroke-width="12"/>
  <circle cx="195" cy="275" r="13" fill="#5b473c"/><circle cx="305" cy="275" r="13" fill="#5b473c"/>
  <path d="M230 324 Q250 344 270 324" fill="none" stroke="#de776a" stroke-width="10" stroke-linecap="round"/>
  <circle cx="158" cy="320" r="22" fill="#f4b4ab" opacity=".65"/><circle cx="342" cy="320" r="22" fill="#f4b4ab" opacity=".65"/>
</svg>`)}`;

function Header() {
  return (
    <header className="topbar">
      <Link href="/" className="brand"><span className="brand-mark">🐰</span><span>うさぽん リールメーカー</span></Link>
      <nav className="nav-links"><Link className="nav-link" href="/">新しいリール</Link><Link className="nav-link active" href="/templates">雰囲気テンプレート</Link></nav>
    </header>
  );
}

function RecipeEditor({recipe, disabled, onChange}: {recipe: MotionRecipe; disabled: boolean; onChange: (recipe: MotionRecipe) => void}) {
  return (
    <div className="recipe-card">
      <h3>登場</h3>
      <div className="motion-row">
        <label className="field"><span className="label">種類</span><select className="select-input" disabled={disabled} value={recipe.entry.primitive} onChange={(event) => onChange({...recipe, entry: {...recipe.entry, primitive: event.target.value as 'none' | 'fade' | 'slide'}})}><option value="none">なし</option><option value="fade">フェード</option><option value="slide">スライド</option></select></label>
        <label className="field"><span className="label">長さ（frame）</span><input className="number-input" disabled={disabled} type="number" min="0" max="120" value={recipe.entry.frames} onChange={(event) => onChange({...recipe, entry: {...recipe.entry, frames: Number(event.target.value)}})} /></label>
        <label className="field"><span className="label">距離</span><input className="number-input" disabled={disabled} type="number" min="0" max="1" step="0.01" value={recipe.entry.amount} onChange={(event) => onChange({...recipe, entry: {...recipe.entry, amount: Number(event.target.value)}})} /></label>
        <label className="field"><span className="label">方向</span><select className="select-input" disabled={disabled} value={recipe.entry.direction} onChange={(event) => onChange({...recipe, entry: {...recipe.entry, direction: event.target.value as 'left' | 'right' | 'up' | 'down'}})}><option value="left">左</option><option value="right">右</option><option value="up">上</option><option value="down">下</option></select></label>
      </div>

      <div className="section-head" style={{marginTop: 17}}><h3>常時の動き</h3><button className="button" type="button" disabled={disabled || recipe.idle.length >= 8} onClick={() => onChange({...recipe, idle: [...recipe.idle, {primitive: 'floatY', amount: 0.02, periodFrames: 150}]})}>＋ 動きを追加</button></div>
      {recipe.idle.length === 0 ? <div className="notice">常時の動きはありません。</div> : null}
      {recipe.idle.map((motion, index) => (
        <div className="motion-row" key={`${motion.primitive}-${index}`}>
          <label className="field"><span className="label">種類</span><select className="select-input" disabled={disabled} value={motion.primitive} onChange={(event) => onChange({...recipe, idle: recipe.idle.map((value, itemIndex) => itemIndex === index ? {...value, primitive: event.target.value as MotionPrimitive} : value)})}>{Object.entries(idleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label className="field"><span className="label">量</span><input className="number-input" disabled={disabled} type="number" min="-10" max="10" step="0.005" value={motion.amount} onChange={(event) => onChange({...recipe, idle: recipe.idle.map((value, itemIndex) => itemIndex === index ? {...value, amount: Number(event.target.value)} : value)})} /></label>
          <label className="field"><span className="label">周期（frame）</span><input className="number-input" disabled={disabled} type="number" min="10" max="1800" value={motion.periodFrames} onChange={(event) => onChange({...recipe, idle: recipe.idle.map((value, itemIndex) => itemIndex === index ? {...value, periodFrames: Number(event.target.value)} : value)})} /></label>
          <button className="button danger" type="button" disabled={disabled} onClick={() => onChange({...recipe, idle: recipe.idle.filter((_, itemIndex) => itemIndex !== index)})}>削除</button>
        </div>
      ))}

      <div className="section-head" style={{marginTop: 17}}><h3>ビート同期</h3><button className="button" type="button" disabled={disabled} onClick={() => onChange({...recipe, beat: recipe.beat ? null : {everyBeats: 2, durationFrames: 7, pattern: [{primitive: 'pulse', amount: 0.05}]}})}>{recipe.beat ? 'ビート同期を外す' : 'ビート同期を追加'}</button></div>
      {recipe.beat ? (
        <>
          <div className="field-row">
            <label className="field"><span className="label">何拍ごと</span><select className="select-input" disabled={disabled} value={recipe.beat.everyBeats} onChange={(event) => onChange({...recipe, beat: {...recipe.beat!, everyBeats: Number(event.target.value)}})}>{[1,2,4,8,16].map((value) => <option key={value} value={value}>{value}拍</option>)}</select></label>
            <label className="field"><span className="label">動く長さ（frame）</span><input className="number-input" disabled={disabled} type="number" min="1" max="60" value={recipe.beat.durationFrames} onChange={(event) => onChange({...recipe, beat: {...recipe.beat!, durationFrames: Number(event.target.value)}})} /></label>
          </div>
          {recipe.beat.pattern.map((motion, index) => (
            <div className="motion-row" key={`${motion.primitive}-${index}`}>
              <label className="field"><span className="label">拍の動き</span><select className="select-input" disabled={disabled} value={motion.primitive} onChange={(event) => onChange({...recipe, beat: {...recipe.beat!, pattern: recipe.beat!.pattern.map((value, itemIndex) => itemIndex === index ? {...value, primitive: event.target.value as BeatPrimitive} : value)}})}>{Object.entries(beatLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label className="field"><span className="label">量</span><input className="number-input" disabled={disabled} type="number" min="-10" max="10" step="0.005" value={motion.amount} onChange={(event) => onChange({...recipe, beat: {...recipe.beat!, pattern: recipe.beat!.pattern.map((value, itemIndex) => itemIndex === index ? {...value, amount: Number(event.target.value)} : value)}})} /></label>
              <span />
              <button className="button danger" type="button" disabled={disabled || recipe.beat!.pattern.length === 1} onClick={() => onChange({...recipe, beat: {...recipe.beat!, pattern: recipe.beat!.pattern.filter((_, itemIndex) => itemIndex !== index)}})}>削除</button>
            </div>
          ))}
          <button className="button" style={{marginTop: 9}} type="button" disabled={disabled || recipe.beat.pattern.length >= 8} onClick={() => onChange({...recipe, beat: {...recipe.beat!, pattern: [...recipe.beat!.pattern, {primitive: 'pulse', amount: 0.04}]}})}>＋ 拍パターン</button>
        </>
      ) : <div className="notice">この対象はビートでは動きません。</div>}

      <h3 style={{marginTop: 19}}>退出</h3>
      <div className="motion-row">
        <label className="field"><span className="label">種類</span><select className="select-input" disabled={disabled} value={recipe.exit.primitive} onChange={(event) => onChange({...recipe, exit: {...recipe.exit, primitive: event.target.value as 'none' | 'fade' | 'slide'}})}><option value="none">なし</option><option value="fade">フェード</option><option value="slide">スライド</option></select></label>
        <label className="field"><span className="label">長さ（frame）</span><input className="number-input" disabled={disabled} type="number" min="0" max="120" value={recipe.exit.frames} onChange={(event) => onChange({...recipe, exit: {...recipe.exit, frames: Number(event.target.value)}})} /></label>
        <label className="field"><span className="label">距離</span><input className="number-input" disabled={disabled} type="number" min="0" max="1" step="0.01" value={recipe.exit.amount} onChange={(event) => onChange({...recipe, exit: {...recipe.exit, amount: Number(event.target.value)}})} /></label>
        <label className="field"><span className="label">方向</span><select className="select-input" disabled={disabled} value={recipe.exit.direction} onChange={(event) => onChange({...recipe, exit: {...recipe.exit, direction: event.target.value as 'left' | 'right' | 'up' | 'down'}})}><option value="left">左</option><option value="right">右</option><option value="up">上</option><option value="down">下</option></select></label>
      </div>
    </div>
  );
}

export function MotionTemplateEditor() {
  const [templates, setTemplates] = useState<MotionTemplateV1[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<MotionTemplateV1 | null>(null);
  const [target, setTarget] = useState<Target>('image');
  const [message, setMessage] = useState<string | null>(null);

  const load = async (preferredId?: string) => {
    const result = await api<{templates: MotionTemplateV1[]}>('/api/motion-templates');
    setTemplates(result.templates);
    const id = preferredId ?? selectedId ?? result.templates[0]?.id;
    const selected = result.templates.find((value) => value.id === id) ?? result.templates[0];
    if (selected) {
      setSelectedId(selected.id);
      setDraft(structuredClone(selected));
    }
  };
  useEffect(() => {void load().catch((error) => setMessage(error.message));}, []);

  const sampleInput = useMemo<RenderableProject | null>(() => {
    if (!draft) return null;
    const project = createDefaultProject(draft.id);
    const layer = createImageLayer('sample-bunny', 0);
    layer.transform = {x: 0.5, y: 0.55, width: 0.58, rotation: 0};
    project.layers = [layer, {...createImageLayer('sample-bunny', 1), id: 'sample-secondary', name: '装飾', role: 'decoration', transform: {x: 0.78, y: 0.72, width: 0.22, rotation: 0}}];
    const asset: AssetRecord & {src: string} = {
      id: 'sample-bunny', kind: 'overlay', status: 'ready', originalName: 'sample.svg', mimeType: 'image/svg+xml', size: 1,
      checksum: 'sample', storageKey: 'sample', proxyStorageKey: null, width: 500, height: 500, durationMs: null,
      visibleBounds: {x: 0, y: 0, width: 500, height: 500}, error: null, createdAt: '2026-08-26T00:00:00.000Z', src: SAMPLE_SVG,
    };
    return {project, template: draft, background: null, imageAssets: {'sample-bunny': asset}, bgm: null};
  }, [draft]);

  const select = (template: MotionTemplateV1) => {
    setSelectedId(template.id);
    setDraft(structuredClone(template));
    setMessage(null);
  };
  const duplicate = async () => {
    if (!draft) return;
    const result = await api<{template: MotionTemplateV1}>('/api/motion-templates', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'duplicate', templateId: draft.id})});
    await load(result.template.id);
    setMessage('複製しました。名前と動きを調整できます。');
  };
  const save = async () => {
    if (!draft || draft.builtin) return;
    const result = await api<{template: MotionTemplateV1}>(`/api/motion-templates/${draft.id}`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(draft)});
    await load(result.template.id);
    setMessage('テンプレートを保存しました。');
  };
  const remove = async () => {
    if (!draft || draft.builtin || !window.confirm(`「${draft.name}」を削除しますか？`)) return;
    await api(`/api/motion-templates/${draft.id}`, {method: 'DELETE'});
    setSelectedId('');
    await load();
  };
  const exportJson = () => {
    if (!draft) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], {type: 'application/json'}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${draft.name}.motion-template.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importJson = async (file: File) => {
    try {
      const result = await api<{template: MotionTemplateV1}>('/api/motion-templates', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'import', json: await file.text()})});
      await load(result.template.id);
      setMessage('JSONからテンプレートを追加しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <main className="app-shell">
      <Header />
      <div className="page">
        <div className="page-heading">
          <div><div className="eyebrow">Motion templates</div><h1>雰囲気テンプレート</h1><p className="lead">初期テンプレートを複製し、設定データだけで新しい動きを増やせます。</p></div>
          <div className="button-row"><button className="button primary" type="button" disabled={!draft} onClick={() => void duplicate()}>＋ 選択中を複製</button><button className="button" type="button" onClick={exportJson}>JSON書き出し</button><label className="button">JSON読み込み<input className="hidden-input" type="file" accept="application/json,.json" onChange={(event) => {const file = event.target.files?.[0]; if (file) void importJson(file); event.currentTarget.value = '';}} /></label></div>
        </div>
        <div className="template-layout">
          <aside className="panel template-list">
            {templates.map((template) => <button className={`template-item ${template.id === selectedId ? 'active' : ''}`} type="button" key={template.id} onClick={() => select(template)}><strong>{template.name}</strong><span>{template.builtin ? '初期・複製して編集' : 'カスタム'}</span></button>)}
          </aside>
          {draft ? (
            <section className="panel template-editor">
              <div className="template-top">
                <div>
                  {draft.builtin ? <p className="notice">初期テンプレートはいつでも復元できるよう読み取り専用です。「選択中を複製」して調整してください。</p> : null}
                  <label className="field"><span className="label">名前</span><input className="text-input" disabled={draft.builtin} value={draft.name} onChange={(event) => setDraft({...draft, name: event.target.value})} /></label>
                  <label className="field"><span className="label">説明</span><textarea className="textarea" disabled={draft.builtin} value={draft.description} onChange={(event) => setDraft({...draft, description: event.target.value})} /></label>
                  <div className="button-row" style={{marginTop: 12}}><button className="button primary" type="button" disabled={draft.builtin} onClick={() => void save()}>保存</button><button className="button danger" type="button" disabled={draft.builtin} onClick={() => void remove()}>削除</button></div>
                  {message ? <p className="notice" style={{marginTop: 10}}>{message}</p> : null}
                </div>
                <div className="mini-preview">
                  {sampleInput ? <Player component={ReelComposition} inputProps={{input: sampleInput}} durationInFrames={CANVAS.durationFrames} compositionWidth={CANVAS.width} compositionHeight={CANVAS.height} fps={CANVAS.fps} controls loop acknowledgeRemotionLicense style={{width: '100%', aspectRatio: '9/16'}} /> : null}
                </div>
              </div>
              <div className="recipe-tabs">{(Object.keys(targetLabels) as Target[]).map((value) => <button key={value} className={`button ${target === value ? 'soft' : ''}`} type="button" onClick={() => setTarget(value)}>{targetLabels[value]}</button>)}</div>
              <RecipeEditor recipe={draft.config[target]} disabled={draft.builtin} onChange={(recipe) => setDraft({...draft, config: {...draft.config, [target]: recipe}})} />
            </section>
          ) : <div className="empty-state">テンプレートを読み込んでいます…</div>}
        </div>
      </div>
    </main>
  );
}
