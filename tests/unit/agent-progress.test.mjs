// agent 阶段进度（tools/agent-progress.mjs）：阶段推进、结束汇总、评论带隐藏标记、对外文字是白话。
import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, finish, progressBody, STAGES, PROGRESS } from '../../tools/agent-progress.mjs';
import { readMarkers, bannedIn, visibleText } from '../../tools/wording.mjs';

const start = { runId: 9, mode: 'do', target: 4, startedAt: '2026-10-19T00:00:00Z', stages: [] };

test('阶段推进：当前阶段打转，之前的打勾；没出资产就不列', () => {
  let s = advance(start, 'read', '读需求', 't1');
  s = advance(s, 'code', '给得分加上连击倍率', 't2');
  const body = progressBody(s, 'https://x/run');
  assert.match(body, /⏳ agent 正在做任务/);
  assert.match(body, /✅ 读需求：读需求/);
  assert.match(body, /🔄 写代码：给得分加上连击倍率/);
  assert.match(body, /◻️ 跑测试/);
  assert.doesNotMatch(body, /出资产/);
  assert.throws(() => advance(s, 'deploy'), /未知阶段/);
  assert.equal(STAGES.length, 6);
});

test('结束：汇总轮次与费用；隐藏标记能读回状态', () => {
  const s = finish(advance(start, 'pr', '提交改动'), { costUsd: 1.234, turns: 17 }, 't9');
  const body = progressBody(s, 'u');
  assert.match(body, /✅ agent 做完了/);
  assert.match(body, /用了 17 轮，约 \$1\.23/);
  const [m] = readMarkers(body, PROGRESS);
  assert.equal(m.runId, 9);
  assert.equal(m.done, true);
  assert.equal(m.ok, true);
  assert.match(progressBody(finish(start, { error: true }), 'u'), /没做成/);
});

test('对外文字不含禁用词（详情与标记除外）', () => {
  let s = start;
  for (const [k] of STAGES) s = advance(s, k, '');
  for (const st of [start, s, finish(s, { costUsd: 1, turns: 2 }), finish(s, { error: true })]) {
    assert.deepEqual(bannedIn(visibleText(progressBody(st, 'https://x/run'))), []);
  }
});
