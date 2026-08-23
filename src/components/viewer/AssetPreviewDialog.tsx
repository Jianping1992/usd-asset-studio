import { Crosshair, Focus, RotateCcw } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { Asset } from '../../domain/models';
import { Modal } from '../ui/Modal';
import { ThreeViewport, type ThreeViewportRef } from './ThreeViewport';
import type { ViewerInstance, ViewerStatus } from '../../rendering/types';
import styles from './AssetPreviewDialog.module.css';

interface AssetPreviewDialogProps {
  asset: Asset | null;
  onClose: () => void;
}

export function AssetPreviewDialog({ asset, onClose }: AssetPreviewDialogProps) {
  const viewportRef = useRef<ThreeViewportRef>(null);
  const [status, setStatus] = useState<ViewerStatus | null>(null);
  const instances = useMemo<ViewerInstance[]>(() => (
    asset
      ? [{
          id: asset.id,
          name: asset.name,
          fileUrl: asset.fileUrl,
          transform: {
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
        }]
      : []
  ), [asset]);

  return (
    <Modal
      open={Boolean(asset)}
      title={asset?.name ?? '三维资产预览'}
      eyebrow="OPENUSD / HYDRA PREVIEW"
      description={asset ? `${asset.category} · .${asset.format.toUpperCase()} · ${asset.originalName}` : undefined}
      full
      onClose={onClose}
      footer={(
        <div className={styles.footer}>
          <span className={styles.status}>
            <Crosshair size={14} />
            {status?.message ?? '准备 WebGL 视口'}
          </span>
          <div className={styles.actions}>
            <button type="button" className="button button-ghost" onClick={() => viewportRef.current?.resetCamera()}>
              <RotateCcw size={15} /> 重置相机
            </button>
            <button type="button" className="button button-primary" onClick={() => viewportRef.current?.fitCamera()}>
              <Focus size={16} /> 适配资产
            </button>
          </div>
        </div>
      )}
    >
      <div className={styles.viewport}>
        <ThreeViewport
          ref={viewportRef}
          instances={instances}
          onStatus={setStatus}
          showToolbar={false}
        />
      </div>
    </Modal>
  );
}

