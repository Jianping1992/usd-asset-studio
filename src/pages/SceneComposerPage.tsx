import {
  Box,
  Boxes,
  Check,
  ChevronDown,
  Crosshair,
  Focus,
  FolderOpen,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Asset, SceneAssetTransform, Vec3 } from '../domain/models';
import {
  ThreeViewport,
  type ThreeViewportRef,
  type ViewerInstance,
  type ViewerStatus,
} from '../components/viewer';
import { AssetVisual } from '../components/assets/AssetVisual';
import { useStudioStore } from '../state/studioStore';

const DEFAULT_TRANSFORM = (index: number): SceneAssetTransform => ({
  assetId: '',
  position: index === 0 ? [-1.25, 0, 0] : index === 1 ? [1.25, 0, 0] : [0, 0, -1.5],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
});

function cloneTransform(value: SceneAssetTransform): SceneAssetTransform {
  return {
    assetId: value.assetId,
    position: [...value.position],
    rotation: [...value.rotation],
    scale: [...value.scale],
  };
}

export function SceneComposerPage() {
  const assets = useStudioStore((state) => state.assets);
  const compositions = useStudioStore((state) => state.compositions);
  const refreshAssets = useStudioStore((state) => state.refreshAssets);
  const refreshCompositions = useStudioStore((state) => state.refreshCompositions);
  const saveComposition = useStudioStore((state) => state.saveComposition);
  const viewportRef = useRef<ThreeViewportRef>(null);
  const [sceneAssets, setSceneAssets] = useState<SceneAssetTransform[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('机器人感知测试场景');
  const [compositionId, setCompositionId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<ViewerStatus | null>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(true);

  useEffect(() => {
    void Promise.all([
      refreshAssets({ status: 'approved', sort: 'name', order: 'asc' }),
      refreshCompositions(),
    ]).catch(() => undefined);
  }, [refreshAssets, refreshCompositions]);

  const approvedAssets = useMemo(() => assets.filter((asset) => asset.status === 'approved'), [assets]);
  const assetsById = useMemo(() => new Map(approvedAssets.map((asset) => [asset.id, asset])), [approvedAssets]);

  const viewerInstances = useMemo<ViewerInstance[]>(() => sceneAssets.flatMap((item) => {
    const asset = assetsById.get(item.assetId);
    if (!asset) return [];
    return [{
      id: item.assetId,
      name: asset.name,
      fileUrl: asset.fileUrl,
      transform: {
        position: item.position,
        rotation: item.rotation,
        scale: item.scale,
      },
    }];
  }), [sceneAssets, assetsById]);

  const selectedTransform = sceneAssets.find((item) => item.assetId === selectedId) ?? null;
  const selectedAsset = selectedId ? assetsById.get(selectedId) ?? null : null;

  const addAsset = (asset: Asset) => {
    if (sceneAssets.some((item) => item.assetId === asset.id) || sceneAssets.length >= 3) return;
    const next = { ...DEFAULT_TRANSFORM(sceneAssets.length), assetId: asset.id };
    setSceneAssets((current) => [...current, next]);
    setSelectedId(asset.id);
  };

  const removeAsset = (assetId: string) => {
    setSceneAssets((current) => current.filter((item) => item.assetId !== assetId));
    if (selectedId === assetId) setSelectedId(null);
  };

  const updateAxis = (key: 'position' | 'rotation' | 'scale', axis: number, value: number) => {
    if (!selectedId || !Number.isFinite(value)) return;
    setSceneAssets((current) => current.map((item) => {
      if (item.assetId !== selectedId) return item;
      const vector = [...item[key]] as Vec3;
      vector[axis] = key === 'scale' ? Math.max(0.01, value) : value;
      return { ...item, [key]: vector };
    }));
  };

  const resetTransform = () => {
    if (!selectedId) return;
    setSceneAssets((current) => current.map((item, index) => (
      item.assetId === selectedId ? { ...DEFAULT_TRANSFORM(index), assetId: selectedId } : item
    )));
  };

  const loadComposition = (id: string) => {
    const composition = compositions.find((item) => item.id === id);
    if (!composition) return;
    const available = composition.assets.filter((item) => assetsById.has(item.assetId)).map(cloneTransform);
    setCompositionId(composition.id);
    setName(composition.name);
    setSceneAssets(available);
    setSelectedId(available[0]?.assetId ?? null);
  };

  const createNew = () => {
    setCompositionId(undefined);
    setName('未命名场景组合');
    setSceneAssets([]);
    setSelectedId(null);
    setStatus(null);
  };

  const save = async () => {
    if (sceneAssets.length < 2 || sceneAssets.length > 3 || !name.trim()) return;
    setSaving(true);
    try {
      const saved = await saveComposition({ name: name.trim(), assets: sceneAssets.map(cloneTransform) }, compositionId);
      setCompositionId(saved.id);
    } catch {
      // The store owns user-facing API error toasts.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="composer-page">
      <section className="composer-toolbar panel">
        <div className="composition-name-field">
          <span className="eyebrow">SCENE CONFIG / JSON</span>
          <input value={name} maxLength={100} aria-label="组合名称" onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="saved-composition-select">
          <FolderOpen size={16} />
          <select value={compositionId ?? ''} aria-label="打开已保存组合" onChange={(event) => loadComposition(event.target.value)}>
            <option value="">打开已保存组合…</option>
            {compositions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <ChevronDown size={14} />
        </div>
        <button className="button button-ghost" onClick={createNew}><Plus size={16} /> 新建</button>
        <button
          className="button button-primary"
          disabled={sceneAssets.length < 2 || sceneAssets.length > 3 || !name.trim() || saving}
          onClick={() => void save()}
        >
          {saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
          {compositionId ? '更新配置' : '保存组合'}
        </button>
      </section>

      <div className="composer-workspace">
        <aside className="composer-assets panel">
          <header>
            <div><span className="eyebrow">APPROVED ASSETS</span><h2>场景资产</h2></div>
            <span className="counter">{sceneAssets.length} / 3</span>
          </header>

          <div className="scene-hierarchy">
            <span className="hierarchy-root"><Boxes size={15} /> {name || 'Scene Root'}</span>
            {sceneAssets.map((item, index) => {
              const asset = assetsById.get(item.assetId);
              if (!asset) return null;
              return (
                <button
                  key={item.assetId}
                  className={selectedId === item.assetId ? 'active' : ''}
                  onClick={() => setSelectedId(item.assetId)}
                >
                  <span className="tree-line" />
                  <Box size={15} />
                  <span><strong>{asset.name}</strong><small>INSTANCE_0{index + 1}</small></span>
                  <i>{selectedId === item.assetId && <Crosshair size={13} />}</i>
                </button>
              );
            })}
          </div>

          <button className="asset-picker-toggle" onClick={() => setAssetPickerOpen((value) => !value)}>
            <span><Plus size={15} /> 添加已通过资产</span><ChevronDown className={assetPickerOpen ? 'rotated' : ''} size={15} />
          </button>
          {assetPickerOpen && (
            <div className="composer-asset-list">
              {approvedAssets.map((asset) => {
                const used = sceneAssets.some((item) => item.assetId === asset.id);
                return (
                  <button key={asset.id} disabled={used || sceneAssets.length >= 3} onClick={() => addAsset(asset)}>
                    <AssetVisual asset={asset} compact />
                    <span><strong>{asset.name}</strong><small>{asset.category} · .{asset.format}</small></span>
                    {used ? <Check size={15} /> : <Plus size={15} />}
                  </button>
                );
              })}
              {approvedAssets.length === 0 && <p className="mini-empty">审核通过的资产会出现在这里。</p>}
            </div>
          )}
        </aside>

        <section className="composer-viewport panel">
          <div className="viewport-toolbar">
            <div><span className="live-dot" /> WEBGL VIEWPORT <small>HYDRA / THREE.JS</small></div>
            <div>
              <span className="viewport-count">{viewerInstances.length} OBJECTS</span>
              <button className="icon-button" title="相机自适应" onClick={() => viewportRef.current?.fitCamera()}><Focus size={17} /></button>
              <button className="icon-button" title="重置相机" onClick={() => viewportRef.current?.resetCamera()}><RotateCcw size={16} /></button>
            </div>
          </div>
          <div className="viewport-stage">
            <ThreeViewport
              ref={viewportRef}
              instances={viewerInstances}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onStatus={setStatus}
            />
          </div>
          <footer className="viewport-statusbar">
            <span>{status?.phase === 'loading' ? <LoaderCircle className="spin" size={13} /> : <i className="ok-dot" />} {status?.message ?? '等待场景资产'}</span>
            <span>DPR ≤ 2.0</span>
            <span>WASM LAZY</span>
            <span>{window.crossOriginIsolated ? 'ISOLATED' : 'DEV CHECK'}</span>
          </footer>
        </section>

        <aside className="inspector panel">
          <header><span className="eyebrow">TRANSFORM INSPECTOR</span><h2>对象属性</h2></header>
          {selectedTransform && selectedAsset ? (
            <>
              <div className="inspector-object">
                <AssetVisual asset={selectedAsset} compact />
                <div><strong>{selectedAsset.name}</strong><small>{selectedAsset.category}</small></div>
                <button className="icon-button danger-action" title="移出场景" onClick={() => removeAsset(selectedAsset.id)}><Trash2 size={16} /></button>
              </div>
              <TransformVector label="POSITION" unit="m" value={selectedTransform.position} onChange={(axis, value) => updateAxis('position', axis, value)} />
              <TransformVector label="ROTATION" unit="deg" value={selectedTransform.rotation} onChange={(axis, value) => updateAxis('rotation', axis, value)} />
              <TransformVector label="SCALE" unit="ratio" value={selectedTransform.scale} step={0.1} onChange={(axis, value) => updateAxis('scale', axis, value)} />
              <button className="button button-ghost inspector-reset" onClick={resetTransform}><RotateCcw size={15} /> 重置对象 Transform</button>
              <div className="transform-json">
                <span>COMPOSITION PAYLOAD</span>
                <code>{JSON.stringify(selectedTransform, null, 2)}</code>
              </div>
            </>
          ) : (
            <div className="inspector-empty"><Crosshair size={31} /><strong>选择场景对象</strong><p>从左侧层级或直接点击三维模型，调整 Position、Rotation 与 Scale。</p></div>
          )}
        </aside>
      </div>
    </div>
  );
}

function TransformVector({
  label,
  unit,
  value,
  step = 0.1,
  onChange,
}: {
  label: string;
  unit: string;
  value: Vec3;
  step?: number;
  onChange: (axis: number, value: number) => void;
}) {
  return (
    <fieldset className="transform-fieldset">
      <legend><span>{label}</span><small>{unit}</small></legend>
      {(['X', 'Y', 'Z'] as const).map((axis, index) => (
        <label key={axis} className={`axis-${axis.toLowerCase()}`}>
          <span>{axis}</span>
          <input
            type="number"
            value={Number(value[index].toFixed(3))}
            step={step}
            onChange={(event) => onChange(index, Number(event.target.value))}
          />
        </label>
      ))}
    </fieldset>
  );
}
