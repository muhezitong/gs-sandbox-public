// e2e：Playwright + Chrome 自动试玩并截图到 tests/shots/。
// 默认先 vite build --mode e2e 再 vite preview 测构建产物；BASE=http://... 则连已有服务器。
// 用法：npm run e2e [场景名...]；E2E_CHANNEL=chromium 用 Playwright 自带浏览器
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCENARIOS } from './scenarios.mjs';

const helpers = new URL('./helpers.mjs', import.meta.url);
const { extend } = existsSync(fileURLToPath(helpers)) ? await import(helpers) : {};

const root = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = root + 'tests/shots/';
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const list = only.length ? SCENARIOS.filter((s) => only.includes(s.name)) : SCENARIOS;
if (!list.length) { console.log(`没有匹配的场景：${only.join(' ')}`); process.exit(1); }

// 端口：设了 E2E_PORT 就严格用它；没设就向系统要一个空闲端口，避免和本机其它预览冲突
async function freePort() {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const srv = createServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

let base = process.env.BASE;
let server;
if (!base) {
  const PORT = process.env.E2E_PORT ? Number(process.env.E2E_PORT) : await freePort();
  execSync('npx vite build --mode e2e --outDir dist-e2e', { cwd: root, stdio: 'ignore' });
  server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  base = `http://localhost:${PORT}/`;
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(base); if (r.ok) break; } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
}

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome' });
let failed = 0;
for (const sc of list) {
  const t0 = Date.now();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const ctx = {
    page,
    base,
    async open(query = '') {
      await page.goto(base + query);
      await page.waitForFunction(() => window.__game?.ready);
      await page.waitForTimeout(200);
    },
    shot: (name) => page.screenshot({ path: `${SHOTS}${sc.name}-${name}.png` }),
    state: () => page.evaluate(() => structuredClone(window.__game.game.state)),
    // 点逻辑坐标（390×844），换算到画布实际位置
    async tap(x, y) {
      const box = await page.locator('#game').boundingBox();
      await page.mouse.click(box.x + (x / 390) * box.width, box.y + (y / 844) * box.height);
      await page.waitForTimeout(60);
    },
    // 划线：逻辑坐标从 from 到 to，按下、分 steps 步移动、抬起
    async swipe(from, to, steps = 8) {
      const box = await page.locator('#game').boundingBox();
      const px = (pt) => [box.x + (pt.x / 390) * box.width, box.y + (pt.y / 844) * box.height];
      await page.mouse.move(...px(from));
      await page.mouse.down();
      await page.mouse.move(...px(to), { steps });
      await page.mouse.up();
      await page.waitForTimeout(60);
    },
    assert(cond, msg) { if (!cond) throw new Error(msg); },
  };
  // 项目自己的辅助函数放在 tests/e2e/helpers.mjs（项目所有，模板升级不覆盖）：export function extend(ctx) { return { … } }
  if (extend) Object.assign(ctx, extend(ctx));
  try {
    await sc.run(ctx);
    if (errors.length) throw new Error(`页面错误：${errors.join(' | ')}`);
    console.log(`ok   ${sc.name} (${Date.now() - t0} ms)`);
  } catch (e) {
    failed++;
    await ctx.shot('FAIL').catch(() => {});
    console.log(`FAIL ${sc.name}: ${e.message}`);
  }
  await page.close();
}
await browser.close();
server?.kill();
console.log(`\n${list.length - failed}/${list.length} 通过，截图在 tests/shots/`);
process.exit(failed ? 1 : 0);
