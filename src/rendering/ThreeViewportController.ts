import {
  ACESFilmicToneMapping,
  Box3,
  BoxHelper,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  MathUtils,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { fitPerspectiveCamera, resetPerspectiveCamera } from './camera';
import {
  collectObjectResources,
  createResourceCollection,
  disposeResourceCollection,
} from './resources';
import { decrementRenderStat, incrementRenderStat } from './stats';
import type { ViewerInstance, ViewerStatus, ViewerTransform } from './types';
import {
  createHydraGroup,
  disposeHydraGroup,
  type HydraLoadRequest,
  type TrackedHydraHandle,
} from './usdRuntime';

interface ViewerCallbacks {
  onSelect?: (id: string | null) => void;
  onStatus?: (status: ViewerStatus) => void;
}

interface LoadedInstance {
  id: string;
  name: string;
  transformGroup: Group;
  usdRoot: Group;
  hydra: TrackedHydraHandle;
}

interface PendingInstance {
  instance: ViewerInstance;
  transformGroup: Group;
  usdRoot: Group;
}

const EMPTY_STATUS: ViewerStatus = {
  phase: 'idle',
  message: '请选择需要预览的 USD / USDZ 资产',
  loaded: 0,
  total: 0,
};

function copyInstance(instance: ViewerInstance): ViewerInstance {
  return {
    id: instance.id,
    name: instance.name,
    fileUrl: instance.fileUrl,
    transform: {
      position: [...instance.transform.position],
      rotation: [...instance.transform.rotation],
      scale: [...instance.transform.scale],
    },
  };
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function applyTransform(object: Object3D, transform: ViewerTransform) {
  object.position.set(
    finite(transform.position[0], 0),
    finite(transform.position[1], 0),
    finite(transform.position[2], 0),
  );
  object.rotation.set(
    MathUtils.degToRad(finite(transform.rotation[0], 0)),
    MathUtils.degToRad(finite(transform.rotation[1], 0)),
    MathUtils.degToRad(finite(transform.rotation[2], 0)),
    'XYZ',
  );
  object.scale.set(
    finite(transform.scale[0], 1),
    finite(transform.scale[1], 1),
    finite(transform.scale[2], 1),
  );
  object.updateMatrixWorld(true);
}

function errorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || '未知 WebGL / OpenUSD 错误');
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Imperative rendering adapter kept outside React. React owns one controller;
 * this class owns every listener, animation frame, GPU resource and Hydra
 * handle created for that viewport.
 */
export class ThreeViewportController {
  private readonly scene = new Scene();
  private readonly contentRoot = new Group();
  private readonly camera = new PerspectiveCamera(45, 1, 0.01, 2_000);
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly grid = new GridHelper(40, 40, 0x4b5563, 0x2b3440);
  private readonly resizeObserver: ResizeObserver | null;
  private callbacks: ViewerCallbacks;
  private records: LoadedInstance[] = [];
  private desiredTransforms = new Map<string, ViewerTransform>();
  private selectedId: string | null = null;
  private selectionHelper: BoxHelper | null = null;
  private frameId: number | null = null;
  private loopRunning = false;
  private loopEnabled = false;
  private lastFrameTime = 0;
  private loadAbort: AbortController | null = null;
  private groupTask: Promise<void> = Promise.resolve();
  private disposed = false;
  private canvasTracked = false;
  private pointerStart: { id: number; x: number; y: number } | null = null;

  constructor(
    private readonly container: HTMLElement,
    callbacks: ViewerCallbacks = {},
  ) {
    this.callbacks = callbacks;
    this.scene.name = 'USD Asset Studio Scene';
    this.scene.background = new Color(0x151b23);

    this.contentRoot.name = '__usd_composition_root';
    this.scene.add(this.contentRoot);

    this.grid.name = '__viewer_grid';
    const gridMaterials = Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.55;
    });
    this.scene.add(this.grid);

    const hemisphere = new HemisphereLight(0xdcecff, 0x202936, 1.8);
    hemisphere.name = '__viewer_hemisphere_light';
    this.scene.add(hemisphere);

    const keyLight = new DirectionalLight(0xffffff, 2.5);
    keyLight.name = '__viewer_key_light';
    keyLight.position.set(4, 8, 5);
    this.scene.add(keyLight);

    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.dataset.usdStudioCanvas = 'true';
    this.renderer.domElement.setAttribute('aria-label', 'USD 三维预览画布');
    this.container.append(this.renderer.domElement);
    incrementRenderStat('activeCanvases');
    this.canvasTracked = true;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    resetPerspectiveCamera(this.camera, this.controls);
    this.controls.addEventListener('change', this.handleControlsChange);

    this.raycaster.params.Points.threshold = 0.08;
    this.raycaster.params.Line.threshold = 0.04;

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.handlePointerCancel);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('resize', this.handleWindowResize, { passive: true });

    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => this.resize());
    this.resizeObserver?.observe(this.container);

    this.resize();
    this.emitStatus(EMPTY_STATUS);
  }

  setCallbacks(callbacks: ViewerCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Asset identity/file changes trigger an atomic group replacement. Transform
   * changes use updateTransforms() and do not reload OpenUSD.
   */
  setInstances(instances: ViewerInstance[]) {
    if (this.disposed) return;

    const snapshot = instances.map(copyInstance);
    this.desiredTransforms = new Map(snapshot.map((item) => [item.id, item.transform]));
    this.loadAbort?.abort();
    this.loopEnabled = false;
    this.stopLoop();

    const abortController = new AbortController();
    this.loadAbort = abortController;
    this.groupTask = this.groupTask
      .catch((error) => console.warn('Previous viewport group task failed', error))
      .then(() => this.replaceGroup(snapshot, abortController.signal));
  }

  updateTransforms(instances: ViewerInstance[]) {
    for (const instance of instances) {
      this.desiredTransforms.set(instance.id, instance.transform);
      const record = this.records.find((entry) => entry.id === instance.id);
      if (record) {
        record.name = instance.name;
        record.transformGroup.name = `Instance · ${instance.name}`;
        applyTransform(record.transformGroup, instance.transform);
      }
    }
    this.selectionHelper?.update();
    this.renderStaticFrame();
  }

  setSelected(id: string | null | undefined) {
    this.selectedId = id ?? null;
    this.refreshSelectionHelper();
    this.renderStaticFrame();
  }

  fitCamera(instanceId?: string) {
    const targets = instanceId
      ? this.records.filter((record) => record.id === instanceId)
      : this.records;
    if (targets.length === 0) {
      resetPerspectiveCamera(this.camera, this.controls);
      this.renderStaticFrame();
      return;
    }
    fitPerspectiveCamera(
      this.camera,
      this.controls,
      targets.map((record) => record.transformGroup),
    );
    this.renderStaticFrame();
  }

  resetCamera() {
    resetPerspectiveCamera(this.camera, this.controls);
    this.renderStaticFrame();
  }

  /** Stop work synchronously, then complete the ordered asynchronous teardown. */
  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.loadAbort?.abort();
    this.loopEnabled = false;
    this.stopLoop();
    this.detachListeners();

    this.groupTask = this.groupTask
      .catch((error) => console.warn('Viewport load ended during disposal', error))
      .then(() => this.releaseLoadedGroup());
    await this.groupTask;

    this.disposeSelectionHelper();
    const remainingResources = collectObjectResources(this.scene);
    disposeResourceCollection(remainingResources);
    this.scene.clear();

    this.controls.dispose();
    this.renderer.setAnimationLoop(null);
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    try {
      this.renderer.forceContextLoss();
    } catch (error) {
      console.debug('WebGL context was already unavailable during cleanup', error);
    }
    this.renderer.domElement.remove();
    if (this.canvasTracked) {
      this.canvasTracked = false;
      decrementRenderStat('activeCanvases');
    }
  }

  private async replaceGroup(instances: ViewerInstance[], signal: AbortSignal) {
    // setInstances() stopped RAF before this task was enqueued. Keep it stopped
    // until all prior handles have completed their asynchronous disposal.
    await this.releaseLoadedGroup();
    if (this.disposed || signal.aborted) return;

    if (instances.length === 0) {
      this.emitStatus(EMPTY_STATUS);
      this.loopEnabled = false;
      this.renderStaticFrame();
      return;
    }

    this.emitStatus({
      phase: 'initializing',
      message: '正在按需初始化 OpenUSD WebAssembly…',
      loaded: 0,
      total: instances.length,
    });

    const pending = instances.map((instance) => this.createPendingInstance(instance));
    const requests: HydraLoadRequest[] = pending.map(({ instance, usdRoot }) => ({
      id: instance.id,
      name: instance.name,
      fileUrl: instance.fileUrl,
      usdRoot,
    }));

    try {
      if (!window.crossOriginIsolated) {
        throw new Error('OpenUSD 线程版 WASM 需要 COOP/COEP 响应头；当前页面未启用跨源隔离。');
      }

      const handles = await createHydraGroup(requests, signal, (loaded, total, current) => {
        if (this.disposed || signal.aborted) return;
        this.emitStatus({
          phase: 'loading',
          message: `正在加载 ${current.name}（${Math.min(loaded + 1, total)}/${total}）`,
          loaded,
          total,
        });
      });

      if (this.disposed || signal.aborted) {
        // setInstances()/dispose() already stopped RAF before aborting.
        await disposeHydraGroup(handles);
        this.disposePendingInstances(pending);
        return;
      }

      this.records = pending.map((entry, index) => ({
        id: entry.instance.id,
        name: entry.instance.name,
        transformGroup: entry.transformGroup,
        usdRoot: entry.usdRoot,
        hydra: handles[index],
      }));
      for (const record of this.records) {
        const latest = this.desiredTransforms.get(record.id);
        if (latest) applyTransform(record.transformGroup, latest);
      }

      this.refreshSelectionHelper();
      this.resize();
      this.fitCamera();
      this.emitStatus({
        phase: 'ready',
        message: `${this.records.length} 个 USD 资产已就绪`,
        loaded: this.records.length,
        total: this.records.length,
      });
      this.loopEnabled = true;
      this.startLoop();
    } catch (error) {
      this.disposePendingInstances(pending);
      if (this.disposed || signal.aborted || isAbortError(error)) return;

      const message = errorText(error);
      console.error('USD scene group failed to load', error);
      this.emitStatus({
        phase: 'error',
        message: '三维资产加载失败',
        loaded: 0,
        total: instances.length,
        error: message,
      });
      this.loopEnabled = false;
      this.renderStaticFrame();
    }
  }

  private createPendingInstance(instance: ViewerInstance): PendingInstance {
    const transformGroup = new Group();
    transformGroup.name = `Instance · ${instance.name}`;
    transformGroup.userData.viewerInstanceId = instance.id;
    transformGroup.userData.viewerInstanceName = instance.name;
    applyTransform(transformGroup, instance.transform);

    // Hydra applies USD stage metadata (including Z-up correction) to usdRoot.
    // Keeping that below transformGroup prevents it from clobbering the user's
    // composition rotation/position/scale.
    const usdRoot = new Group();
    usdRoot.name = `USD Root · ${instance.name}`;
    usdRoot.userData.viewerInstanceId = instance.id;
    transformGroup.add(usdRoot);
    this.contentRoot.add(transformGroup);
    return { instance, transformGroup, usdRoot };
  }

  private disposePendingInstances(instances: PendingInstance[]) {
    const resources = createResourceCollection();
    instances.forEach(({ transformGroup }) => collectObjectResources(transformGroup, resources));
    instances.forEach(({ transformGroup }) => {
      transformGroup.removeFromParent();
      transformGroup.clear();
    });
    disposeResourceCollection(resources);
  }

  private async releaseLoadedGroup() {
    if (this.records.length === 0) return;
    this.stopLoop();
    this.disposeSelectionHelper();

    const records = this.records;
    this.records = [];
    const resources = createResourceCollection();
    records.forEach((record) => collectObjectResources(record.transformGroup, resources));

    // Package disposal may detach render objects. We snapshot above, await every
    // Hydra handle, then traverse again and dispose the de-duplicated union.
    await disposeHydraGroup(records.map((record) => record.hydra));
    records.forEach((record) => collectObjectResources(record.transformGroup, resources));
    records.forEach((record) => {
      record.transformGroup.removeFromParent();
      record.transformGroup.clear();
    });
    disposeResourceCollection(resources);
  }

  private refreshSelectionHelper() {
    this.disposeSelectionHelper();
    if (!this.selectedId) return;

    const target = this.records.find((record) => record.id === this.selectedId)?.transformGroup;
    if (!target || new Box3().setFromObject(target, false).isEmpty()) return;

    this.selectionHelper = new BoxHelper(target, 0x5b8cff);
    this.selectionHelper.name = '__viewer_selection_helper';
    this.selectionHelper.renderOrder = 10_000;
    this.scene.add(this.selectionHelper);
  }

  private disposeSelectionHelper() {
    if (!this.selectionHelper) return;
    const resources = collectObjectResources(this.selectionHelper);
    this.selectionHelper.removeFromParent();
    disposeResourceCollection(resources);
    this.selectionHelper = null;
  }

  private resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderStaticFrame();
  }

  /** Render one frame for idle/error camera interaction and state updates. */
  private renderStaticFrame() {
    if (this.disposed || this.loopRunning) return;
    this.selectionHelper?.update();
    this.renderer.render(this.scene, this.camera);
  }

  private startLoop() {
    if (
      this.disposed
      || !this.loopEnabled
      || this.loopRunning
      || document.visibilityState === 'hidden'
    ) return;
    this.loopRunning = true;
    this.lastFrameTime = performance.now();
    incrementRenderStat('activeLoops');
    this.frameId = window.requestAnimationFrame(this.renderFrame);
  }

  private stopLoop() {
    if (!this.loopRunning) return;
    this.loopRunning = false;
    if (this.frameId !== null) window.cancelAnimationFrame(this.frameId);
    this.frameId = null;
    decrementRenderStat('activeLoops');
  }

  private readonly renderFrame = (time: number) => {
    if (!this.loopRunning || this.disposed) return;
    this.frameId = window.requestAnimationFrame(this.renderFrame);
    const dt = Math.min(Math.max((time - this.lastFrameTime) / 1_000, 0), 0.1);
    this.lastFrameTime = time;

    for (const record of this.records) record.hydra.handle.update(dt);
    this.controls.update(dt);
    this.selectionHelper?.update();
    this.renderer.render(this.scene, this.camera);
  };

  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') this.stopLoop();
    else if (this.loopEnabled) this.startLoop();
    else this.renderStaticFrame();
  };

  private readonly handleWindowResize = () => this.resize();

  private readonly handleControlsChange = () => this.renderStaticFrame();

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  private readonly handlePointerCancel = () => {
    this.pointerStart = null;
  };

  private readonly handlePointerUp = (event: PointerEvent) => {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (!start || start.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.records.map((record) => record.transformGroup),
      true,
    );

    let object: Object3D | null = hits[0]?.object ?? null;
    while (object && typeof object.userData.viewerInstanceId !== 'string') object = object.parent;
    const id = typeof object?.userData.viewerInstanceId === 'string'
      ? object.userData.viewerInstanceId
      : null;
    this.setSelected(id);
    this.callbacks.onSelect?.(id);
  };

  private detachListeners() {
    this.resizeObserver?.disconnect();
    this.controls.removeEventListener('change', this.handleControlsChange);
    window.removeEventListener('resize', this.handleWindowResize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.handlePointerCancel);
  }

  private emitStatus(status: ViewerStatus) {
    if (!this.disposed) this.callbacks.onStatus?.(status);
  }
}
