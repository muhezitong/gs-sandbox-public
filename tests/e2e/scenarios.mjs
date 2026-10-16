// e2e 场景：横屏 1280×720。规则状态用 window.__game.step() 按游戏时间推进，不依赖真实帧率；新增玩法时补场景。
export const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };
export const DESIGN = { width: 1280, height: 720 };
// 无 GPU 的 CI 上用软件 WebGL
export const LAUNCH_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

// 画布中心附近有没有被画上东西（不是纯背景色）
const painted = (page) => page.evaluate(() => {
  const c = document.getElementById('game');
  const g = c.getContext('webgl2') ?? c.getContext('webgl');
  const px = new Uint8Array(4);
  g.readPixels(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
  return !(px[0] === 16 && px[1] === 19 && px[2] === 23);
});

export const SCENARIOS = [
  {
    name: 'smoke',
    async run({ page, open, shot, tap, state, assert }) {
      await open('?seed=1');
      assert((await state()).phase === 'title', '应停在标题页');
      assert(await page.evaluate(() => window.__game.playerSource) === 'glb', '玩家应加载小木匠模型');
      assert(await painted(page), '画布没有渲染出场景');
      await shot('title');
      await tap(640, 360);
      assert((await state()).phase === 'play', '点击后应开局');
      // 朝木箱走过去：按游戏时间推进，直到拾取
      const got = await page.evaluate(() => {
        const g = window.__game;
        for (let i = 0; i < 600 && g.game.state.score === 0; i++) {
          const { player: p, crate: c } = g.game.state;
          const dx = c.x - p.x, dz = c.z - p.z, l = Math.hypot(dx, dz) || 1;
          g.step(1 / 30, { x: dx / l, z: dz / l });
        }
        return g.game.state.score;
      });
      assert(got === 1, `走到木箱上应得 1 分，实际 ${got}`);
      await shot('play');
    },
  },
  {
    name: 'keyboard',
    // 不依赖真实帧率（CI 上软件渲染很慢）：先验证按键映射成方向，再按游戏时间推进
    async run({ page, open, state, assert }) {
      await open('?seed=2');
      await page.keyboard.press('Space');
      assert((await state()).phase === 'play', '空格应开局');
      await page.keyboard.down('KeyD');
      await page.keyboard.down('KeyW');
      const dir = await page.evaluate(() => window.__game.input());
      await page.keyboard.up('KeyD');
      await page.keyboard.up('KeyW');
      assert(dir.x === 1 && dir.z === -1, `D + W 应为右上，实际 ${JSON.stringify(dir)}`);
      const x0 = (await state()).player.x;
      await page.evaluate((d) => window.__game.step(0.5, d), dir);
      assert((await state()).player.x > x0 + 1, '按方向推进 0.5 秒应明显移动');
    },
  },
  {
    // 缺资产时回退到程序化模型，游戏照常可玩
    name: 'model-fallback',
    async run({ page, open, shot, tap, state, assert }) {
      await open('?seed=1&model=models/missing.glb');
      assert(await page.evaluate(() => window.__game.modelSource) === 'fallback', '应回退到程序化模型');
      await tap(640, 360);
      await page.evaluate(() => window.__game.step(1, { x: 1, z: 0 }));
      assert((await state()).phase === 'play', '回退后仍应可玩');
      assert(await painted(page), '回退后画布没有渲染');
      await shot('play');
    },
  },
  {
    // 缺玩家模型时回退到胶囊体，照常能拾取木箱
    name: 'player-fallback',
    async run({ page, open, shot, tap, state, assert }) {
      await open('?seed=1&player=models/missing.glb');
      assert(await page.evaluate(() => window.__game.playerSource) === 'fallback', '玩家应回退到胶囊体');
      await tap(640, 360);
      const got = await page.evaluate(() => {
        const g = window.__game;
        for (let i = 0; i < 600 && g.game.state.score === 0; i++) {
          const { player: p, crate: c } = g.game.state;
          const dx = c.x - p.x, dz = c.z - p.z, l = Math.hypot(dx, dz) || 1;
          g.step(1 / 30, { x: dx / l, z: dz / l });
        }
        return g.game.state.score;
      });
      assert(got === 1, `回退后走到木箱上应得 1 分，实际 ${got}`);
      assert(await painted(page), '回退后画布没有渲染');
      await shot('play');
    },
  },
  {
    name: 'over',
    async run({ page, open, tap, shot, state, assert }) {
      await open('?seed=1');
      await tap(640, 360);
      await page.evaluate(() => window.__game.step(31));
      assert((await state()).phase === 'over', '时间到应结束');
      assert(/时间到/.test(await page.locator('#hud').innerText()), '结束页应显示“时间到”');
      await shot('end');
    },
  },
];
