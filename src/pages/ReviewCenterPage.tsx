import {
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileBox,
  Inbox,
  LoaderCircle,
  RotateCcw,
  Tags,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AssetVisual } from '../components/assets/AssetVisual';
import { StatusBadge } from '../components/assets/StatusBadge';
import type { AssetStatus } from '../domain/models';
import { STATUS_LABELS } from '../domain/models';
import { useStudioStore } from '../state/studioStore';
import { formatBytes, formatDate } from '../utils/format';

type ReviewView = AssetStatus | 'all';

const reviewViews: Array<{ value: ReviewView; label: string }> = [
  { value: 'pending', label: '待审核' },
  { value: 'all', label: '全部' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
];

export function ReviewCenterPage() {
  const assets = useStudioStore((state) => state.assets);
  const loading = useStudioStore((state) => state.loading);
  const refreshAssets = useStudioStore((state) => state.refreshAssets);
  const reviewAsset = useStudioStore((state) => state.reviewAsset);

  const [view, setView] = useState<ReviewView>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState<AssetStatus | null>(null);

  useEffect(() => {
    void refreshAssets({ sort: 'updatedAt', order: 'desc' }).catch(() => undefined);
  }, [refreshAssets]);

  const counts = useMemo(() => ({
    all: assets.length,
    pending: assets.filter((asset) => asset.status === 'pending').length,
    approved: assets.filter((asset) => asset.status === 'approved').length,
    rejected: assets.filter((asset) => asset.status === 'rejected').length,
  }), [assets]);

  const visibleAssets = useMemo(
    () => assets.filter((asset) => view === 'all' || asset.status === view),
    [assets, view],
  );

  useEffect(() => {
    if (!visibleAssets.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visibleAssets.some((asset) => asset.id === selectedId)) {
      setSelectedId(visibleAssets[0].id);
    }
  }, [visibleAssets, selectedId]);

  const selectedAsset = visibleAssets.find((asset) => asset.id === selectedId) ?? null;

  useEffect(() => {
    setComment(selectedAsset?.reviewComment ?? '');
  }, [selectedAsset?.id, selectedAsset?.reviewComment]);

  async function submitReview(status: AssetStatus) {
    if (!selectedAsset || submitting) return;
    setSubmitting(status);
    try {
      await reviewAsset(selectedAsset.id, {
        status,
        reviewComment: comment.trim(),
      });
    } catch {
      // The store surfaces the API error through the global toast.
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="review-page">
      <section className="review-toolbar panel">
        <div className="review-toolbar-copy">
          <span className="toolbar-icon"><ClipboardCheck size={20} /></span>
          <div>
            <span className="eyebrow">本地审核流程</span>
            <h2>资产准入队列</h2>
            <p>检查资产摘要，填写备注并更新准入状态；已处理资产也可重新流转。</p>
          </div>
        </div>
        <div className="review-queue-stat">
          <span><i /> 待处理</span>
          <strong>{counts.pending}</strong>
          <small>项等待处理</small>
        </div>
      </section>

      <nav className="review-tabs" aria-label="审核状态筛选">
        {reviewViews.map((item) => (
          <button
            key={item.value}
            className={view === item.value ? 'active' : ''}
            aria-pressed={view === item.value}
            onClick={() => setView(item.value)}
          >
            {item.label}<span>{counts[item.value]}</span>
          </button>
        ))}
      </nav>

      {loading && !assets.length ? (
        <section className="panel review-loading" aria-live="polite">
          <LoaderCircle className="spin" size={24} />
          <strong>正在同步审核队列</strong>
          <span>从本地 REST 数据服务读取资产状态…</span>
        </section>
      ) : (
        <section className="review-workspace">
          <aside className="panel review-list-panel" aria-label={`${reviewViews.find((item) => item.value === view)?.label ?? ''}资产列表`}>
            <header className="review-list-header">
              <div>
                <span className="eyebrow">审核资产</span>
                <strong>{visibleAssets.length} 项资产</strong>
              </div>
              {loading && <LoaderCircle className="spin" size={16} aria-label="刷新中" />}
            </header>

            {visibleAssets.length ? (
              <div className="review-list">
                {visibleAssets.map((asset) => (
                  <button
                    key={asset.id}
                    className={`review-list-item ${asset.id === selectedId ? 'selected' : ''}`}
                    aria-pressed={asset.id === selectedId}
                    onClick={() => setSelectedId(asset.id)}
                  >
                    <span className="review-item-thumb">
                      <FileBox size={19} />
                      {asset.thumbnailUrl && <img src={asset.thumbnailUrl} alt="" />}
                    </span>
                    <span className="review-item-copy">
                      <strong>{asset.name}</strong>
                      <small>{asset.category} · {asset.format.toUpperCase()}</small>
                      <span>
                        <time dateTime={asset.updatedAt}>{formatDate(asset.updatedAt, true)}</time>
                        <i className={`status-dot status-dot-${asset.status}`} />
                        {STATUS_LABELS[asset.status]}
                      </span>
                    </span>
                    <ChevronRight size={16} className="review-item-chevron" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="review-list-empty">
                <Inbox size={25} />
                <strong>{view === 'pending' ? '审核队列已清空' : '当前筛选下没有资产'}</strong>
                <span>{view === 'pending' ? '新的上传资产会自动进入待审核状态' : '切换状态标签查看其他资产'}</span>
                {view !== 'all' && (
                  <button className="text-link" onClick={() => setView('all')}>查看全部资产</button>
                )}
              </div>
            )}
          </aside>

          <article className="panel review-detail-panel">
            {selectedAsset ? (
              <>
                <header className="review-detail-header">
                  <div>
                    <span className="eyebrow">资产详情</span>
                    <h2>{selectedAsset.name}</h2>
                    <span className="asset-file-name">{selectedAsset.originalName}</span>
                  </div>
                  <StatusBadge status={selectedAsset.status} />
                </header>

                <div className="review-asset-summary">
                  <div className="review-preview-placeholder"><AssetVisual asset={selectedAsset} /></div>

                  <dl className="asset-facts">
                    <div><dt>分类</dt><dd>{selectedAsset.category}</dd></div>
                    <div><dt>文件格式</dt><dd>{selectedAsset.format.toUpperCase()}</dd></div>
                    <div><dt>文件大小</dt><dd>{formatBytes(selectedAsset.size)}</dd></div>
                    <div><dt>入库时间</dt><dd>{formatDate(selectedAsset.createdAt, true)}</dd></div>
                    <div><dt>最近更新</dt><dd>{formatDate(selectedAsset.updatedAt, true)}</dd></div>
                  </dl>
                </div>

                <section className="review-description">
                  <h3>资产说明</h3>
                  <p>{selectedAsset.description || '该资产暂未填写描述。'}</p>
                </section>

                <section className="review-tags">
                  <h3><Tags size={15} /> 标签</h3>
                  <div>
                    {selectedAsset.tags.length
                      ? selectedAsset.tags.map((tag) => <span key={tag}>{tag}</span>)
                      : <span className="muted-tag">暂无标签</span>}
                  </div>
                </section>

                <section className="review-comment-field">
                  <label htmlFor="review-comment">审核备注</label>
                  <textarea
                    id="review-comment"
                    value={comment}
                    maxLength={1000}
                    rows={4}
                    placeholder="记录比例、坐标系、语义标签或资产质量等审核结论…"
                    onChange={(event) => setComment(event.target.value)}
                  />
                  <div>
                    <span>状态变更时备注将一并保存到本地数据服务</span>
                    <small>{comment.length} / 1000</small>
                  </div>
                </section>

                <footer className="review-actions">
                  <div className="review-current-state">
                    <span>当前状态</span>
                    <strong>{STATUS_LABELS[selectedAsset.status]}</strong>
                  </div>
                  <div className="review-action-buttons">
                    {selectedAsset.status !== 'pending' && (
                      <button
                        className="button button-secondary"
                        disabled={Boolean(submitting)}
                        onClick={() => void submitReview('pending')}
                      >
                        {submitting === 'pending' ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />}
                        退回待审核
                      </button>
                    )}
                    <button
                      className="button button-danger"
                      disabled={Boolean(submitting) || selectedAsset.status === 'rejected'}
                      onClick={() => void submitReview('rejected')}
                    >
                      {submitting === 'rejected' ? <LoaderCircle className="spin" size={16} /> : <XCircle size={16} />}
                      驳回
                    </button>
                    <button
                      className="button button-primary"
                      disabled={Boolean(submitting) || selectedAsset.status === 'approved'}
                      onClick={() => void submitReview('approved')}
                    >
                      {submitting === 'approved' ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}
                      通过审核
                    </button>
                  </div>
                </footer>
              </>
            ) : (
              <div className="review-detail-empty">
                <Clock3 size={28} />
                <strong>选择一项资产开始审核</strong>
                <span>资产元数据、当前状态和历史审核备注会显示在这里</span>
              </div>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
