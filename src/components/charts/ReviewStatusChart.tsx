import { PieChart } from 'echarts/charts';
import { AriaComponent, GraphicComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useMemo } from 'react';
import type { AssetStatus, DashboardSlice } from '../../domain/models';
import { STATUS_LABELS } from '../../domain/models';
import { EChart } from './EChart';

echarts.use([PieChart, TooltipComponent, LegendComponent, GraphicComponent, AriaComponent, CanvasRenderer]);

interface ReviewStatusChartProps {
  data: DashboardSlice[];
  total: number;
}

const STATUS_COLORS: Record<AssetStatus, string> = {
  pending: '#f79009',
  approved: '#12a66a',
  rejected: '#e5484d',
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
        itemStyle: { color: status ? STATUS_COLORS[status] : '#98a2b3' },
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
        backgroundColor: '#ffffff',
        borderColor: '#e5e9f0',
        textStyle: { color: '#344054' },
        extraCssText: 'box-shadow: 0 10px 28px rgba(16, 24, 40, .12); border-radius: 8px;',
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
        textStyle: { color: '#475467', fontSize: 12 },
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
          itemStyle: { borderColor: '#ffffff', borderWidth: 3, borderRadius: 3 },
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
            fill: '#172033',
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
            text: hasData ? '资产总数' : '暂无数据',
            fill: '#667085',
            fontSize: 9,
            textAlign: 'center',
          },
        },
      ],
    };
  }, [data, total]);

  return <EChart option={option} ariaLabel="资产审核状态环形图" className="review-status-chart" />;
}
