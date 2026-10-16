// 里程碑收尾判定（tools/milestone-close.mjs）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { closesIn, shouldClose } from '../../tools/milestone-close.mjs';

test('从正文取关闭的 issue：Closes / Fixes / Resolves，去重', () => {
  assert.deepEqual(closesIn('Closes #3\n\n也 fixes #4，还是 closes #3'), [3, 4]);
  assert.deepEqual(closesIn('Refs #9'), []);
});

test('只剩这个 PR 正在关的 issue → 关；还有别的 open issue → 不关；已关闭的里程碑不动', () => {
  assert.equal(shouldClose({ state: 'open', open_issues: 1 }, 1), true, 'GitHub 还没关掉这个 PR 的 issue 时');
  assert.equal(shouldClose({ state: 'open', open_issues: 0 }, 0), true, 'GitHub 已经关掉了');
  assert.equal(shouldClose({ state: 'open', open_issues: 2 }, 1), false);
  assert.equal(shouldClose({ state: 'closed', open_issues: 0 }, 0), false);
  assert.equal(shouldClose(null, 0), false);
});
