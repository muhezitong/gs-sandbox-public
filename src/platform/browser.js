// 浏览器平台实现：画布、指针输入、本地存储。
import { DESIGN_W, DESIGN_H, fitScreen } from './screen.js';

export function createBrowserPlatform(canvas = document.getElementById('game')) {
  const ctx = canvas.getContext('2d');
  const listeners = { down: [], resize: [] };
  const view = { scale: 1, dpr: 1 };

  function resize() {
    const fit = fitScreen(window.innerWidth, window.innerHeight);
    view.scale = fit.scale;
    view.dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.style.width = `${fit.w}px`;
    canvas.style.height = `${fit.h}px`;
    canvas.width = Math.round(fit.w * view.dpr);
    canvas.height = Math.round(fit.h * view.dpr);
    for (const fn of listeners.resize) fn();
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const p = { x: ((e.clientX - r.left) / r.width) * DESIGN_W, y: ((e.clientY - r.top) / r.height) * DESIGN_H };
    for (const fn of listeners.down) fn(p);
  });
  window.addEventListener('resize', resize);
  resize();

  return {
    name: 'browser',
    ctx,
    query: new URLSearchParams(location.search),
    beginFrame() {
      const k = view.scale * view.dpr;
      ctx.setTransform(k, 0, 0, k, 0, 0);
    },
    on(type, fn) { listeners[type].push(fn); },
    raf: (fn) => requestAnimationFrame(fn),
    now: () => performance.now(),
    storage: {
      get(key) { try { return localStorage.getItem(key); } catch { return null; } },
      set(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } },
    },
  };
}
