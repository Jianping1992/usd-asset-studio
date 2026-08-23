/** A serialisable xyz tuple used by saved scene compositions. */
export type ViewerVector3 = readonly [number, number, number];

/**
 * User-authored composition transform.
 *
 * Rotation values are Euler XYZ angles in degrees. Keeping degrees at this
 * boundary makes the type directly compatible with the composition JSON model;
 * the renderer converts them to radians when applying the transform.
 */
export interface ViewerTransform {
  position: ViewerVector3;
  rotation: ViewerVector3;
  scale: ViewerVector3;
}

export interface ViewerInstance {
  id: string;
  name: string;
  fileUrl: string;
  transform: ViewerTransform;
}

export type ViewerPhase = 'idle' | 'initializing' | 'loading' | 'ready' | 'error';

export interface ViewerStatus {
  phase: ViewerPhase;
  message: string;
  loaded: number;
  total: number;
  error?: string;
}

