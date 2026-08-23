import * as echarts from 'echarts/core';
import type { EChartsCoreOption, EChartsType } from 'echarts/core';
import { useEffect, useRef } from 'react';

interface EChartProps {
  option: EChartsCoreOption;
  ariaLabel: string;
  className?: string;
}

/**
 * A small lifecycle boundary around ECharts.
 *
 * The instance is created once, resized with its actual container and disposed
 * when the dashboard unmounts. Keeping this logic here prevents chart pages
 * from leaking canvas nodes or window listeners after route transitions.
 */
export function EChart({ option, ariaLabel, className = '' }: EChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const latestOption = useRef(option);
  latestOption.current = option;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = echarts.init(host, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    chart.setOption(latestOption.current, { notMerge: true, lazyUpdate: true });

    let resizeFrame = 0;
    const resize = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => chart.resize());
    };

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    if (observer) observer.observe(host);
    else window.addEventListener('resize', resize);
    resize();

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', resize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  return (
    <div
      ref={hostRef}
      className={`echart ${className}`.trim()}
      style={{ width: '100%', height: '100%', minHeight: 260 }}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
