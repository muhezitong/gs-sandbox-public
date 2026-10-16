// 纯规则：不碰画布、DOM 与平台 API，单测直接导入。
// 示例玩法：限时点目标。立项后按《游戏方向》替换。
import { createRng } from './rng.js';
import { TUNING } from '../data/tuning.js';

export function createGame({ seed = 1, width, height, tuning = TUNING } = {}) {
  const rng = createRng(seed);
  const game = { phase: 'title', score: 0, timeLeft: tuning.roundSeconds, target: null, seed };

  function spawn() {
    const m = tuning.margin;
    game.target = { x: rng.range(m, width - m), y: rng.range(m, height - m), r: tuning.targetRadius };
  }

  return {
    state: game,
    start() {
      game.phase = 'play';
      game.score = 0;
      game.timeLeft = tuning.roundSeconds;
      spawn();
    },
    // 返回本次点击是否命中
    tap(x, y) {
      if (game.phase !== 'play') return false;
      const t = game.target;
      const hit = (x - t.x) ** 2 + (y - t.y) ** 2 <= t.r ** 2;
      if (hit) { game.score++; spawn(); }
      return hit;
    },
    update(dt) {
      if (game.phase !== 'play') return;
      game.timeLeft = Math.max(0, game.timeLeft - dt);
      if (game.timeLeft === 0) game.phase = 'over';
    },
  };
}
