// agent 成本记录：解析、汇总、评论标记往返、合并去重（tools/agent-cost.mjs）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMessages, summarize, newAssets, costComment, fromComments, mergeCosts, reworkRound, assetCalls } from '../../tools/agent-cost.mjs';
import { overBudget } from '../../tools/agent-gate.mjs';

const result = { type: 'result', total_cost_usd: 0.73456, num_turns: 21, is_error: false, modelUsage: { 'claude-opus-5-5': { inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 30, cacheCreationInputTokens: 40, costUSD: 0.73456 } } };

test('execution_file：数组 JSON 与 JSONL 都能读', () => {
  assert.equal(parseMessages(JSON.stringify([{ type: 'system' }, result])).length, 2);
  assert.equal(parseMessages(`${JSON.stringify({ type: 'system' })}\n${JSON.stringify(result)}\n`).length, 2);
  assert.deepEqual(parseMessages(''), []);
});

test('汇总：费用、轮次、按模型的 token；没有 result 记为出错', () => {
  const r = summarize([result], { issue: 9, milestone: '迭代 1', mode: 'do', runId: 1, at: 'x' });
  assert.equal(r.costUsd, 0.7346);
  assert.equal(r.turns, 21);
  assert.equal(r.error, false);
  assert.deepEqual(r.models['claude-opus-5-5'], { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, costUsd: 0.73456 });
  assert.equal(summarize([]).error, true);
});

test('新增生成资产：只数“生成”来源的新行，按扩展名分图片和模型', () => {
  const head = '## 登记表\n\n| 文件 | 用途 | 来源 | 模型 | 提示词或参考 | 任务 ID | 日期 |\n|---|---|---|---|---|---|---|\n';
  const old = '| `public/a.png` | x | 生成 | gpt-image | p | - | 2026-10-16 |\n';
  const after = head + old + '| `public/b.webp` | x | 生成 | gpt-image | p | - | 2026-10-16 |\n| `public/m.glb` | x | 生成 | Tripo P2.0 | p | t1 | 2026-10-16 |\n| `public/c.png` | x | 手绘 | - | 我 | - | 2026-10-16 |\n';
  assert.deepEqual(newAssets(head + old, after), { images: 1, models: 1 });
});

test('评论标记往返，与 costs.jsonl 合并时按 runId 去重，预算按合并结果算', () => {
  const rec = summarize([result], { issue: 9, milestone: '迭代 1', mode: 'do', runId: 42, at: 'x' });
  const body = costComment(rec, 'https://x/run');
  assert.match(body, /费用约 \$0\.73，21 轮，完成/);
  const parsed = fromComments([body, '无关评论', '<!-- game-studio:cost {坏的} -->']);
  assert.deepEqual(parsed, [rec]);
  const merged = mergeCosts([rec], parsed, [{ ...rec, runId: 43, costUsd: 3 }]);
  assert.equal(merged.length, 2);
  assert.deepEqual(overBudget({ milestones: { '迭代 1': 3.5 } }, merged, '迭代 1'), { cap: 3.5, spent: 3.7346 });
});

test('返工轮次：同一 PR 上已有的返工记录数加一，并写进评论', () => {
  const recs = [{ mode: 'do', issue: 15 }, { mode: 'rework', issue: 16 }, { mode: 'rework', issue: 16 }, { mode: 'rework', issue: 17 }];
  assert.equal(reworkRound(recs, 16), 3);
  assert.equal(reworkRound([], 16), 1);
  const rec = summarize([result], { mode: 'rework', issue: 16, round: 2, runId: 1, at: 'x' });
  assert.match(costComment(rec, 'u'), /agent（rework 第 2 轮）/);
});

test('资产调用次数：读调用日志，分图像与三维，失败单独计；评论里写出次数与登记数', () => {
  const log = ['{"kind":"image","ok":true}', '{"kind":"image","ok":false,"code":"http"}', '{"kind":"model","ok":true}', '坏行'].join('\n');
  const calls = assetCalls(log);
  assert.deepEqual(calls, { images: 2, models: 1, failed: 1 });
  const rec = summarize([result], { mode: 'do', calls, assets: { images: 1, models: 1 }, runId: 1, at: 'x' });
  assert.match(costComment(rec, 'u'), /出图 2 次、出模 1 次（失败 1），登记新资产 2 个/);
  assert.doesNotMatch(costComment(summarize([result], { mode: 'do' }), 'u'), /出图/);
});
