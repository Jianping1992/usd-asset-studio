import { Box3, MathUtils, PerspectiveCamera, Sphere, Vector3, type Object3D } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const DEFAULT_CAMERA_POSITION = new Vector3(4.5, 3.25, 6.5);
const DEFAULT_CAMERA_TARGET = new Vector3(0, 0.6, 0);

export function resetPerspectiveCamera(camera: PerspectiveCamera, controls: OrbitControls) {
  camera.position.copy(DEFAULT_CAMERA_POSITION);
  camera.near = 0.01;
  camera.far = 2_000;
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  controls.target.copy(DEFAULT_CAMERA_TARGET);
  controls.minDistance = 0.02;
  controls.maxDistance = 1_000;
  controls.update();
}

export function fitPerspectiveCamera(
  camera: PerspectiveCamera,
  controls: OrbitControls,
  objects: Object3D[],
  fitOffset = 1.35,
) {
  const box = new Box3().makeEmpty();
  for (const object of objects) {
    object.updateWorldMatrix(true, true);
    // Use geometry bounding volumes rather than scanning every vertex; camera
    // fitting should stay cheap for production-sized simulation meshes.
    box.expandByObject(object, false);
  }
  if (box.isEmpty()) return false;

  const sphere = box.getBoundingSphere(new Sphere());
  if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) return false;

  const verticalFov = MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const limitingFov = Math.max(0.01, Math.min(verticalFov, horizontalFov));
  const distance = (sphere.radius / Math.sin(limitingFov / 2)) * fitOffset;

  const viewDirection = camera.position.clone().sub(controls.target).normalize();
  if (viewDirection.lengthSq() === 0) viewDirection.set(1, 0.65, 1).normalize();

  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(viewDirection, distance);
  camera.near = Math.max(distance / 1_000, 0.001);
  camera.far = Math.max(distance * 100, 100);
  controls.minDistance = Math.max(sphere.radius * 0.02, 0.001);
  controls.maxDistance = Math.max(distance * 20, 10);
  camera.updateProjectionMatrix();
  controls.update();
  return true;
}
