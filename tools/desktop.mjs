// 桌面客户端（可选能力，来源《城市吞噬者》electron/ 精简）：Electron 加载 dist/，加固导航、外链与快捷键。
// node tools/desktop.mjs enable   写 electron/、改 package.json（main、脚本、依赖、打包配置）、加发布工作流、打开开关
// 启用后：npm install → npm run app（本地启动）、npm run dist:mac / dist:win（打包到 release/）、node tools/smoke-desktop.mjs
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const ELECTRON = '44.5.1';
export const BUILDER = '26.15.3';

export const FILES = {
  'electron/guard.cjs': `// 发布版加固：导航、外链与快捷键的判断规则。纯函数，不依赖 Electron，单测直接导入。
const path = require('node:path');
const { fileURLToPath } = require('node:url');

// 游戏默认不打开任何外部网页；要加（官网、反馈页）只在这里登记完整的 https origin
const EXTERNAL_ALLOW = [];

// 只允许 dist/ 目录内的本地文件
function isAllowedNavigation(url, distDir) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'file:') return false;
  let p;
  try { p = path.resolve(fileURLToPath(u)); } catch { return false; }
  const root = path.resolve(distDir);
  return p === root || p.startsWith(root + path.sep);
}

function isAllowedExternal(url, allow = EXTERNAL_ALLOW) {
  let u;
  try { u = new URL(url); } catch { return false; }
  return u.protocol === 'https:' && allow.includes(u.origin);
}

// 发布版拦截：刷新、强制刷新、开发者工具；F11 全屏与游戏按键不受影响
const BLOCKED = [
  (i) => i.code === 'KeyR' && (i.control || i.meta),
  (i) => i.code === 'F5',
  (i) => i.code === 'F12',
  (i) => ['KeyI', 'KeyJ', 'KeyC'].includes(i.code) && ((i.control && i.shift) || (i.meta && i.alt)),
];
const isBlockedShortcut = (input) => BLOCKED.some((f) => f(input));

module.exports = { isAllowedNavigation, isAllowedExternal, isBlockedShortcut, EXTERNAL_ALLOW };
`,
  'electron/preload.cjs': `// 只暴露客户端需要的最小接口
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  quit: () => ipcRenderer.send('app:quit'),
  toggleFullscreen: () => ipcRenderer.send('app:toggle-fullscreen'),
});
`,
  'electron/main.cjs': `// Electron 主进程：加载 dist/ 里的构建产物，提供全屏与退出。游戏只读本地文件。
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const { isAllowedNavigation, isAllowedExternal, isBlockedShortcut } = require('./guard.cjs');
const pkg = require('../package.json');

const DIST = path.join(__dirname, '..', 'dist');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 960,
    minHeight: 560,
    title: pkg.description || pkg.name,
    backgroundColor: '#101317',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
      backgroundThrottling: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(DIST, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!isAllowedNavigation(url, DIST)) e.preventDefault(); });
  win.webContents.on('will-redirect', (e, url) => { if (!isAllowedNavigation(url, DIST)) e.preventDefault(); });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); return; }
    if (app.isPackaged && isBlockedShortcut(input)) e.preventDefault();
  });
  return win;
}

ipcMain.on('app:quit', () => app.quit());
ipcMain.on('app:toggle-fullscreen', (e) => { const w = BrowserWindow.fromWebContents(e.sender); w?.setFullScreen(!w.isFullScreen()); });
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
`,
  'tools/smoke-desktop.mjs': `// 桌面客户端冒烟：启动 Electron（开发态 electron . 或打包后的可执行文件），检查窗口标题、游戏就绪、
// 打包版关闭调试接口、拦截外部导航。任一失败退出码非 0。
//   node tools/smoke-desktop.mjs                  开发态（先 npm run build）
//   node tools/smoke-desktop.mjs <.app | exe>     打包后的客户端
import { _electron as electron } from 'playwright';
import { existsSync, readdirSync, statSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const target = process.argv[2];
function exePath(p) {
  const abs = resolve(p);
  if (abs.endsWith('.app')) { const d = join(abs, 'Contents/MacOS'); return join(d, readdirSync(d)[0]); }
  if (statSync(abs).isDirectory()) return join(abs, readdirSync(abs).find((f) => /\\.exe$/i.test(f) && !/^uninstall/i.test(f)));
  return abs;
}
if (!target && !existsSync('dist/index.html')) { console.error('先 npm run build'); process.exit(1); }
// 开发态：用本项目 node_modules 里的 electron（不依赖 playwright 装在哪）
const { createRequire } = await import('node:module');
const devExe = () => createRequire(resolve('package.json'))('electron');
const opts = target ? { executablePath: exePath(target), args: [] } : { executablePath: devExe(), args: ['.'] };
opts.args.push(\`--user-data-dir=\${mkdtempSync(join(tmpdir(), 'gs-desktop-'))}\`);
const failures = [];
const check = (ok, msg) => { console.log(\`\${ok ? 'ok  ' : 'FAIL'} \${msg}\`); if (!ok) failures.push(msg); };

const app = await electron.launch(opts);
try {
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(1500);
  const pkgName = await app.evaluate(({ app }) => app.getName());
  check(!!pkgName, \`应用名：\${pkgName}\`);
  check((await win.title()).length > 0, \`窗口标题：\${await win.title()}\`);
  check(await win.evaluate(() => !!window.desktop?.isDesktop), 'preload 暴露了 window.desktop');
  const packaged = await app.evaluate(({ app }) => app.isPackaged);
  const hasDebug = await win.evaluate(() => !!window.__game);
  check(packaged ? !hasDebug : true, packaged ? '打包版没有调试接口 window.__game' : '开发态（未检查调试接口）');
  await win.evaluate(() => { location.href = 'https://example.com/'; });
  await win.waitForTimeout(500);
  check(win.url().startsWith('file:'), \`外部导航被拦截（当前 \${win.url().slice(0, 40)}）\`);
  mkdirSync('tests/shots', { recursive: true });
  await win.screenshot({ path: 'tests/shots/desktop.png' });
} finally {
  await app.close();
}
if (failures.length) { console.error(\`\\n\${failures.length} 项失败\`); process.exit(1); }
console.log('\\n桌面客户端冒烟通过，截图 tests/shots/desktop.png');
`,
  '.github/workflows/release.yml': `# 发布：推 v<版本> 标签 → 测试 → 打 mac / win 安装包 → 上传到草稿 Release（确认后手动发布）。
# 标签与 package.json 版本不一致时失败。
name: release

on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: test "v$(node -p "require('./package.json').version")" = "$GITHUB_REF_NAME"
      - run: npm ci
      - run: npm test
      - run: gh release view "$GITHUB_REF_NAME" >/dev/null 2>&1 || gh release create "$GITHUB_REF_NAME" --draft --title "$GITHUB_REF_NAME" --notes "待补充发布说明"
        env:
          GH_TOKEN: \${{ github.token }}

  build:
    needs: check
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: --mac
          - os: windows-latest
            target: --win
    runs-on: \${{ matrix.os }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npx electron-builder \${{ matrix.target }} --publish never
      - shell: bash
        run: for f in release/*.dmg release/*.zip release/*.exe; do [ -f "$f" ] && gh release upload "$GITHUB_REF_NAME" "$f" --clobber; done; true
        env:
          GH_TOKEN: \${{ github.token }}
`,
};

