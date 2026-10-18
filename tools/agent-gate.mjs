// agent 工作流的派发前检查（《系统架构》§4.2）：GitHub Actions 里由 .github/workflows/agent.yml 调用。
// 读 GITHUB_EVENT_PATH 判断要做什么（do / rework / plan / confirm），检查权限、依赖、预算；
// 不通过就在 issue 下评论原因。结果写到 GITHUB_OUTPUT：ok、mode、target、instruction。零依赖，只用 node 与 gh。
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fromComments, mergeCosts } from './agent-cost.mjs';
import { marker, details } from './wording.mjs';
import { realpathSync } from 'node:fs';
// 是否被直接运行：比较真实路径（macOS 上 /var 是 /private/var 的符号链接，直接比字符串会误判）
const isMain = (url) => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url)); } catch { return false; } };

export const GO_LABEL = 'agent:go';
const WRITERS = ['OWNER', 'MEMBER', 'COLLABORATOR'];

// 评论命令：/agent 再改改：… | /agent 拆 issue：… | /agent 确认；其它 /agent 文本按返工处理
export function parseCommand(body) {
  const m = (body ?? '').trim().match(/^\/agent\s+([\s\S]+)$/);
  if (!m) return null;
  const text = m[1].trim();
  if (/^确认\s*$/.test(text)) return { mode: 'confirm', instruction: '' };
  const plan = text.match(/^拆\s*issue\s*[：:]\s*([\s\S]+)$/i);
  if (plan) return { mode: 'plan', instruction: plan[1].trim() };
  const rework = text.match(/^再改改\s*[：:]\s*([\s\S]+)$/);
  return { mode: 'rework', instruction: (rework ? rework[1] : text).trim() };
}

// issue 正文“## 依赖”一节里的 #编号
export function dependenciesOf(body) {
  const sec = (body ?? '').split(/^## /m).find((s) => s.startsWith('依赖'));
  return sec ? [...new Set([...sec.matchAll(/#(\d+)/g)].map((m) => Number(m[1])))] : [];
}

// 预算：budget = { perRun, milestones: { 迭代 1: 20 } }；costs = costs.jsonl 的行
export function overBudget(budget, costs, milestone) {
  const cap = budget?.milestones?.[milestone];
  if (!cap) return null;
  const spent = costs.filter((c) => c.milestone === milestone).reduce((s, c) => s + (c.costUsd ?? 0), 0);
  return spent >= cap ? { cap, spent } : null;
}

// 拦下时的评论：白话原因 + 隐藏标记（控制台收件箱据此识别）+ 折叠的详情
export const BLOCKED = 'blocked';
export function blockedComment(kind, data) {
  const text = {
    deps: () => `要先做完 ${data.deps.map((n) => `#${n}`).join('、')}，这个任务才能开始。做完后再点一次“开始”。`,
    budget: () => `「${data.milestone}」这个迭代已经花了 $${data.spent.toFixed(2)}，到了预算上限 $${data.cap}。在控制台里调高预算后再点“开始”。`,
  }[kind]?.() ?? data.reason;
  const tech = {
    deps: () => `依赖未关闭：${data.deps.map((n) => `#${n}`).join('、')}（issue 正文“## 依赖”一节）`,
    budget: () => `里程碑预算：.game-studio/budget.json 的 milestones["${data.milestone}"] = ${data.cap}，已花 ${data.spent.toFixed(4)}`,
  }[kind]?.();
  return [marker(BLOCKED, { kind, ...data }), `🛑 还不能开始：${text}`, ...details([tech])].join('\n');
}

// 从事件得出要做的事；返回 { mode, target, instruction } 或 { skip: 原因 }
export function decide(event, name) {
  if (name === 'issues') {
    if (event.action !== 'labeled' || event.label?.name !== GO_LABEL) return { skip: '不是 agent:go 标签' };
    if (event.issue.pull_request) return { skip: 'agent:go 只用于 issue' };
    return { mode: 'do', target: event.issue.number, instruction: '' };
  }
  if (name === 'issue_comment') {
    if (event.action !== 'created') return { skip: '只处理新评论' };
    const cmd = parseCommand(event.comment.body);
    if (!cmd) return { skip: '不是 /agent 命令' };
    if (!WRITERS.includes(event.comment.author_association)) return { skip: `评论者没有写权限（${event.comment.author_association}）` };
    if (event.issue.pull_request && cmd.mode !== 'rework') return { skip: 'PR 下只支持“再改改”' };
    if (!event.issue.pull_request && cmd.mode === 'rework') return { skip: '“再改改”只在 PR 下使用' };
    return { ...cmd, target: event.issue.number };
  }
  return { skip: `不处理 ${name} 事件` };
}

if (isMain(import.meta.url)) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const repo = process.env.GITHUB_REPOSITORY;
  const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8' }).trim();
  // 多行值（instruction）用定界符写法；分隔符带随机后缀，防止评论内容里伪造结束标记
  const out = (k, v) => {
    if (!process.env.GITHUB_OUTPUT) return;
    const tag = `__GS_${Math.random().toString(36).slice(2)}__`;
    appendFileSync(process.env.GITHUB_OUTPUT, String(v).includes('\n') ? `${k}<<${tag}\n${v}\n${tag}\n` : `${k}=${v}\n`);
  };
  const block = (n, kind, data) => {
    gh('issue', 'comment', String(n), '-R', repo, '-b', blockedComment(kind, data));
    console.log(`blocked: ${kind} ${JSON.stringify(data)}`);
    out('ok', 'false');
  };

  const d = decide(event, process.env.GITHUB_EVENT_NAME);
  if (d.skip) { console.log(`skip: ${d.skip}`); out('ok', 'false'); process.exit(0); }

  if (d.mode === 'do') {
    const deps = dependenciesOf(event.issue.body);
    const open = deps.filter((n) => gh('api', `repos/${repo}/issues/${n}`, '--jq', '.state') !== 'closed');
    if (open.length) { block(d.target, 'deps', { deps: open, milestone: event.issue.milestone?.title ?? null }); process.exit(0); }
  }
  const budget = existsSync('.game-studio/budget.json') ? JSON.parse(readFileSync('.game-studio/budget.json', 'utf8')) : null;
  const ledger = existsSync('.game-studio/costs.jsonl') ? readFileSync('.game-studio/costs.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  // 还没合并的运行只在评论里：取仓库最近的评论里的成本标记一起算
  const recent = JSON.parse(gh('api', `repos/${repo}/issues/comments?per_page=100&sort=created&direction=desc`)).map((c) => c.body);
  const costs = mergeCosts(ledger, fromComments(recent));
  // PR 一般没有里程碑：返工的成本记到 PR 正文 Closes #N 那个 issue 的里程碑
  let milestone = event.issue.milestone?.title;
  const closes = !milestone && event.issue.pull_request && (event.issue.body ?? '').match(/^(?:Closes|Fixes|Resolves) #(\d+)/im);
  if (closes) milestone = gh('api', `repos/${repo}/issues/${closes[1]}`, '--jq', '.milestone.title // ""') || undefined;
  const over = milestone && overBudget(budget, costs, milestone);
  if (over) { block(d.target, 'budget', { milestone, spent: over.spent, cap: over.cap }); process.exit(0); }

  out('ok', 'true');
  out('mode', d.mode);
  out('target', String(d.target));
  out('instruction', d.instruction);
  out('per_run_budget', String(budget?.perRun ?? 5));
  out('milestone', milestone ?? '');
  console.log(`ok: ${d.mode} #${d.target}`);
}
