// Asset loading: every glTF is loaded once and cached; instances are clones.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map();

export const A = {
  weapon: (n) => `assets/weapons/${n}.gltf`,
  prop: (n) => `assets/props/${n}.gltf`,
  character: (n) => `assets/characters/${n}.gltf`,
  tycoon: 'assets/tycoon/scene.gltf',
};

export function loadGLTF(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject)));
  }
  return cache.get(url);
}

export async function loadAll(urls, onProgress) {
  let done = 0;
  const out = {};
  await Promise.all(urls.map(async (u) => {
    out[u] = await loadGLTF(u);
    done++;
    onProgress?.(done, urls.length);
  }));
  return out;
}

// Static prop instance: shares geometry & materials, cast/receive shadows.
export async function propInstance(url, { shadows = true } = {}) {
  const gltf = await loadGLTF(url);
  const obj = gltf.scene.clone(true);
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = shadows;
      o.receiveShadow = shadows;
    }
  });
  return obj;
}

// Rigged character instance with its own skeleton + animation clips.
export async function characterInstance(url) {
  const gltf = await loadGLTF(url);
  const obj = skeletonClone(gltf.scene);
  obj.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false;
    }
  });
  return { obj, clips: gltf.animations };
}
