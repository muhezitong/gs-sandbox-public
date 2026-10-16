// 标签与里程碑从 CLAUDE.md、《迭代计划》解析：文档是唯一来源。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { areasFrom, milestonesFrom, labels, prunable, DEFAULT_LABELS } from '../../tools/setup-github.mjs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('区域标签取自 CLAUDE.md', () => {
  const areas = areasFrom(read('CLAUDE.md'));
  assert.ok(areas.length > 0);
  const all = labels(areas).map((l) => l[0]);
  assert.equal(all.filter((n) => n.startsWith('类型:')).length, 6);
  assert.equal(all.filter((n) => n.startsWith('优先级:')).length, 3);
  for (const a of areas) assert.ok(all.includes(`区域:${a}`));
});

test('里程碑取自《迭代计划》§1，至少一个且状态合法', () => {
  const ms = milestonesFrom(read('docs/03-计划/01-迭代计划.md'));
  assert.ok(ms.length > 0, '《迭代计划》§1 应至少有一个里程碑');
  for (const m of ms) {
    assert.match(m.name, /^迭代 /);
    assert.ok(['未开始', '进行中', '已完成'].includes(m.status), `${m.name} 状态 ${m.status}`);
  }
});

test('只删没在用的 GitHub 默认标签，不动项目标签和自定义标签', () => {
  const project = labels(['玩法']).map((l) => l[0]);
  const have = ['bug', 'enhancement', 'wontfix', '类型:功能', '区域:玩法', '自定义'];
  assert.deepEqual(prunable(have, ['bug'], project), ['enhancement', 'wontfix']);
  assert.ok(DEFAULT_LABELS.includes('good first issue'));
});
