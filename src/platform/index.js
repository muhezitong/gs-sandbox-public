// 平台：画布尺寸与输入。键盘 WASD / 方向键；触屏按住画布，朝按下点的方向移动。
import { DESIGN_W, DESIGN_H, fitScreen } from './screen.js';

export function createPlatform() {
  const canvas = document.getElementById('game');
  const stage = document.getElementById('stage');
  const keys = new Set();
  const listeners = { tap: [], resize: [] };
  let touch = null;

  function resize() {
    const fit = fitScreen(window.innerWidth, window.innerHeight);
    stage.style.width = `${fit.w}px`;
    stage.style.height = `${fit.h}px`;
    for (const fn of listeners.resize) fn(fit.w, fit.h);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', (e) => { keys.add(e.code); if (['Space', 'Enter'].includes(e.code)) for (const fn of listeners.tap) fn(); });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  const logical = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * DESIGN_W, y: ((e.clientY - r.top) / r.height) * DESIGN_H }; };
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); touch = logical(e); for (const fn of listeners.tap) fn(); });
  canvas.addEventListener('pointermove', (e) => { if (touch) touch = logical(e); });
  window.addEventListener('pointerup', () => { touch = null; });

  return {
    canvas,
    query: new URLSearchParams(location.search),
    on(type, fn) { listeners[type].push(fn); },
    resize,
    // 当前移动方向 { x, z }：键盘优先；触屏为从画面中心指向按下点
    input() {
      const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const z = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      if (x || z) return { x, z };
      if (touch) { const dx = touch.x - DESIGN_W / 2, dz = touch.y - DESIGN_H / 2; const l = Math.hypot(dx, dz); return l > 40 ? { x: dx / l, z: dz / l } : { x: 0, z: 0 }; }
      return { x: 0, z: 0 };
    },
    raf: (fn) => requestAnimationFrame(fn),
    now: () => performance.now(),
  };
}
