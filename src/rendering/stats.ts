export interface UsdStudioRenderStats {
  activeCanvases: number;
  activeLoops: number;
  activeHydraHandles: number;
  wasmLoads: number;
}

declare global {
  interface Window {
    /** Runtime diagnostics intentionally exposed for lifecycle acceptance tests. */
    __USD_STUDIO_RENDER_STATS__?: UsdStudioRenderStats;
  }
}

const fallbackStats: UsdStudioRenderStats = {
  activeCanvases: 0,
  activeLoops: 0,
  activeHydraHandles: 0,
  wasmLoads: 0,
};

export function getRenderStats(): UsdStudioRenderStats {
  if (typeof window === 'undefined') return fallbackStats;

  window.__USD_STUDIO_RENDER_STATS__ ??= {
    activeCanvases: 0,
    activeLoops: 0,
    activeHydraHandles: 0,
    wasmLoads: 0,
  };
  return window.__USD_STUDIO_RENDER_STATS__;
}

export function incrementRenderStat(key: keyof UsdStudioRenderStats) {
  const stats = getRenderStats();
  stats[key] += 1;
}

export function decrementRenderStat(key: keyof UsdStudioRenderStats) {
  const stats = getRenderStats();
  stats[key] = Math.max(0, stats[key] - 1);
}

// Make zero-state diagnostics available before the first preview is opened.
if (typeof window !== 'undefined') getRenderStats();
