// 资产来源登记：public/ 与 assets/ 下每个资产文件都在 assets/README.md 登记，登记项字段齐全（《游戏方向》§6）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EXT = /\.(png|jpe?g|webp|gif|avif|svg|glb|gltf|fbx|obj|mp3|ogg|wav|m4a|mp4|webm)$/i;
const SOURCES = ['生成', '手绘', '外部授权'];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = ['public', 'assets'].flatMap((d) => walk(join(ROOT, d))).filter((p) => EXT.test(p)).map((p) => relative(ROOT, p));
const table = readFileSync(join(ROOT, 'assets/README.md'), 'utf8').split('## 登记表')[1] ?? '';
const rows = table.split('\n').filter((l) => /^\| `/.test(l)).map((l) => {
  const [file, use, source, model, prompt, task, date] = l.split('|').slice(1, -1).map((c) => c.trim());
  return { file: file.replaceAll('`', ''), use, source, model, prompt, task, date };
});

test('assets/README.md 有“登记表”一节', () => assert.ok(table, '缺少 ## 登记表'));

test('每个资产文件都已登记', () => {
  const missing = files.filter((f) => !rows.some((r) => r.file === f));
  assert.deepEqual(missing, [], `未登记：${missing.join('、')}`);
});

test('登记的文件都存在，且不重复', () => {
  for (const r of rows) assert.ok(existsSync(join(ROOT, r.file)), `登记了不存在的文件：${r.file}`);
  const dup = rows.map((r) => r.file).filter((f, i, a) => a.indexOf(f) !== i);
  assert.deepEqual(dup, [], `重复登记：${dup.join('、')}`);
});

test('登记字段齐全：来源合法、生成类有模型与提示词、日期格式', () => {
  for (const r of rows) {
    assert.ok(r.use && r.use !== '-', `${r.file} 缺用途`);
    assert.ok(SOURCES.includes(r.source), `${r.file} 来源应为 ${SOURCES.join('/')}，实际 ${r.source}`);
    assert.ok(r.prompt && r.prompt !== '-', `${r.file} 缺提示词或参考`);
    if (r.source === '生成') assert.ok(r.model && r.model !== '-', `${r.file} 来源为生成，缺模型`);
    assert.match(r.date ?? '', /^\d{4}-\d{2}-\d{2}$/, `${r.file} 日期格式`);
  }
});
