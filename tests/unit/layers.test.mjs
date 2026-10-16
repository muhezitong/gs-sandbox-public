// 分层约束：src/core/ 与 src/data/ 是纯规则与数据，不能依赖画布、DOM 或平台 API（CLAUDE.md 平台与技术栈）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
const FORBIDDEN = /\b(document|window|wx|localStorage|requestAnimationFrame|getContext|HTMLCanvasElement|Math\.random)\b/;

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

for (const layer of ['core', 'data']) {
  for (const file of walk(join(SRC, layer))) {
    test(`分层：${layer}/${file.split(`/${layer}/`)[1]} 不依赖平台`, () => {
      const code = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const m = code.match(FORBIDDEN);
      assert.equal(m, null, `发现平台依赖：${m?.[0]}`);
      for (const imp of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        assert.ok(!/\/(render|platform)\//.test(imp[1]), `不能从 ${layer} 引用 ${imp[1]}`);
      }
    });
  }
}

test('分层：src/core 与 src/data 目录存在', () => {
  assert.ok(existsSync(join(SRC, 'core')));
  assert.ok(existsSync(join(SRC, 'data')));
});
