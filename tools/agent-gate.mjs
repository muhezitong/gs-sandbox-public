// agent 工作流的派发前检查（《系统架构》§4.2）：GitHub Actions 里由 .github/workflows/agent.yml 调用。
// 读 GITHUB_EVENT_PATH 判断要做什么（do / rework / plan / confirm），检查权限、依赖、预算；
// 不通过就在 issue 下评论原因。结果写到 GITHUB_OUTPUT：ok、mode、target、instruction。零依赖，只用 node 与 gh。
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const repo = process.env.GITHUB_REPOSITORY;
  const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8' }).trim();
  // 多行值（instruction）用定界符写法；分隔符带随机后缀，防止评论内容里伪造结束标记
  const out = (k, v) => {
    if (!process.env.GITHUB_OUTPUT) return;
    const tag = `__GS_${Math.random().toString(36).slice(2)}__`;
    appendFileSync(process.env.GITHUB_OUTPUT, String(v).includes('\n') ? `${k}<<${tag}\n${v}\n${tag}\n` : `${k}=${v}\n`);
  };
  const block = (n, why) => {
    gh('issue', 'comment', String(n), '-R', repo, '-b', `🛑 agent 未运行：${why}`);
    console.log(`blocked: ${why}`);
    out('ok', 'false');
  };

  const d = decide(event, process.env.GITHUB_EVENT_NAME);
  if (d.skip) { console.log(`skip: ${d.skip}`); out('ok', 'false'); process.exit(0); }

  if (d.mode === 'do') {
    const deps = dependenciesOf(event.issue.body);
    const open = deps.filter((n) => gh('api', `repos/${repo}/issues/${n}`, '--jq', '.state') !== 'closed');
    if (open.length) { block(d.target, `依赖未关闭：${open.map((n) => `#${n}`).join('、')}。先完成依赖再打 \`${GO_LABEL}\`。`); process.exit(0); }
  }
  const budget = existsSync('.game-studio/budget.json') ? JSON.parse(readFileSync('.game-studio/budget.json', 'utf8')) : null;
  const costs = existsSync('.game-studio/costs.jsonl') ? readFileSync('.game-studio/costs.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const milestone = event.issue.milestone?.title;
  const over = milestone && overBudget(budget, costs, milestone);
  if (over) { block(d.target, `里程碑「${milestone}」已花费 $${over.spent.toFixed(2)}，达到预算 $${over.cap}。调整 \`.game-studio/budget.json\` 后重试。`); process.exit(0); }

  out('ok', 'true');
  out('mode', d.mode);
  out('target', String(d.target));
  out('instruction', d.instruction);
  out('per_run_budget', String(budget?.perRun ?? 5));
  console.log(`ok: ${d.mode} #${d.target}`);
}