export function enabled(root = ROOT) {
  const f = join(root, '.game-studio.json');
  return existsSync(f) && JSON.parse(readFileSync(f, 'utf8')).features?.desktop === true;
}

// package.json 改动：main、脚本、依赖、打包配置；已有的不覆盖
export function patchPackage(pkg) {
  const appId = `com.game-studio.${pkg.name}`.replace(/[^a-zA-Z0-9.-]/g, '-');
  return {
    ...pkg,
    main: pkg.main ?? 'electron/main.cjs',
    scripts: {
      ...pkg.scripts,
      app: pkg.scripts?.app ?? 'vite build && electron .',
      'dist:mac': pkg.scripts?.['dist:mac'] ?? 'vite build && electron-builder --mac --publish never',
      'dist:win': pkg.scripts?.['dist:win'] ?? 'vite build && electron-builder --win --publish never',
      'smoke:desktop': pkg.scripts?.['smoke:desktop'] ?? 'node tools/smoke-desktop.mjs',
    },
    devDependencies: { ...pkg.devDependencies, electron: pkg.devDependencies?.electron ?? ELECTRON, 'electron-builder': pkg.devDependencies?.['electron-builder'] ?? BUILDER },
    build: pkg.build ?? {
      appId,
      productName: pkg.description || pkg.name,
      artifactName: `${pkg.name}-\${version}-\${os}-\${arch}.\${ext}`,
      directories: { output: 'release' },
      files: ['dist/**', 'electron/**', 'package.json'],
      asar: true,
      mac: { target: ['dmg', 'zip'], category: 'public.app-category.games' },
      win: { target: ['nsis'] },
    },
  };
}

export function enable(root = ROOT) {
  if (enabled(root)) return { created: [] };
  const created = [];
  for (const [rel, text] of Object.entries(FILES)) {
    const p = join(root, rel);
    if (existsSync(p)) continue;
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, text);
    created.push(rel);
  }
  const pkgFile = join(root, 'package.json');
  writeFileSync(pkgFile, JSON.stringify(patchPackage(JSON.parse(readFileSync(pkgFile, 'utf8'))), null, 2) + '\n');
  const gi = join(root, '.gitignore');
  const giText = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
  if (!giText.split('\n').includes('release/')) writeFileSync(gi, giText.trimEnd() + '\nrelease/\n');
  const cfg = join(root, '.game-studio.json');
  const meta = existsSync(cfg) ? JSON.parse(readFileSync(cfg, 'utf8')) : {};
  writeFileSync(cfg, JSON.stringify({ ...meta, features: { ...meta.features, desktop: true } }, null, 2) + '\n');
  return { created };
}

const isMain = (url) => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url)); } catch { return false; } };
if (isMain(import.meta.url)) {
  if (process.argv[2] !== 'enable') { console.error('用法：node tools/desktop.mjs enable'); process.exit(1); }
  const r = enable();
  console.log(r.created.length ? `已启用桌面客户端：${r.created.join('、')}；接着 npm install，然后 npm run app` : '桌面客户端已启用');
}
