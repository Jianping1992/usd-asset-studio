import {
  Boxes,
  Eye,
  FilePenLine,
  Grid2X2,
  List,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ASSET_CATEGORIES, STATUS_LABELS, type Asset, type AssetStatus } from '../domain/models';
import { AssetVisual } from '../components/assets/AssetVisual';
import { EditAssetDialog } from '../components/assets/EditAssetDialog';
import { StatusBadge } from '../components/assets/StatusBadge';
import { UploadAssetDialog } from '../components/assets/UploadAssetDialog';
import { AssetPreviewDialog } from '../components/viewer/AssetPreviewDialog';
import { useStudioStore } from '../state/studioStore';
import { formatBytes, formatDate } from '../utils/format';

type ViewMode = 'grid' | 'list';

export function AssetLibraryPage() {
  const assets = useStudioStore((state) => state.assets);
  const total = useStudioStore((state) => state.assetTotal);
  const loading = useStudioStore((state) => state.loading);
  const filters = useStudioStore((state) => state.filters);
  const refreshAssets = useStudioStore((state) => state.refreshAssets);
  const deleteAsset = useStudioStore((state) => state.deleteAsset);
  const [search, setSearch] = useState(filters.search ?? '');
  const [category, setCategory] = useState(filters.category ?? '');
  const [status, setStatus] = useState<AssetStatus | ''>(filters.status ?? '');
  const [view, setView] = useState<ViewMode>('grid');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshAssets({ search: search.trim(), category, status, sort: 'createdAt', order: 'desc' }).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search, category, status, refreshAssets]);

  const statusCounts = useMemo(() => assets.reduce<Record<AssetStatus, number>>(
    (counts, asset) => ({ ...counts, [asset.status]: counts[asset.status] + 1 }),
    { pending: 0, approved: 0, rejected: 0 },
  ), [assets]);

  const remove = async (asset: Asset) => {
    const confirmed = window.confirm(`确认删除“${asset.name}”？本地资产文件和相关组合引用也会被清理。`);
    if (!confirmed) return;
    try {
      await deleteAsset(asset.id);
    } catch {
      // The store owns user-facing API error toasts.
    }
  };

  return (
    <div className="page-stack asset-library-page">
      <section className="library-hero panel-accent">
        <div>
          <span className="eyebrow">EMBODIED ASSET REGISTRY</span>
          <h2>机器人仿真资产工作台</h2>
          <p>统一管理 OpenUSD 资产的业务元数据、准入状态与 Web 三维预览。资产卡片保持无 Canvas，只有按需预览才启动 WebGL。</p>
        </div>
        <div className="hero-stats">
          <div><span>{String(total).padStart(2, '0')}</span><small>ASSETS</small></div>
          <div><span>{String(statusCounts.approved).padStart(2, '0')}</span><small>APPROVED</small></div>
          <div><span>{String(statusCounts.pending).padStart(2, '0')}</span><small>IN REVIEW</small></div>
        </div>
      </section>

      <section className="toolbar panel">
        <label className="search-field">
          <Search size={17} />
          <input value={search} placeholder="搜索名称、标签或描述…" onChange={(event) => setSearch(event.target.value)} />
          <kbd>⌘ K</kbd>
        </label>
        <div className="filter-group">
          <SlidersHorizontal size={16} />
          <select aria-label="分类筛选" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">全部分类</option>
            {ASSET_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select aria-label="状态筛选" value={status} onChange={(event) => setStatus(event.target.value as AssetStatus | '')}>
            <option value="">全部状态</option>
            {(Object.entries(STATUS_LABELS) as [AssetStatus, string][]).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="view-switch" role="group" aria-label="展示方式">
          <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="网格视图"><Grid2X2 size={17} /></button>
          <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="列表视图"><List size={18} /></button>
        </div>
        <button className="button button-primary" onClick={() => setUploadOpen(true)}><Plus size={17} /> 上传资产</button>
      </section>

      <div className="results-meta">
        <span>REGISTRY / <strong>{total} ITEMS</strong></span>
        <span>{loading ? 'SYNCING DATA…' : 'LOCAL DATA SYNCED'}</span>
      </div>

      {!loading && assets.length === 0 ? (
        <section className="empty-state panel">
          <Boxes size={42} strokeWidth={1.2} />
          <h3>没有匹配的资产</h3>
          <p>调整搜索或筛选条件，或者上传第一个 USD / USDZ 仿真资产。</p>
          <button className="button button-primary" onClick={() => setUploadOpen(true)}><Plus size={17} /> 上传资产</button>
        </section>
      ) : view === 'grid' ? (
        <section className="asset-grid" aria-busy={loading}>
          {assets.map((asset) => (
            <article className="asset-card" key={asset.id}>
              <AssetVisual asset={asset} />
              <div className="asset-card-body">
                <div className="asset-card-heading">
                  <div><small>{asset.category}</small><h3>{asset.name}</h3></div>
                  <button className="icon-button" aria-label="更多操作"><MoreHorizontal size={18} /></button>
                </div>
                <p>{asset.description || '暂无业务描述。'}</p>
                <div className="tag-row">
                  {asset.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
                  {asset.tags.length > 3 && <span>+{asset.tags.length - 3}</span>}
                </div>
                <div className="asset-card-meta">
                  <StatusBadge status={asset.status} />
                  <span>{formatBytes(asset.size)}</span>
                  <span>{formatDate(asset.updatedAt)}</span>
                </div>
              </div>
              <footer className="asset-card-actions">
                <button onClick={() => setPreviewAsset(asset)}><Eye size={16} /> 三维预览</button>
                <button onClick={() => setEditAsset(asset)}><FilePenLine size={15} /> 编辑</button>
                <button className="danger-action" aria-label={`删除 ${asset.name}`} onClick={() => void remove(asset)}><Trash2 size={15} /></button>
              </footer>
            </article>
          ))}
        </section>
      ) : (
        <section className="asset-table panel" aria-busy={loading}>
          <div className="asset-table-row asset-table-header">
            <span>资产</span><span>分类 / 标签</span><span>格式 / 大小</span><span>状态</span><span>更新时间</span><span>操作</span>
          </div>
          {assets.map((asset) => (
            <article className="asset-table-row" key={asset.id}>
              <div className="table-asset-name"><AssetVisual asset={asset} compact /><div><strong>{asset.name}</strong><small>{asset.originalName}</small></div></div>
              <div><strong>{asset.category}</strong><small>{asset.tags.slice(0, 2).join(' · ') || '—'}</small></div>
              <div><strong>.{asset.format.toUpperCase()}</strong><small>{formatBytes(asset.size)}</small></div>
              <StatusBadge status={asset.status} />
              <span>{formatDate(asset.updatedAt, true)}</span>
              <div className="table-actions">
                <button className="icon-button" title="三维预览" onClick={() => setPreviewAsset(asset)}><Eye size={17} /></button>
                <button className="icon-button" title="编辑" onClick={() => setEditAsset(asset)}><FilePenLine size={16} /></button>
                <button className="icon-button danger-action" title="删除" onClick={() => void remove(asset)}><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
        </section>
      )}

      <UploadAssetDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <EditAssetDialog asset={editAsset} onClose={() => setEditAsset(null)} />
      <AssetPreviewDialog asset={previewAsset} onClose={() => setPreviewAsset(null)} />
    </div>
  );
}
