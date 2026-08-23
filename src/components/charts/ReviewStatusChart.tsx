import { PieChart } from 'echarts/charts';
import { AriaComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useMemo } from 'react';
import type { AssetStatus, DashboardSlice } from '../../domain/models';
import { STATUS_LABELS } from '../../domain/models';
import { EChart } from './EChart';

echarts.use([PieChart, TooltipComponent, LegendComponent, AriaComponent, CanvasRenderer]);

interface ReviewStatusChartProps {
  data: DashboardSlice[];
  total: number;
}

const STATUS_COLORS: Record<AssetStatus, string> = {
  pending: '#f2bc5b',
  approved: '#65d7c1',
  rejected: '#ed7b72',
};

function isAssetStatus(value: string): value is AssetStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected';
}

export function ReviewStatusChart({ data, total }: ReviewStatusChartProps) {
  const option = useMemo<EChartsCoreOption>(() => {
    const normalized = data.map((item) => {
      const status = isAssetStatus(item.name) ? item.name : null;
      return {
        name: status ? STATUS_LABELS[status] : item.name,
        value: item.value,
        itemStyle: { color: status ? STATUS_COLORS[status] : '#8c9aa4' },
      };
    });
    const hasData = normalized.some((item) => item.value > 0);

    return {
      animationDuration: 650,
      animationEasing: 'cubicOut',
      aria: {
        enabled: true,
        decal: { show: false },
        description: hasData ? `审核状态分布，共 ${total} 个资产。` : '当前还没有审核状态数据。',
      },
      color: Object.values(STATUS_COLORS),
      tooltip: {
        trigger: 'item',
        backgroundColor: '#10161d',
        borderColor: '#2c3945',
        textStyle: { color: '#f3f6f8' },
        formatter: '{b}<br/>资产数量&nbsp;&nbsp;<b>{c}</b> · {d}%',
      },
      legend: {
        orient: 'vertical',
        right: 4,
        top: 'middle',
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        itemGap: 15,
        textStyle: { color: '#aab5bd', fontSize: 12 },
      },
      series: [
        {
          name: '审核状态',
          type: 'pie',
          radius: ['58%', '78%'],
          center: ['36%', '50%'],
          avoidLabelOverlap: true,
          minAngle: 4,
          padAngle: 2,
          itemStyle: { borderColor: '#151c23', borderWidth: 2, borderRadius: 2 },
          label: { show: false },
          emphasis: { scaleSize: 5 },
          data: normalized,
        },
      ],
      graphic: [
        {
          type: 'text',
          left: '36%',
          top: '42%',
          style: {
            text: hasData ? String(total) : '—',
            fill: '#f2f5f7',
            fontSize: 24,
            fontWeight: 700,
            textAlign: 'center',
          },
        },
        {
          type: 'text',
          left: '36%',
          top: '55%',
          style: {
            text: hasData ? 'TOTAL ASSETS' : '暂无数据',
            fill: '#7f8c96',
            fontSize: 9,
            textAlign: 'center',
          },
        },
      ],
    };
  }, [data, total]);

  return <EChart option={option} ariaLabel="资产审核状态环形图" className="review-status-chart" />;
}
