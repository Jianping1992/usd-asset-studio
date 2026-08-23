import { BarChart } from 'echarts/charts';
import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useMemo } from 'react';
import type { DashboardSlice } from '../../domain/models';
import { EChart } from './EChart';

echarts.use([BarChart, GridComponent, TooltipComponent, AriaComponent, CanvasRenderer]);

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
        backgroundColor: '#10161d',
        borderColor: '#2c3945',
        textStyle: { color: '#f3f6f8' },
        formatter: '{b}<br/>资产数量&nbsp;&nbsp;<b>{c}</b>',
      },
      xAxis: {
        type: 'value',
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#7f8c96', fontSize: 11 },
        splitLine: { lineStyle: { color: 'rgba(137, 153, 166, .12)' } },
      },
      yAxis: {
        type: 'category',
        data: ordered.map((item) => item.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#c7d0d7',
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
            color: 'rgba(133, 149, 161, .08)',
            borderRadius: 2,
          },
          itemStyle: {
            color: '#65d7c1',
            borderRadius: [0, 2, 2, 0],
          },
          emphasis: { itemStyle: { color: '#8be8d5' } },
          label: {
            show: true,
            position: 'right',
            color: '#d8e0e5',
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
              style: { text: '暂无分类数据', fill: '#78858f', fontSize: 12 },
            },
          ],
    };
  }, [data]);

  return <EChart option={option} ariaLabel="资产分类数量条形图" className="category-chart" />;
}
