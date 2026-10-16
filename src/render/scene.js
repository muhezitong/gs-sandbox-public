// three 场景：平台、玩家、木箱、相机、灯光。只读规则状态。
import * as THREE from 'three';
import { loadModel, crateFallback, capsuleFallback } from './models.js';

export async function createScene(canvas, { arenaSize, modelUrl, playerUrl }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101317);
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
  camera.position.set(0, arenaSize * 0.95, arenaSize * 0.95);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x334433, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(6, 12, 4);
  sun.castShadow = true;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -arenaSize;
  sun.shadow.camera.right = sun.shadow.camera.top = arenaSize;
  scene.add(sun);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(arenaSize, 0.4, arenaSize), new THREE.MeshStandardMaterial({ color: 0x3c4a40, roughness: 1 }));
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(arenaSize, arenaSize, 0x5b6b5f, 0x4a584d);
  grid.position.y = 0.01;
  scene.add(grid);

  // 玩家：小木匠 GLB，高约 1.3；缺失时回退到胶囊体
  const [hero, crate] = await Promise.all([
    loadModel(playerUrl, { size: 1.3, fallback: capsuleFallback }),
    loadModel(modelUrl, { size: 0.9, fallback: crateFallback }),
  ]);
  const player = hero.object;
  scene.add(player, crate.object);
  let px = 0, pz = 0;

  return {
    modelSource: crate.source,
    modelError: crate.error,
    playerSource: hero.source,
    playerError: hero.error,
    resize(w, h) { renderer.setSize(w, h, true); camera.aspect = w / h; camera.updateProjectionMatrix(); },
    render(state, t) {
      // 朝移动方向转身（模型正面朝 +z）
      const dx = state.player.x - px, dz = state.player.z - pz;
      if (dx * dx + dz * dz > 1e-6) player.rotation.y = Math.atan2(dx, dz);
      px = state.player.x; pz = state.player.z;
      player.position.set(px, 0, pz);
      crate.object.visible = !!state.crate && state.phase !== 'title';
      if (state.crate) { crate.object.position.set(state.crate.x, 0, state.crate.z); crate.object.rotation.y = t * 0.8; }
      renderer.render(scene, camera);
    },
  };
}
