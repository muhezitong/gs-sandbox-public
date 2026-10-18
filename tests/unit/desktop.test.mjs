// 桌面客户端：加固规则（启用后）与 package.json 改动（tools/desktop.mjs）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, patchPackage, enabled } from '../../tools/desktop.mjs';

test('package.json：补 main、脚本、依赖与打包配置，不覆盖已有的', () => {
  const p = patchPackage({ name: 'crate-run', description: '收集木箱', scripts: { build: 'vite build', app: '自定义' }, devDependencies: { vite: '7' } });
  assert.equal(p.main, 'electron/main.cjs');
  assert.equal(p.scripts.app, '自定义');
  assert.match(p.scripts['dist:mac'], /electron-builder --mac/);
  assert.ok(p.devDependencies.electron && p.devDependencies['electron-builder']);
  assert.deepEqual(p.build.files, ['dist/**', 'electron/**', 'package.json']);
  assert.equal(p.build.productName, '收集木箱');
});

test('加固规则：只放行 dist/ 内的本地文件、白名单外链、拦截刷新与开发者工具', { skip: !enabled() && '未启用桌面客户端' }, () => {
  const require = createRequire(import.meta.url);
  const g = require(join(ROOT, 'electron/guard.cjs'));
  const dist = join(ROOT, 'dist');
  assert.equal(g.isAllowedNavigation(`file://${dist}/index.html?seed=1`, dist), true);
  assert.equal(g.isAllowedNavigation(`file://${ROOT}/package.json`, dist), false);
  assert.equal(g.isAllowedNavigation('https://example.com/', dist), false);
  assert.equal(g.isAllowedExternal('https://example.com/'), false);
  assert.equal(g.isAllowedExternal('https://example.com/a', ['https://example.com']), true);
  assert.equal(g.isBlockedShortcut({ code: 'KeyR', meta: true }), true);
  assert.equal(g.isBlockedShortcut({ code: 'KeyR' }), false, '不带修饰键的 R 是游戏按键');
  assert.equal(g.isBlockedShortcut({ code: 'F12' }), true);
  assert.equal(g.isBlockedShortcut({ code: 'F11' }), false);
  assert.ok(existsSync(join(ROOT, '.github/workflows/release.yml')));
});
