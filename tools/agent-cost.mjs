// agent 运行的成本记录（《系统架构》§4.4）：从 claude-code-action 的 execution_file 取 result 条目。
// node tools/agent-cost.mjs <execution_file> → 打印一行 JSON 记录；费用是运行端按价格表估算，不是账单。
// 记录同时写进 issue 评论的隐藏标记（未合并的运行也能被预算检查看到）与 agent 分支的 .game-studio/costs.jsonl。
import { readFileSync, existsSync } from 'node:fs';
import { details, MODE_TEXT } from './wording.mjs';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
// 是否被直接运行：比较真实路径（macOS 上 /var 是 /private/var 的符号链接，直接比字符串会误判）
const isMain = (url) => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url)); } catch { return false; } };

export const COST_MARK = 'game-studio:cost';

// execution_file 可能是消息数组 JSON，也可能是每行一条的 JSONL
export function parseMessages(text) {
  const t = text.trim();
  if (!t) return [];
  if (t.startsWith('[')) return JSON.parse(t);
  return t.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// 资产登记表的行数（用来算本次新增了几个生成资产）
export const assetRows = (readme) => (readme ?? '').split('## 登记表')[1]?.split('\n').filter((l) => /^\| `/.test(l)) ?? [];

export function summarize(messages, meta = {}) {
  const r = messages.find((m) => m.type === 'result') ?? {};
  const models = Object.fromEntries(Object.entries(r.modelUsage ?? {}).map(([k, u]) => [k, {
    input: u.inputTokens ?? 0, output: u.outputTokens ?? 0, cacheRead: u.cacheReadInputTokens ?? 0, cacheWrite: u.cacheCreationInputTokens ?? 0, costUsd: u.costUSD ?? 0,
  }]));
  return {
    at: meta.at ?? new Date().toISOString(),
    issue: meta.issue ?? null,
    milestone: meta.milestone ?? null,
    mode: meta.mode ?? null,
    runId: meta.runId ?? null,
    costUsd: Number((r.total_cost_usd ?? 0).toFixed(4)),
    turns: r.num_turns ?? 0,
    error: r.is_error ?? !r.type,
    models,
    assets: meta.assets ?? { images: 0, models: 0 },
    calls: meta.calls ?? { images: 0, models: 0, failed: 0 },
    ...(meta.round ? { round: meta.round } : {}),
  };
}

// 资产工具的调用次数（含失败）：.game-studio/run/asset-calls.jsonl，每次真实调用一行
export function assetCalls(text) {
  const rows = (text ?? '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return { images: rows.filter((r) => r.kind === 'image').length, models: rows.filter((r) => r.kind === 'model').length, failed: rows.filter((r) => !r.ok).length };
}

// 本次新增的生成资产：按文件扩展名分图片与三维模型
export function newAssets(before, after) {
  const old = new Set(assetRows(before));
  const added = assetRows(after).filter((l) => !old.has(l) && l.split('|')[3]?.trim() === '生成');
  return {
    images: added.filter((l) => /\.(png|jpe?g|webp|gif|avif|svg)`/i.test(l)).length,
    models: added.filter((l) => /\.(glb|gltf|fbx|obj)`/i.test(l)).length,
  };
}

// 费用评论：白话一句 + 隐藏标记（预算检查与控制台都读它）+ 折叠的详情
export const costComment = (rec, runUrl) => [
  `🤖 ${MODE_TEXT[rec.mode] ?? 'agent'}${rec.round ? `（第 ${rec.round} 次）` : ''}${rec.error ? '没做成' : '做完了'}：费用约 $${rec.costUsd.toFixed(2)}，用了 ${rec.turns} 轮${callText(rec)}。`,
  ...details([`[运行日志](${runUrl})`, `模式 \`${rec.mode}\`；费用是按价格表估算，不是账单${rec.calls?.images || rec.calls?.models ? '；出图出模的费用以服务商账单为准' : ''}`]),
  `<!-- ${COST_MARK} ${JSON.stringify(rec)} -->`,
].join('\n');

// 资产：调用次数与最终登记的数量
function callText(rec) {
  const c = rec.calls ?? {};
  if (!c.images && !c.models && !rec.assets.images && !rec.assets.models) return '';
  return `；出图 ${c.images ?? 0} 次、出模 ${c.models ?? 0} 次${c.failed ? `（失败 ${c.failed} 次）` : ''}，新增资产 ${rec.assets.images + rec.assets.models} 个`;
}

// 从评论里解析成本记录；与 costs.jsonl 合并时按 runId 去重
export function fromComments(bodies) {
  return bodies.flatMap((b) => [...(b ?? '').matchAll(new RegExp(`<!-- ${COST_MARK} (\\{.*?\\}) -->`, 'g'))].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean));
}

// 返工轮次：这个 PR 上已有的返工记录数 + 1
export const reworkRound = (records, pr) => records.filter((r) => r.mode === 'rework' && r.issue === pr).length + 1;

export function mergeCosts(...lists) {
  const seen = new Set();
  return lists.flat().filter((c) => { const k = c.runId ?? JSON.stringify(c); if (seen.has(k)) return false; seen.add(k); return true; });
}

if (isMain(import.meta.url)) {
  const [file] = process.argv.slice(2);
  const messages = file && existsSync(file) ? parseMessages(readFileSync(file, 'utf8')) : [];
  const before = process.env.ASSETS_BEFORE && existsSync(process.env.ASSETS_BEFORE) ? readFileSync(process.env.ASSETS_BEFORE, 'utf8') : '';
  const after = existsSync('assets/README.md') ? readFileSync('assets/README.md', 'utf8') : '';
  const prComments = process.env.PR_COMMENTS_FILE && existsSync(process.env.PR_COMMENTS_FILE) ? JSON.parse(readFileSync(process.env.PR_COMMENTS_FILE, 'utf8')) : [];
  const round = process.env.MODE === 'rework' ? reworkRound(fromComments(prComments), Number(process.env.TARGET)) : undefined;
  const calls = assetCalls(existsSync('.game-studio/run/asset-calls.jsonl') ? readFileSync('.game-studio/run/asset-calls.jsonl', 'utf8') : '');
  console.log(JSON.stringify(summarize(messages, { round, calls,
    issue: Number(process.env.TARGET) || null, milestone: process.env.MILESTONE || null, mode: process.env.MODE || null,
    runId: process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null, assets: newAssets(before, after),
  })));
}
