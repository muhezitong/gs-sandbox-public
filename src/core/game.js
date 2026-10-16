// 纯规则：平面坐标 x / z，不依赖 three、DOM 与平台 API，单测直接导入。
// 示例玩法：限时收集木箱。立项后按《游戏方向》替换。
import { createRng } from './rng.js';
import { TUNING } from '../data/tuning.js';

export function createGame({ seed = 1, tuning = TUNING } = {}) {
  const rng = createRng(seed);
  const half = tuning.arenaSize / 2;
  const game = { phase: 'title', score: 0, timeLeft: tuning.roundSeconds, player: { x: 0, z: 0 }, crate: null, lastPickupAt: null, bestInterval: null, seed };

  // 木箱随机放在平台内，离边缘 edgeMargin，且不贴着玩家
  function spawn() {
    const lim = half - tuning.edgeMargin;
    for (let i = 0; i < 20; i++) {
      const c = { x: rng.range(-lim, lim), z: rng.range(-lim, lim) };
      if (Math.hypot(c.x - game.player.x, c.z - game.player.z) > tuning.pickupRadius * 3) { game.crate = c; return; }
    }
    game.crate = { x: -Math.sign(game.player.x || 1) * lim, z: -Math.sign(game.player.z || 1) * lim };
  }

  return {
    state: game,
    start() {
      Object.assign(game, { phase: 'play', score: 0, timeLeft: tuning.roundSeconds, player: { x: 0, z: 0 }, lastPickupAt: null, bestInterval: null });
      spawn();
    },
    // input：{ x, z }，各分量 -1..1；返回本帧是否拾取
    update(dt, input = { x: 0, z: 0 }) {
      if (game.phase !== 'play') return false;
      const len = Math.hypot(input.x, input.z);
      if (len > 0) {
        const k = (tuning.playerSpeed * dt) / Math.max(1, len);
        game.player.x = Math.max(-half, Math.min(half, game.player.x + input.x * k));
        game.player.z = Math.max(-half, Math.min(half, game.player.z + input.z * k));
      }
      game.timeLeft = Math.max(0, game.timeLeft - dt);
      if (game.timeLeft === 0) { game.phase = 'over'; return false; }
      if (Math.hypot(game.player.x - game.crate.x, game.player.z - game.crate.z) <= tuning.pickupRadius) {
        game.score++;
        // 最快间隔：两次拾取之间的最短用时（局内已过秒数之差），不足两次为 null
        const at = tuning.roundSeconds - game.timeLeft;
        if (game.lastPickupAt !== null) {
          const gap = at - game.lastPickupAt;
          if (game.bestInterval === null || gap < game.bestInterval) game.bestInterval = gap;
        }
        game.lastPickupAt = at;
        spawn();
        return true;
      }
      return false;
    },
  };
}
