// 统一的模型加载：GLB → 归一化尺寸、底面落地、水平居中；加载失败回退到程序化模型，游戏不因缺资产而不可玩。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

// 把 object 缩放到最长边 = size，底面放在 y=0，x / z 居中；返回包一层的 Group
export function normalize(object, size) {
  const box = new THREE.Box3().setFromObject(object);
  const dim = box.getSize(new THREE.Vector3());
  const k = size / Math.max(dim.x, dim.y, dim.z, 1e-6);
  object.scale.multiplyScalar(k);
  const b2 = new THREE.Box3().setFromObject(object);
  const c = b2.getCenter(new THREE.Vector3());
  object.position.x -= c.x;
  object.position.z -= c.z;
  object.position.y -= b2.min.y;
  const g = new THREE.Group();
  g.add(object);
  return g;
}

// 加载 url（相对站点根）；失败调用 fallback()。返回 { object, source: 'glb' | 'fallback', error }
export async function loadModel(url, { size = 1, fallback }) {
  try {
    const gltf = await loader.loadAsync(url);
    gltf.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return { object: normalize(gltf.scene, size), source: 'glb', error: null };
  } catch (e) {
    return { object: normalize(fallback(), size), source: 'fallback', error: String(e?.message ?? e) };
  }
}

// 程序化木箱：模板默认没有 GLB 资产时使用
export function crateFallback() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xb07a45, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x6e4524, roughness: 0.9 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), wood));
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.02, 0.12), dark);
    post.position.set(x, 0, z);
    g.add(post);
  }
  return g;
}
