// agent 工作流派发前检查：命令解析、依赖、权限、预算（tools/agent-gate.mjs）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, dependenciesOf, overBudget, decide, GO_LABEL } from '../../tools/agent-gate.mjs';

test('解析 /agent 命令', () => {
  assert.deepEqual(parseCommand('/agent 再改改：刀线再粗一点'), { mode: 'rework', instruction: '刀线再粗一点' });
  assert.deepEqual(parseCommand('/agent 刀线再粗一点'), { mode: 'rework', instruction: '刀线再粗一点' });
  assert.deepEqual(parseCommand('/agent 拆 issue: 加一个连击'), { mode: 'plan', instruction: '加一个连击' });
  assert.deepEqual(parseCommand('/agent 确认'), { mode: 'confirm', instruction: '' });
  assert.equal(parseCommand('看起来不错 /agent'), null);
  assert.equal(parseCommand('/agentx 做'), null);
});

test('依赖只取“## 依赖”一节的编号', () => {
  const body = '## 背景\n\n见 #9\n\n## 依赖\n\n#1、#2，以及 #2\n\n## 参考\n\n#30';
  assert.deepEqual(dependenciesOf(body), [1, 2]);
  assert.deepEqual(dependenciesOf('## 背景\n\n#5'), []);
});

test('预算：按里程碑累计，达到上限才拦', () => {
  const budget = { perRun: 5, milestones: { '迭代 2': 3 } };
  const costs = [{ milestone: '迭代 2', costUsd: 1.5 }, { milestone: '迭代 2', costUsd: 1.5 }, { milestone: '迭代 1', costUsd: 9 }];
  assert.deepEqual(overBudget(budget, costs, '迭代 2'), { cap: 3, spent: 3 });
  assert.equal(overBudget(budget, costs.slice(1), '迭代 2'), null);
  assert.equal(overBudget(budget, costs, '迭代 1'), null, '没设上限的里程碑不拦');
  assert.equal(overBudget(null, costs, '迭代 2'), null);
});

test('事件判定：标签、权限、issue 与 PR 的命令范围', () => {
  const issue = { number: 3, body: '' };
  assert.deepEqual(decide({ action: 'labeled', label: { name: GO_LABEL }, issue }, 'issues'), { mode: 'do', target: 3, instruction: '' });
  assert.ok(decide({ action: 'labeled', label: { name: '类型:功能' }, issue }, 'issues').skip);
  const comment = (body, assoc = 'OWNER', pr = false) => ({ action: 'created', comment: { body, author_association: assoc }, issue: { number: 7, ...(pr ? { pull_request: {} } : {}) } });
  assert.equal(decide(comment('/agent 再改改：快一点', 'OWNER', true), 'issue_comment').mode, 'rework');
  assert.match(decide(comment('/agent 再改改：快一点', 'NONE', true), 'issue_comment').skip, /写权限/);
  assert.match(decide(comment('/agent 再改改：快一点', 'CONTRIBUTOR', true), 'issue_comment').skip, /写权限/);
  assert.match(decide(comment('/agent 再改改：快一点'), 'issue_comment').skip, /只在 PR/);
  assert.equal(decide(comment('/agent 拆 issue：连击'), 'issue_comment').mode, 'plan');
  assert.match(decide(comment('/agent 确认', 'MEMBER', true), 'issue_comment').skip, /PR 下只支持/);
});
