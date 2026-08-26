'use client';

import {useMemo, useRef, useState} from 'react';
import {Player} from '@remotion/player';
import {CANVAS, type AssetRecord, type ProjectLayer, type RenderableProject} from '@usapon-reel/core';
import {ReelComposition} from '@usapon-reel/renderer';

export function EditorPreview({
  input,
  selectedLayer,
  onMoveLayer,
  showSafeArea,
}: {
  input: RenderableProject | null;
  selectedLayer: ProjectLayer | null;
  onMoveLayer: (x: number, y: number) => void;
  showSafeArea: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{pointerId: number; startX: number; startY: number; layerX: number; layerY: number} | null>(null);
  const selectedAsset = useMemo<AssetRecord | null>(() => {
    if (!input || !selectedLayer || selectedLayer.type !== 'image') return null;
    return input.imageAssets[selectedLayer.assetId] ?? null;
  }, [input, selectedLayer]);

  if (!input) return <div className="preview-empty">素材を追加すると、ここで30秒の動きを確認できます。</div>;

  const boxAspect = selectedLayer?.type === 'text'
    ? 3.6
    : selectedAsset?.width && selectedAsset.height
      ? selectedAsset.width / selectedAsset.height
      : 1;
  const boxWidthPercent = (selectedLayer?.transform.width ?? 0) * 100;
  const boxHeightPercent = selectedLayer
    ? (selectedLayer.transform.width * (CANVAS.width / CANVAS.height) * (1 / boxAspect)) * 100
    : 0;

  return (
    <div className="preview-stage" ref={stageRef}>
      <Player
        component={ReelComposition}
        inputProps={{input}}
        durationInFrames={CANVAS.durationFrames}
        compositionWidth={CANVAS.width}
        compositionHeight={CANVAS.height}
        fps={CANVAS.fps}
        controls
        loop
        allowFullscreen
        acknowledgeRemotionLicense
        style={{width: '100%', aspectRatio: '9 / 16', display: 'block'}}
      />
      {showSafeArea ? <div className="safe-area" /> : null}
      {selectedLayer ? (
        <div
          className="selection-box"
          aria-label={`${selectedLayer.name}をドラッグして移動`}
          style={{
            left: `${selectedLayer.transform.x * 100}%`,
            top: `${selectedLayer.transform.y * 100}%`,
            width: `${boxWidthPercent}%`,
            height: `${Math.max(3, boxHeightPercent)}%`,
            transform: `translate(-50%, -50%) rotate(${selectedLayer.transform.rotation}deg)`,
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag({
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              layerX: selectedLayer.transform.x,
              layerY: selectedLayer.transform.y,
            });
          }}
          onPointerMove={(event) => {
            if (!drag || drag.pointerId !== event.pointerId || !stageRef.current) return;
            const bounds = stageRef.current.getBoundingClientRect();
            const x = Math.min(1.2, Math.max(-0.2, drag.layerX + (event.clientX - drag.startX) / bounds.width));
            const y = Math.min(1.2, Math.max(-0.2, drag.layerY + (event.clientY - drag.startY) / bounds.height));
            onMoveLayer(x, y);
          }}
          onPointerUp={(event) => {
            if (drag?.pointerId === event.pointerId) setDrag(null);
          }}
          onPointerCancel={() => setDrag(null)}
        />
      ) : null}
    </div>
  );
}
