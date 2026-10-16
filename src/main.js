// 入口：平台输入 → 规则 → three 场景；HUD 用 DOM 叠在画布上。
import { createPlatform } from './platform/index.js';
import { createGame } from './core/game.js';
import { createScene } from './render/scene.js';
import { TUNING } from './data/tuning.js';

const TITLE = '公开沙盒3D';
const platform = createPlatform();
const seed = Number(platform.query.get('seed') ?? (Date.now() & 0xffff));
const game = createGame({ seed });
// 模型地址可用 ?model= 覆盖（e2e 用它验证缺资产时的回退）
const modelUrl = platform.query.get('model') ?? 'models/crate.glb';
const view = await createScene(platform.canvas, { arenaSize: TUNING.arenaSize, modelUrl });
platform.on('resize', (w, h) => view.resize(w, h));
platform.resize();

const hud = document.getElementById('hud');
function drawHud(s) {
  if (s.phase === 'title') hud.innerHTML = `<div class="center"><div class="title">${TITLE}</div><div class="hint">按空格或点一下开始 · WASD / 方向键移动</div></div>`;
  else if (s.phase === 'play') hud.innerHTML = `<div class="top">木箱 ${s.score}<div class="sub">剩余 ${Math.ceil(s.timeLeft)} 秒</div></div>`;
  else hud.innerHTML = `<div class="center"><div class="title">时间到 · ${s.score} 个</div><div class="hint">按空格或点一下再来一局</div></div>`;
}

platform.on('tap', () => { if (game.state.phase !== 'play') game.start(); });

// 调试接口：只在开发服务器与非生产构建里存在；e2e 用 step() 按游戏时间推进，不依赖真实帧率
let paused = false;
if (import.meta.env.MODE !== 'production') {
  window.__game = {
    game, ready: true, modelSource: view.modelSource, modelError: view.modelError, input: () => platform.input(),
    step(seconds, input = { x: 0, z: 0 }, dt = 1 / 60) { paused = true; for (let t = 0; t < seconds; t += dt) game.update(dt, input); view.render(game.state, platform.now() / 1000); drawHud(game.state); },
    resume() { paused = false; },
  };
}

let last = platform.now();
function frame() {
  const now = platform.now();
  if (!paused) game.update(Math.min(0.1, (now - last) / 1000), platform.input());
  last = now;
  view.render(game.state, now / 1000);
  drawHud(game.state);
  platform.raf(frame);
}
frame();
