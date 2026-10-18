// 发到 GitHub 的文字（tools/wording.mjs）：拦截、费用、试玩评论对玩家可见的部分不含禁用词；标记可读回。
import test from 'node:test';
import assert from 'node:assert/strict';
import { bannedIn, visibleText, readMarkers, marker } from '../../tools/wording.mjs';
import { blockedComment } from '../../tools/agent-gate.mjs';
import { costComment, summarize } from '../../tools/agent-cost.mjs';
import { commentBody } from '../../tools/preview.mjs';

test('禁用词按整词匹配；隐藏标记、详情、代码不算可见文字', () => {
  assert.deepEqual(bannedIn('做完了：CI'), ['CI']);
  assert.deepEqual(bannedIn('PRIDE 与 issues'), []);
  assert.equal(visibleText('看 `budget.json` <!-- x PR --> <details>CI</details> [链接](https://a/pull/1)').includes('budget.json'), false);
  assert.deepEqual(readMarkers(`a ${marker('blocked', { kind: 'budget' })} b`, 'blocked'), [{ kind: 'budget' }]);
});

test('拦截评论：白话原因 + 带类型的隐藏标记；技术细节在详情里', () => {
  const b = blockedComment('budget', { milestone: '迭代 2', spent: 19.8, cap: 20 });
  assert.match(b, /🛑 还不能开始：「迭代 2」这个迭代已经花了 \$19\.80，到了预算上限 \$20/);
  assert.deepEqual(readMarkers(b, 'blocked')[0], { kind: 'budget', milestone: '迭代 2', spent: 19.8, cap: 20 });
  assert.match(b, /<details>[\s\S]*budget\.json[\s\S]*<\/details>/);
  const d = blockedComment('deps', { deps: [3, 5], milestone: '迭代 2' });
  assert.match(d, /要先做完 #3、#5/);
  assert.equal(readMarkers(d, 'blocked')[0].kind, 'deps');
});

test('拦截、费用、试玩评论对玩家可见的部分不含禁用词', () => {
  const rec = summarize([{ type: 'result', total_cost_usd: 1.5, num_turns: 12 }], { mode: 'rework', round: 2, calls: { images: 1, models: 0, failed: 0 }, assets: { images: 1, models: 0 } });
  const samples = [
    blockedComment('budget', { milestone: '迭代 2', spent: 19.8, cap: 20 }),
    blockedComment('deps', { deps: [3], milestone: null }),
    costComment(rec, 'https://x/run'),
    costComment(summarize([], { mode: 'do' }), 'https://x/run'),
    commentBody({ tier: 'artifact', url: null, sha: 'abcdef1', runUrl: 'r', repo: 'o/r', assets: ['public/a.png'] }),
    commentBody({ tier: 'pages', url: 'https://o.github.io/r/pr-1/', sha: 'abcdef1', runUrl: 'r', repo: 'o/r', shots: [{ name: 'title', url: 'x' }], before: [{ name: 'title', url: 'y' }], lorebook: true }),
  ];
  for (const s of samples) assert.deepEqual(bannedIn(visibleText(s)), [], s);
});
