import {CANVAS, SAFE_AREA, nowIso, type AssetRecord, type ProjectDocumentV1} from './types';

type AssetMap = Record<string, Pick<AssetRecord, 'width' | 'height' | 'visibleBounds'>>;

export function autoLayoutProject(project: ProjectDocumentV1, assets: AssetMap): ProjectDocumentV1 {
  const next = structuredClone(project);
  const imageLayers = next.layers.filter((layer) => layer.type === 'image');
  const textLayers = next.layers.filter((layer) => layer.type === 'text');
  const safeLeft = SAFE_AREA.left / CANVAS.width;
  const safeRight = 1 - SAFE_AREA.right / CANVAS.width;
  const safeTop = SAFE_AREA.top / CANVAS.height;
  const safeBottom = 1 - SAFE_AREA.bottom / CANVAS.height;

  const primaryLayers = imageLayers.filter((layer) => layer.role === 'primary');
  const logoLayers = imageLayers.filter((layer) => layer.role === 'logo');
  const decorations = imageLayers.filter((layer) => layer.role === 'decoration');

  primaryLayers.forEach((layer, index) => {
    const asset = assets[layer.assetId];
    const bounds = asset?.visibleBounds;
    const aspect = bounds
      ? bounds.width / bounds.height
      : asset?.width && asset.height
        ? asset.width / asset.height
        : 1;
    layer.transform.x = primaryLayers.length === 1 ? 0.5 : safeLeft + ((index + 1) / (primaryLayers.length + 1)) * (safeRight - safeLeft);
    layer.transform.y = 0.58;
    layer.transform.width = Math.min(aspect > 1.4 ? 0.66 : 0.54, 0.72 / Math.max(1, primaryLayers.length * 0.7));
    layer.transform.rotation = 0;
  });

  logoLayers.forEach((layer, index) => {
    layer.transform.x = safeLeft + 0.12 + index * 0.2;
    layer.transform.y = safeTop + 0.06;
    layer.transform.width = 0.22;
    layer.transform.rotation = 0;
  });

  const decorationPositions = [
    {x: 0.16, y: 0.3, rotation: -6},
    {x: 0.82, y: 0.38, rotation: 7},
    {x: 0.18, y: 0.76, rotation: 5},
    {x: 0.8, y: 0.72, rotation: -5},
  ];
  decorations.forEach((layer, index) => {
    const position = decorationPositions[index % decorationPositions.length];
    layer.transform = {...position, width: 0.24};
  });

  textLayers.forEach((layer, index) => {
    layer.transform.x = (safeLeft + safeRight) / 2;
    layer.transform.y = Math.min(safeBottom - 0.08, safeTop + 0.09 + index * 0.1);
    layer.transform.width = safeRight - safeLeft - 0.04;
    layer.transform.rotation = 0;
  });

  next.updatedAt = nowIso();
  return next;
}
