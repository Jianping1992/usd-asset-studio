import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ThreeViewportController } from '../../rendering/ThreeViewportController';
import type { ViewerInstance, ViewerStatus } from '../../rendering/types';
import styles from './ThreeViewport.module.css';

export interface ThreeViewportRef {
  /** Fit all instances, or only the requested instance, into the camera view. */
  fitCamera: (instanceId?: string) => void;
  resetCamera: () => void;
}

export interface ThreeViewportProps {
  instances: ViewerInstance[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onStatus?: (status: ViewerStatus) => void;
  className?: string;
  showToolbar?: boolean;
}

const INITIAL_STATUS: ViewerStatus = {
  phase: 'idle',
  message: '请选择需要预览的 USD / USDZ 资产',
  loaded: 0,
  total: 0,
};

function formatControllerError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return '浏览器无法创建 WebGL 渲染上下文';
}

/**
 * React boundary for the imperative Three.js/OpenUSD renderer. Asset identity
 * changes reload the Hydra group; composition transform changes are applied in
 * place without touching WASM or rebuilding the WebGL canvas.
 */
export const ThreeViewport = forwardRef<ThreeViewportRef, ThreeViewportProps>(
  function ThreeViewport(
    {
      instances,
      selectedId,
      onSelect,
      onStatus,
      className,
      showToolbar = true,
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const controllerRef = useRef<ThreeViewportController | null>(null);
    const selectCallbackRef = useRef(onSelect);
    const statusCallbackRef = useRef(onStatus);
    const [status, setStatus] = useState<ViewerStatus>(INITIAL_STATUS);

    selectCallbackRef.current = onSelect;
    statusCallbackRef.current = onStatus;

    // Excludes transforms on purpose: dragging a Transform control must not
    // recreate Hydra handles or touch the shared virtual filesystem.
    const assetIdentityKey = useMemo(
      () => JSON.stringify(instances.map(({ id, fileUrl }) => [id, fileUrl])),
      [instances],
    );

    useImperativeHandle(
      ref,
      () => ({
        fitCamera: (instanceId?: string) => controllerRef.current?.fitCamera(instanceId),
        resetCamera: () => controllerRef.current?.resetCamera(),
      }),
      [],
    );

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return undefined;

      let mounted = true;
      try {
        const controller = new ThreeViewportController(host, {
          onSelect: (id) => selectCallbackRef.current?.(id),
          onStatus: (nextStatus) => {
            if (!mounted) return;
            setStatus(nextStatus);
            statusCallbackRef.current?.(nextStatus);
          },
        });
        controllerRef.current = controller;
      } catch (error) {
        const nextStatus: ViewerStatus = {
          phase: 'error',
          message: 'WebGL 初始化失败',
          loaded: 0,
          total: instances.length,
          error: formatControllerError(error),
        };
        setStatus(nextStatus);
        statusCallbackRef.current?.(nextStatus);
      }

      return () => {
        mounted = false;
        const controller = controllerRef.current;
        controllerRef.current = null;
        if (controller) void controller.dispose();
      };
      // A viewport owns exactly one canvas/controller for its mounted lifetime.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      controllerRef.current?.setInstances(instances);
      // assetIdentityKey is the intentional reload boundary.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assetIdentityKey]);

    useEffect(() => {
      controllerRef.current?.updateTransforms(instances);
    }, [instances]);

    useEffect(() => {
      controllerRef.current?.setSelected(selectedId);
    }, [selectedId]);

    const showBlockingState = status.phase !== 'ready';
    const rootClassName = [styles.root, className].filter(Boolean).join(' ');

    return (
      <section className={rootClassName} aria-label="USD 三维视口">
        <div ref={hostRef} className={styles.canvasHost} />

        {showToolbar && (
          <div className={styles.toolbar} aria-label="相机控制">
            <button
              type="button"
              className={styles.toolButton}
              onClick={() => controllerRef.current?.fitCamera()}
              disabled={status.phase !== 'ready'}
            >
              适配视图
            </button>
            <button
              type="button"
              className={styles.toolButton}
              onClick={() => controllerRef.current?.resetCamera()}
            >
              重置相机
            </button>
          </div>
        )}

        {showBlockingState && (
          <div
            className={`${styles.feedback} ${status.phase === 'error' ? styles.error : ''}`}
            role={status.phase === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            {(status.phase === 'initializing' || status.phase === 'loading') && (
              <span className={styles.spinner} aria-hidden="true" />
            )}
            <strong>{status.message}</strong>
            {status.error && <span className={styles.errorDetail}>{status.error}</span>}
            {status.phase === 'loading' && status.total > 0 && (
              <span className={styles.progress}>
                {status.loaded}/{status.total} 已就绪
              </span>
            )}
          </div>
        )}

        {status.phase === 'ready' && (
          <div className={styles.readyBadge} role="status">
            <span className={styles.readyDot} aria-hidden="true" />
            {status.loaded} 个资产 · WebGL
          </div>
        )}
      </section>
    );
  },
);

ThreeViewport.displayName = 'ThreeViewport';

