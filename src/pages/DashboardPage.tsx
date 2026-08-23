import {
  ArrowRight,
  Box,
  CheckCircle2,
  Clock3,
  Layers3,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../components/assets/StatusBadge';
import { AssetCategoryChart, ReviewStatusChart } from '../components/charts';
import { useStudioStore } from '../state/studioStore';
import { formatBytes, formatDate } from '../utils/format';

export function DashboardPage() {
  const dashboard = useStudioStore((state) => state.dashboard);
  const assets = useStudioStore((state) => state.assets);
  const loading = useStudioStore((state) => state.loading);

  const decided = dashboard.approved + dashboard.rejected;
  const completionRate = dashboard.total ? Math.round((decided / dashboard.total) * 100) : 0;
  const approvalRate = decided ? Math.round((dashboard.approved / decided) * 100) : 0;
  const recentAssets = dashboard.recentAssets ?? assets.slice(0, 5);

  const metrics = [
    {
      label: '资产总数',
      eyebrow: 'TOTAL ASSETS',
      value: dashboard.total,
      detail: '本地持久化资产',
      tone: 'neutral',
      icon: Box,
    },
    {
      label: '待审核',
      eyebrow: 'PENDING REVIEW',
      value: dashboard.pending,
      detail: dashboard.pending ? '需要处理的准入任务' : '审核队列已清空',
      tone: 'pending',
      icon: Clock3,
    },
    {
      label: '已通过',
      eyebrow: 'APPROVED',
      value: dashboard.approved,
      detail: `${approvalRate}% 审核通过率`,
      tone: 'approved',
      icon: CheckCircle2,
    },
    {
      label: '已驳回',
      eyebrow: 'REJECTED',
      value: dashboard.rejected,
      detail: dashboard.rejected ? '可修改后重新送审' : '当前无退回资产',
      tone: 'rejected',
      icon: XCircle,
    },
  ] as const;

  return (
    <div className={`dashboard-page ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
      <section className="kpi-grid" aria-label="资产关键指标">
        {metrics.map(({ label, eyebrow, value, detail, tone, icon: Icon }) => (
          <article className={`kpi-card kpi-${tone}`} key={eyebrow}>
            <div className="kpi-heading">
              <span>
                <small>{eyebrow}</small>
                <strong>{label}</strong>
              </span>
              <span className="kpi-icon"><Icon size={19} strokeWidth={1.8} /></span>
            </div>
            <div className="kpi-value">{value.toLocaleString('zh-CN')}</div>
            <p>{detail}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-chart-grid" aria-label="资产数据图表">
        <article className="panel chart-panel category-panel">
          <header className="panel-header">
            <div>
              <span className="eyebrow">ASSET TAXONOMY</span>
              <h2>资产分类分布</h2>
            </div>
            <span className="panel-meta">{dashboard.byCategory.length} 类</span>
          </header>
          <div className="chart-body">
            <AssetCategoryChart data={dashboard.byCategory} />
          </div>
        </article>

        <article className="panel chart-panel status-panel">
          <header className="panel-header">
            <div>
              <span className="eyebrow">REVIEW DISTRIBUTION</span>
              <h2>审核状态分布</h2>
            </div>
            <span className="panel-meta">实时</span>
          </header>
          <div className="chart-body">
            <ReviewStatusChart data={dashboard.byStatus} total={dashboard.total} />
          </div>
        </article>
      </section>

      <section className="dashboard-lower-grid">
        <article className="panel recent-assets-panel">
          <header className="panel-header">
            <div>
              <span className="eyebrow">LATEST INGESTION</span>
              <h2>最近入库</h2>
            </div>
            <Link className="text-link" to="/assets">进入资产库 <ArrowRight size={14} /></Link>
          </header>

          {recentAssets.length ? (
            <div className="recent-assets-list">
              {recentAssets.map((asset) => (
                <div className="recent-asset-row" key={asset.id}>
                  <div className="recent-asset-thumb">
                    <Layers3 size={18} />
                    {asset.thumbnailUrl && <img src={asset.thumbnailUrl} alt="" />}
                  </div>
                  <div className="recent-asset-name">
                    <strong title={asset.name}>{asset.name}</strong>
                    <span>{asset.category} · {asset.format.toUpperCase()}</span>
                  </div>
                  <StatusBadge status={asset.status} />
                  <span className="recent-asset-size">{formatBytes(asset.size)}</span>
                  <time dateTime={asset.createdAt}>{formatDate(asset.createdAt)}</time>
                </div>
              ))}
            </div>
          ) : (
            <div className="compact-empty-state">
              <Box size={22} />
              <div>
                <strong>尚无资产记录</strong>
                <span>上传第一个 USD / USDZ 后会显示在这里</span>
              </div>
              <Link className="button button-secondary" to="/assets">前往上传</Link>
            </div>
          )}
        </article>

        <article className="panel workflow-panel">
          <header className="panel-header">
            <div>
              <span className="eyebrow">ASSET PIPELINE</span>
              <h2>准入流程概览</h2>
            </div>
            <span className="panel-meta">{completionRate}% 已审核</span>
          </header>

          <div className="workflow-track" aria-label="入库、审核和准入流程">
            <div className="workflow-node">
              <span className="workflow-index">01</span>
              <strong>{dashboard.total}</strong>
              <small>完成入库</small>
            </div>
            <ArrowRight className="workflow-arrow" size={17} />
            <div className="workflow-node workflow-node-pending">
              <span className="workflow-index">02</span>
              <strong>{dashboard.pending}</strong>
              <small>等待审核</small>
            </div>
            <ArrowRight className="workflow-arrow" size={17} />
            <div className="workflow-node workflow-node-approved">
              <span className="workflow-index">03</span>
              <strong>{dashboard.approved}</strong>
              <small>准入场景</small>
            </div>
          </div>

          <div className="workflow-summary">
            <div>
              <span>审核完成率</span>
              <strong>{completionRate}%</strong>
              <div className="progress-track"><i style={{ width: `${completionRate}%` }} /></div>
            </div>
            <div>
              <span>审核通过率</span>
              <strong>{approvalRate}%</strong>
              <div className="progress-track progress-approved"><i style={{ width: `${approvalRate}%` }} /></div>
            </div>
          </div>

          <div className="workflow-footer">
            <span><XCircle size={14} /> {dashboard.rejected} 个资产需要修订</span>
            <Link className="text-link" to="/review">处理审核队列 <ArrowRight size={14} /></Link>
          </div>
        </article>
      </section>
    </div>
  );
}
