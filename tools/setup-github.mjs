// 初始化 GitHub 标签与里程碑（幂等）：npm run setup:github -- [owner/repo] [--prune-default] [--dry-run]
// --prune-default 删除 GitHub 默认的英文标签（只删没有 issue / PR 在用的），避免与 类型: 体系混用
// 区域标签读 CLAUDE.md「开发流程」，里程碑读《迭代计划》§1，文档改了重跑即可同步。需要已登录的 gh。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const read = (p) => readFileSync(root + p, 'utf8');

const TYPES = [
  ['功能', '新玩法或新能力', '1d76db'],
  ['缺陷', '与规格不符或表现错误', 'd73a4a'],
  ['重构', '不改变玩法的结构调整', '5319e7'],
  ['美术', '图像、动画、特效', 'e99695'],
  ['文档', '设计或规范文档', '0075ca'],
  ['测试', '验收、试玩与测试', '0e8a16'],
];
const PRIORITIES = [
  ['高', '阻塞后续工作或影响核心体验', 'b60205'],
  ['中', '本迭代内完成', 'fbca04'],
  ['低', '可延后', 'c2e0c6'],
];

// GitHub 新仓库默认标签（含部分组织追加的 accessibility）
export const DEFAULT_LABELS = ['bug', 'documentation', 'duplicate', 'enhancement', 'good first issue', 'help wanted', 'invalid', 'question', 'wontfix', 'accessibility'];

// 应删除的默认标签：在默认名单里、不是项目标签、没有被使用
export function prunable(existing, inUse, project) {
  return existing.filter((n) => DEFAULT_LABELS.includes(n) && !project.includes(n) && !inUse.includes(n));
}

export function areasFrom(claude) {
  const m = claude.match(/`区域:`（([^）]+)）/);
  if (!m) throw new Error('CLAUDE.md 里找不到 `区域:`（…）');
  return m[1].split('/').map((s) => s.trim()).filter(Boolean);
}

export function milestonesFrom(plan) {
  const sec = plan.split(/^## /m).find((s) => s.startsWith('1. ')) ?? '';
  // 数据行形如 | 迭代 1 | 目标 | 状态 |；表头 | 迭代 | 目标 | … 的“迭代”后紧跟分隔符，被排除
  return sec.split('\n').filter((l) => /^\| 迭代 [^|]/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
    .map(([name, goal, status]) => ({ name, goal, status }));
}

export function labels(areas) {
  return [
    ...TYPES.map(([n, d, c]) => [`类型:${n}`, d, c]),
    ...areas.map((a) => [`区域:${a}`, `${a}相关`, 'ededed']),
    ...PRIORITIES.map(([n, d, c]) => [`优先级:${n}`, d, c]),
    ['agent:go', '交给 agent 在 Actions 里完成（.github/workflows/agent.yml）', '0e8a16'],
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const gh = (...a) => (dryRun ? (console.log('gh', a.join(' ')), '[]') : execFileSync('gh', a, { encoding: 'utf8' }));
  const repo = args.find((a) => !a.startsWith('--')) ?? JSON.parse(gh('repo', 'view', '--json', 'nameWithOwner') || '{}').nameWithOwner;
  if (!repo) { console.error('用法：npm run setup:github -- <owner/repo>'); process.exit(1); }
  for (const [name, description, color] of labels(areasFrom(read('CLAUDE.md')))) {
    gh('label', 'create', name, '-R', repo, '--description', description, '--color', color, '--force');
    if (!dryRun) console.log(`label ${name}`);
  }
  if (args.includes('--prune-default')) {
    const project = labels(areasFrom(read('CLAUDE.md'))).map((l) => l[0]);
    const have = JSON.parse(gh('api', `repos/${repo}/labels?per_page=100`)).map((l) => l.name);
    const inUse = have.filter((n) => JSON.parse(gh('api', `repos/${repo}/issues?state=all&per_page=1&labels=${encodeURIComponent(n)}`)).length > 0);
    for (const n of prunable(have, inUse, project)) {
      gh('label', 'delete', n, '-R', repo, '--confirm');
      if (!dryRun) console.log(`label ${n}（已删除默认标签）`);
    }
  }
  // agent 工作流用 GITHUB_TOKEN 开 PR：仓库默认不允许 Actions 创建 PR，这里打开（不授予审批合并）
  try {
    gh('api', '-X', 'PUT', `repos/${repo}/actions/permissions/workflow`, '-f', 'default_workflow_permissions=read', '-F', 'can_approve_pull_request_reviews=true');
    if (!dryRun) console.log('actions 允许创建 PR');
  } catch {
    // 组织策略禁止时仓库级设置会 409：需要组织管理员在组织设置里先打开
    const org = repo.split('/')[0];
    console.warn(`警告：没能允许 Actions 创建 PR。组织管理员需要在 https://github.com/organizations/${org}/settings/actions 勾选 “Allow GitHub Actions to create and approve pull requests”，然后重跑本命令。没打开时 agent 只能推分支，并在 issue 下给出开 PR 的链接。`);
  }
  const existing = JSON.parse(gh('api', `repos/${repo}/milestones?state=all&per_page=100`)).map((m) => m.title);
  for (const m of milestonesFrom(read('docs/03-计划/01-迭代计划.md'))) {
    if (existing.includes(m.name)) { console.log(`milestone ${m.name}（已存在）`); continue; }
    gh('api', `repos/${repo}/milestones`, '-f', `title=${m.name}`, '-f', `description=${m.goal}`, '-f', `state=${m.status === '已完成' ? 'closed' : 'open'}`);
    if (!dryRun) console.log(`milestone ${m.name}`);
  }
}
