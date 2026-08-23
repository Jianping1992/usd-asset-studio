import type { USD } from '@needle-tools/usd';
import type { NeedleThreeHydraHandle, createThreeHydra as CreateThreeHydra } from '@needle-tools/usd/three';
import type { Object3D } from 'three';
import { decrementRenderStat, incrementRenderStat } from './stats';

type CreateThreeHydraFunction = typeof CreateThreeHydra;

interface UsdRuntime {
  USD: USD;
  createThreeHydra: CreateThreeHydraFunction;
}

export interface HydraLoadRequest {
  id: string;
  name: string;
  fileUrl: string;
  usdRoot: Object3D;
}

export interface TrackedHydraHandle {
  id: string;
  handle: NeedleThreeHydraHandle;
  tracked: boolean;
}

let runtimePromise: Promise<UsdRuntime> | undefined;
let hydraOperationTail: Promise<void> = Promise.resolve();

/**
 * Lazy, memoised OpenUSD boot. Type-only imports above are erased, so neither
 * the bindings JavaScript nor its WASM are requested until this function runs.
 */
export function getUsdRuntime(): Promise<UsdRuntime> {
  if (!runtimePromise) {
    incrementRenderStat('wasmLoads');
    runtimePromise = Promise.all([
      import('@needle-tools/usd'),
      import('@needle-tools/usd/three'),
    ])
      .then(async ([usdPackage, threeAdapter]) => ({
        USD: await usdPackage.getUsdModule(),
        createThreeHydra: threeAdapter.createThreeHydra,
      }))
      .catch((error: unknown) => {
        // A transient fetch failure should be retryable on the next preview.
        runtimePromise = undefined;
        throw error;
      });
  }
  return runtimePromise;
}

/**
 * The package shares one Emscripten filesystem. All Hydra create/dispose work
 * is therefore serialised globally; a batch holds the lock for its full loop.
 */
function runHydraOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = hydraOperationTail.catch(() => undefined).then(operation);
  hydraOperationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function disposeHandlesUnlocked(handles: TrackedHydraHandle[]) {
  const errors: unknown[] = [];

  // Materials and textures can continue reading generated files after
  // handle.ready() has resolved when waitForMaterials is disabled. All handles
  // share the Emscripten filesystem, so disposing one handle before the other
  // material jobs settle can unlink files still needed by its siblings. Hold a
  // group-wide barrier before the first handle is allowed to tear down the VFS.
  await Promise.all(handles.map(async (item) => {
    const materialsReady = item.handle.materialsReady;
    if (typeof materialsReady !== 'function') return;

    try {
      await materialsReady.call(item.handle);
    } catch (error) {
      // Material failures must not prevent the more important Hydra/VFS cleanup.
      errors.push(error);
      console.warn(`Hydra materials did not settle cleanly for ${item.id}`, error);
    }
  }));

  // Deliberately sequential: every package handle cleans the same VFS roots.
  for (const item of handles) {
    try {
      await item.handle.dispose();
    } catch (error) {
      errors.push(error);
      console.warn(`Hydra handle cleanup failed for ${item.id}`, error);
    } finally {
      if (item.tracked) {
        item.tracked = false;
        decrementRenderStat('activeHydraHandles');
      }
    }
  }

  return errors;
}

export function createHydraGroup(
  requests: HydraLoadRequest[],
  signal: AbortSignal,
  onProgress?: (loaded: number, total: number, current: HydraLoadRequest) => void,
): Promise<TrackedHydraHandle[]> {
  return runHydraOperation(async () => {
    const runtime = await getUsdRuntime();
    const created: TrackedHydraHandle[] = [];

    try {
      for (let index = 0; index < requests.length; index += 1) {
        if (signal.aborted) throw new DOMException('USD load was cancelled', 'AbortError');

        const request = requests[index];
        onProgress?.(index, requests.length, request);

        // Import comes from the documented /three entry point. Do not
        // parallelise this loop: createThreeHydra mutates the shared VFS.
        const handle = await runtime.createThreeHydra({
          USD: runtime.USD,
          scene: request.usdRoot,
          url: request.fileUrl,
          autoPlay: false,
          waitForMaterials: false,
        });
        const tracked = { id: request.id, handle, tracked: true };
        created.push(tracked);
        incrementRenderStat('activeHydraHandles');

        await handle.ready();
        onProgress?.(index + 1, requests.length, request);
      }

      if (signal.aborted) throw new DOMException('USD load was cancelled', 'AbortError');
      return created;
    } catch (error) {
      // Keep cleanup in this same critical section so no other batch can enter
      // between a partial group failure and its shared-VFS teardown.
      await disposeHandlesUnlocked(created);
      throw error;
    }
  });
}

/** Dispose every member of a composition as one indivisible lifecycle group. */
export function disposeHydraGroup(handles: TrackedHydraHandle[]): Promise<unknown[]> {
  if (handles.length === 0) return Promise.resolve([]);
  return runHydraOperation(() => disposeHandlesUnlocked(handles));
}
