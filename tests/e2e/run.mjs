// e2e：Playwright + Chrome 自动试玩并截图到 tests/shots/。
// 默认先 vite build --mode e2e 再 vite preview 测构建产物；BASE=http://... 则连已有服务器。
// 用法：npm run e2e [场景名...] [--workers=N] [--serial]；E2E_CHANNEL=chromium 用 Playwright 自带浏览器
// 场景文件 tests/e2e/scenarios.mjs 可导出 VIEWPORT、DESIGN（逻辑坐标尺寸）、LAUNCH_ARGS；带 perf 标签的场景在最后串行跑。
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as S from './scenarios.mjs';

const helpers = new URL('./helpers.mjs', import.meta.url);
const { extend } = existsSync(fileURLToPath(helpers)) ? await import(helpers) : {};

const root = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = root + 'tests/shots/';
const VIEWPORT = S.VIEWPORT ?? { width: 390, height: 844, deviceScaleFactor: 2 };
const DESIGN = S.DESIGN ?? { width: 390, height: 844 };
const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('--'));
const list = only.length ? S.SCENARIOS.filter((s) => only.includes(s.name)) : S.SCENARIOS;
if (!list.length) { console.log(`没有匹配的场景：${only.join(' ')}`); process.exit(1); }
const workersArg = args.find((a) => a.startsWith('--workers='));
const WORKERS = args.includes('--serial') ? 1 : Math.max(1, Number(workersArg?.split('=')[1] ?? Math.min(3, Math.floor(cpus().length / 2))));

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

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome', args: S.LAUNCH_ARGS ?? [] });

async function runOne(sc) {
  const t0 = Date.now();
  const { deviceScaleFactor = 1, ...size } = sc.viewport ?? VIEWPORT;
  const page = await browser.newPage({ viewport: size, deviceScaleFactor });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const toPx = async (pt) => {
    const box = await page.locator('#game').boundingBox();
    return [box.x + (pt.x / DESIGN.width) * box.width, box.y + (pt.y / DESIGN.height) * box.height];
  };
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
    // 点逻辑坐标（DESIGN 尺寸），换算到画布实际位置
    async tap(x, y) {
      await page.mouse.click(...(await toPx({ x, y })));
      await page.waitForTimeout(60);
    },
    // 划线：逻辑坐标从 from 到 to，按下、分 steps 步移动、抬起
    async swipe(from, to, steps = 8) {
      await page.mouse.move(...(await toPx(from)));
      await page.mouse.down();
      await page.mouse.move(...(await toPx(to)), { steps });
      await page.mouse.up();
      await page.waitForTimeout(60);
    },
    // 按住一个键 ms 毫秒（键名同 KeyboardEvent.code，如 KeyW、ArrowLeft）
    async hold(code, ms) {
      await page.keyboard.down(code);
      await page.waitForTimeout(ms);
      await page.keyboard.up(code);
    },
    assert(cond, msg) { if (!cond) throw new Error(msg); },
  };
  // 项目自己的辅助函数放在 tests/e2e/helpers.mjs（项目所有，模板升级不覆盖）：export function extend(ctx) { return { … } }
  if (extend) Object.assign(ctx, extend(ctx));
  let ok = true;
  try {
    await sc.run(ctx);
    if (errors.length) throw new Error(`页面错误：${errors.join(' | ')}`);
    console.log(`ok   ${sc.name} (${Date.now() - t0} ms)`);
  } catch (e) {
    ok = false;
    await ctx.shot('FAIL').catch(() => {});
    console.log(`FAIL ${sc.name}: ${e.message}`);
  }
  await page.close();
  return ok;
}

// 非 perf 场景分给 WORKERS 个并发；perf 场景对机器负载敏感，最后一个一个跑
const isPerf = (s) => (s.tags ?? []).includes('perf');
const queue = list.filter((s) => !isPerf(s));
const results = [];
await Promise.all(Array.from({ length: Math.min(WORKERS, queue.length) }, async () => {
  while (queue.length) results.push(await runOne(queue.shift()));
}));
for (const sc of list.filter(isPerf)) results.push(await runOne(sc));

await browser.close();
server?.kill();
const failed = results.filter((r) => !r).length;
console.log(`\n${list.length - failed}/${list.length} 通过（${WORKERS} 个并发），截图在 tests/shots/`);
process.exit(failed ? 1 : 0);
