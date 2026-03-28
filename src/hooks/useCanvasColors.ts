/**
 * Returns theme-aware color values for canvas (Fabric.js) rendering.
 * Canvas elements cannot read CSS variables directly, so we read them from
 * computed style and return them as plain strings.
 */
export function useCanvasColors() {
  const root = (typeof document !== 'undefined' ? document.documentElement : null);

  const get = (varName: string, fallback: string): string => {
    if (!root) return fallback;
    return (
      getComputedStyle(root)
        .getPropertyValue(varName)
        .trim() || fallback
    );
  };

  return {
    // Card accents — these are brand/semantic colors
    aiAccent: get('--color-ai', '#7c3aed'),
    noteAccent: get('--color-note', '#0d9488'),
    // UI neutrals
    deleteBtnDefault: get('--color-border', '#d4d4d4'),
    deleteBtnHover: get('--color-danger', '#dc2626'),
    // Text
    statusText: get('--color-text-muted', '#78716c'),
    // Connector
    connectorStroke: get('--color-note', '#0d9488'),
    // Skeleton shimmer — bg is already CSS-variable driven via class names,
    // but the wave overlay needs explicit values
    skeletonWave: get('--color-bg-hover', '#f5f5f4'),
    skeletonWaveEnd: 'rgba(255,255,255,0.55)',
  };
}
