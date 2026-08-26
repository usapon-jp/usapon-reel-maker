'use client';

import {useState} from 'react';
import type {BgmTrack, MotionTemplateV1, RenderJob} from '@usapon-reel/core';

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{description: string; accept: Record<string, string[]>}>;
  }) => Promise<{createWritable(): Promise<{write(data: Blob): Promise<void>; close(): Promise<void>}>}>;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}).format(new Date(value));
}

export function RenderHistory({
  jobs,
  templates,
  tracks,
  onReedit,
  onDuplicate,
  onRetry,
  onDelete,
}: {
  jobs: RenderJob[];
  templates: MotionTemplateV1[];
  tracks: BgmTrack[];
  onReedit: (job: RenderJob) => void;
  onDuplicate: (job: RenderJob) => void;
  onRetry: (job: RenderJob) => void;
  onDelete: (job: RenderJob) => void;
}) {
  const [playing, setPlaying] = useState<string | null>(null);

  const saveAs = async (job: RenderJob) => {
    const url = `/api/renders/${job.id}/file`;
    const fileName = `${String(job.payload.title ?? 'うさぽんリール').replace(/[\\/:*?"<>|]/g, '-')}.mp4`;
    const picker = (window as SavePickerWindow).showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({
          suggestedName: fileName,
          types: [{description: 'MP4動画', accept: {'video/mp4': ['.mp4']}}],
        });
        const blob = await (await fetch(url)).blob();
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  };

  return (
    <section className="history-section" id="recent">
      <div className="section-head">
        <div>
          <div className="eyebrow">Recent reels</div>
          <h2>最近作ったリール</h2>
        </div>
        <span className="lead">複製して、素材だけ差し替えられます</span>
      </div>
      {jobs.length === 0 ? (
        <div className="empty-state">最初のリールを作ると、ここに履歴が残ります。</div>
      ) : (
        <div className="history-grid">
          {jobs.map((job) => {
            const template = templates.find((value) => value.id === job.snapshot?.motionTemplateId);
            const bgm = tracks.find((value) => value.id === job.snapshot?.bgm?.trackId);
            const title = String(job.payload.title ?? job.snapshot?.title ?? 'リール');
            return (
              <article className="history-card" key={job.id}>
                {job.status === 'completed' ? (
                  playing === job.id ? (
                    <video className="history-media" src={`/api/renders/${job.id}/file`} controls autoPlay playsInline />
                  ) : (
                    <button
                      type="button"
                      aria-label={`${title}を再生`}
                      onClick={() => setPlaying(job.id)}
                      style={{display: 'contents'}}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="history-media" src={`/api/renders/${job.id}/file?kind=thumbnail`} alt="" />
                    </button>
                  )
                ) : (
                  <div className="history-placeholder">
                    {job.status === 'failed' ? `生成できませんでした\n${job.error ?? ''}` : 'リールを生成しています…'}
                  </div>
                )}
                <div className="history-body">
                  <h3 className="truncate">{title}</h3>
                  <div className="meta">
                    <span className="tag">{template?.name ?? 'テンプレート不明'}</span>
                    <span className="tag">{bgm?.title ?? 'BGMなし'}</span>
                    <span>{formatDate(job.createdAt)}</span>
                  </div>
                  {job.status === 'queued' || job.status === 'processing' ? (
                    <div className="progress" aria-label={`生成 ${Math.round(job.progress * 100)}%`}>
                      <span style={{width: `${Math.max(3, job.progress * 100)}%`}} />
                    </div>
                  ) : null}
                  <div className="button-row" style={{marginTop: 11}}>
                    {job.status === 'completed' ? (
                      <>
                        <button className="button" type="button" onClick={() => void saveAs(job)}>保存</button>
                        <button className="button" type="button" onClick={() => onReedit(job)}>再編集</button>
                        <button className="button" type="button" onClick={() => onDuplicate(job)}>複製</button>
                      </>
                    ) : null}
                    {job.status === 'failed' ? <button className="button" type="button" onClick={() => onRetry(job)}>再試行</button> : null}
                    <button className="button danger" type="button" onClick={() => onDelete(job)}>削除</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
