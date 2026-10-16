// 数值表与《游戏方向》§4 逐项一致：文档是基准，src/data/tuning.js 跟随。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TUNING } from '../../src/data/tuning.js';

const doc = fs.readFileSync(new URL('../../docs/01-设计/01-游戏方向.md', import.meta.url), 'utf8');
const section = doc.split(/^## /m).find((s) => s.startsWith('4. ')) ?? '';
const rows = section.split('\n').filter((l) => /^\| `/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));

test('《游戏方向》§4 有数值表', () => assert.ok(rows.length > 0, '§4 应有“键 | 值 | 说明”表格，键用反引号'));

test('TUNING 与《游戏方向》§4 键集合一致', () => {
  assert.deepEqual(Object.keys(TUNING).sort(), rows.map((r) => r[0].replaceAll('`', '')).sort());
});

test('TUNING 每项取值与《游戏方向》§4 一致', () => {
  for (const [key, value] of rows) {
    const k = key.replaceAll('`', '');
    assert.equal(String(TUNING[k]), value, `${k}：文档 ${value}，代码 ${TUNING[k]}`);
  }
});
