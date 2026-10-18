// agent 运行的阶段进度（木禾子桐工作台 #127）：一条评论随运行更新，带隐藏标记，控制台据此画时间线。
// agent 在每个阶段开始时运行：node tools/agent-progress.mjs <阶段> [一句话说明]
// 工作流结束时运行：node tools/agent-progress.mjs done <成本记录 JSON> [运行地址]
// 阶段：read 读需求 · docs 改文档 · code 写代码 · assets 出资产 · test 跑测试 · pr 提交改动。
// 需要环境变量 GITHUB_REPOSITORY、TARGET（issue 或 PR 编号）、GH_TOKEN；零依赖，只用 node 与 gh。
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { marker, readMarkers, details, MODE_TEXT } from './wording.mjs';
const isMain = (url) => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url)); } catch { return false; } };

export const STAGES = [['read', '读需求'], ['docs', '改文档'], ['code', '写代码'], ['assets', '出资产'], ['test', '跑测试'], ['pr', '提交改动']];
export const PROGRESS = 'progress';

// 把一个阶段记进状态：之前的阶段都算完成；同一阶段再来一次只更新说明
export function advance(state, stage, note = '', now = new Date().toISOString()) {
  if (!STAGES.some(([k]) => k === stage)) throw new Error(`未知阶段：${stage}`);
  const stages = state.stages.filter((s) => s.key !== stage);
  stages.push({ key: stage, at: now, note: String(note).slice(0, 200) });
  return { ...state, current: stage, stages };
}

export function finish(state, rec, now = new Date().toISOString()) {
  return { ...state, current: null, done: true, ok: !rec.error, endedAt: now, costUsd: rec.costUsd ?? 0, turns: rec.turns ?? 0 };
}

export function progressBody(state, runUrl) {
  const seen = new Set(state.stages.map((s) => s.key));
  const head = state.done ? (state.ok ? '✅ agent 做完了' : '⚠️ agent 这次没做成') : `⏳ agent 正在${MODE_TEXT[state.mode] ?? '工作'}`;
  const lines = [marker(PROGRESS, state), `### ${head}`, ''];
  for (const [k, label] of STAGES) {
    const s = state.stages.find((x) => x.key === k);
    const icon = !s ? '◻️' : state.current === k && !state.done ? '🔄' : '✅';
    if (!s && k === 'assets') continue; // 没出资产就不列这一步
    lines.push(`- ${icon} ${label}${s?.note ? `：${s.note}` : ''}`);
  }
  if (state.done) lines.push('', `用了 ${state.turns} 轮，约 $${Number(state.costUsd).toFixed(2)}。`);
  else if (!seen.size) lines.push('', '刚开始。');
  lines.push(...details([runUrl ? `[运行日志](${runUrl})` : null]));
  return lines.join('\n');
}

const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8' }).trim();

function find(repo, target) {
  const list = JSON.parse(gh('api', `repos/${repo}/issues/${target}/comments?per_page=100`));
  const runId = process.env.GITHUB_RUN_ID;
  return list.reverse().map((c) => ({ id: c.id, state: readMarkers(c.body, PROGRESS)[0] })).find((c) => c.state && String(c.state.runId) === String(runId));
}

function upsert(repo, target, state, runUrl) {
  const body = progressBody(state, runUrl);
  const cur = find(repo, target);
  if (cur) gh('api', '-X', 'PATCH', `repos/${repo}/issues/comments/${cur.id}`, '-f', `body=${body}`);
  else gh('api', `repos/${repo}/issues/${target}/comments`, '-f', `body=${body}`);
}

if (isMain(import.meta.url)) {
  const [stage, arg, url] = process.argv.slice(2);
  const repo = process.env.GITHUB_REPOSITORY;
  const target = process.env.TARGET;
  const runUrl = url ?? `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  try {
    const prev = find(repo, target)?.state ?? { runId: Number(process.env.GITHUB_RUN_ID) || null, mode: process.env.MODE ?? 'do', target: Number(target), startedAt: new Date().toISOString(), stages: [] };
    const next = stage === 'done' ? finish(prev, JSON.parse(arg ?? '{}')) : advance(prev, stage, arg);
    upsert(repo, target, next, runUrl);
    console.log(`进度：${stage}`);
  } catch (e) {
    // 进度只是给人看的，失败不影响 agent 干活
    console.log(`进度没更新：${e.message}`);
  }
}
