import { BarChart } from 'echarts/charts';
import { AriaComponent, GraphicComponent, GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useMemo } from 'react';
import type { DashboardSlice } from '../../domain/models';
import { EChart } from './EChart';

echarts.use([BarChart, GridComponent, TooltipComponent, GraphicComponent, AriaComponent, CanvasRenderer]);

interface AssetCategoryChartProps {
  data: DashboardSlice[];
}

export function AssetCategoryChart({ data }: AssetCategoryChartProps) {
  const option = useMemo<EChartsCoreOption>(() => {
    const ordered = [...data].sort((left, right) => left.value - right.value);
    const hasData = ordered.some((item) => item.value > 0);

    return {
      animationDuration: 550,
      animationEasing: 'cubicOut',
      aria: {
        enabled: true,
        decal: { show: false },
        description: hasData
          ? `资产分类统计，共 ${ordered.length} 个分类。`
          : '当前还没有资产分类数据。',
      },
      grid: { top: 6, right: 28, bottom: 4, left: 12, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#ffffff',
        borderColor: '#e5e9f0',
        textStyle: { color: '#344054' },
        extraCssText: 'box-shadow: 0 10px 28px rgba(16, 24, 40, .12); border-radius: 8px;',
        formatter: '{b}<br/>资产数量&nbsp;&nbsp;<b>{c}</b>',
      },
      xAxis: {
        type: 'value',
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#667085', fontSize: 11 },
        splitLine: { lineStyle: { color: '#eef1f5' } },
      },
      yAxis: {
        type: 'category',
        data: ordered.map((item) => item.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#475467',
          fontSize: 12,
          width: 88,
          overflow: 'truncate',
        },
      },
      series: [
        {
          name: '资产数量',
          type: 'bar',
          data: ordered.map((item) => item.value),
          barWidth: 13,
          showBackground: true,
          backgroundStyle: {
            color: '#f1f4f8',
            borderRadius: 2,
          },
          itemStyle: {
            color: '#2563eb',
            borderRadius: [0, 4, 4, 0],
          },
          emphasis: { itemStyle: { color: '#1d4ed8' } },
          label: {
            show: true,
            position: 'right',
            color: '#475467',
            fontSize: 11,
          },
        },
      ],
      graphic: hasData
        ? []
        : [
            {
              type: 'text',
              left: 'center',
              top: 'middle',
              style: { text: '暂无分类数据', fill: '#98a2b3', fontSize: 12 },
            },
          ],
    };
  }, [data]);

  return <EChart option={option} ariaLabel="资产分类数量条形图" className="category-chart" />;
}
