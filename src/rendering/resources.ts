import type { BufferGeometry, Material, Object3D, Texture } from 'three';

export interface DisposableResources {
  geometries: Set<BufferGeometry>;
  materials: Set<Material>;
  textures: Set<Texture>;
}

export function createResourceCollection(): DisposableResources {
  return {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
  };
}

function collectTextureValue(value: unknown, textures: Set<Texture>) {
  if (!value || typeof value !== 'object') return;

  const maybeTexture = value as Texture;
  if (maybeTexture.isTexture) {
    textures.add(maybeTexture);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectTextureValue(entry, textures));
  }
}

function collectMaterialTextures(material: Material, textures: Set<Texture>) {
  for (const value of Object.values(material)) collectTextureValue(value, textures);

  const uniforms = (material as Material & {
    uniforms?: Record<string, { value?: unknown } | undefined>;
  }).uniforms;
  if (!uniforms) return;

  for (const uniform of Object.values(uniforms)) {
    collectTextureValue(uniform?.value, textures);
  }
}

/** Collect first, dispose later: Hydra may detach its objects during dispose(). */
export function collectObjectResources(root: Object3D, collection = createResourceCollection()) {
  root.traverse((object) => {
    const renderable = object as Object3D & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
    };

    if (renderable.geometry?.isBufferGeometry) {
      collection.geometries.add(renderable.geometry);
    }

    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material
        ? [renderable.material]
        : [];
    for (const material of materials) {
      collection.materials.add(material);
      collectMaterialTextures(material, collection.textures);
    }
  });

  return collection;
}

/** Every resource is disposed at most once, including textures shared by materials. */
export function disposeResourceCollection(collection: DisposableResources) {
  collection.textures.forEach((texture) => texture.dispose());
  collection.materials.forEach((material) => material.dispose());
  collection.geometries.forEach((geometry) => geometry.dispose());
  collection.textures.clear();
  collection.materials.clear();
  collection.geometries.clear();
}

