// 入口：把平台输入接到规则，把规则状态交给绘制。
import { createPlatform } from './platform/index.js';
import { DESIGN_W, DESIGN_H } from './platform/screen.js';
import { createGame } from './core/game.js';
import { drawFrame } from './render/draw.js';

const TITLE = '公开沙盒';
const platform = createPlatform();
const seed = Number(platform.query.get('seed') ?? (Date.now() & 0xffff));
const game = createGame({ seed, width: DESIGN_W, height: DESIGN_H });

platform.on('down', ({ x, y }) => {
  if (game.state.phase === 'play') game.tap(x, y);
  else game.start();
});

let last = platform.now();
function frame() {
  const now = platform.now();
  game.update(Math.min(0.1, (now - last) / 1000));
  last = now;
  platform.beginFrame();
  drawFrame(platform.ctx, game.state, TITLE);
  platform.raf(frame);
}
frame();

// 调试接口：只在开发服务器与 e2e 构建存在，发布构建里没有
if (import.meta.env.MODE !== 'production') window.__game = { game, ready: true };
