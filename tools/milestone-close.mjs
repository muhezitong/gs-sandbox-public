// 里程碑收尾：PR 合并后，它关闭的 issue 所在里程碑如果已经没有 open issue，就关闭里程碑并在 PR 下评论一行。
// GitHub Actions 里由 .github/workflows/milestone-close.yml 调用；零依赖，只用 node 与 gh。
import { readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 正文里 Closes / Fixes / Resolves #N
export const closesIn = (body) => [...new Set([...(body ?? '').matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?) #(\d+)/gi)].map((m) => Number(m[1])))];

// 该不该关：里程碑仍 open，且扣掉这个 PR 正在关闭的 issue 后没有 open issue 了
// （工作流可能比 GitHub 关 issue 早一步，open_issues 里还算着它们）
export function shouldClose(milestone, closingOpenInIt) {
  if (!milestone || milestone.state !== 'open') return false;
  return milestone.open_issues - closingOpenInIt <= 0;
}

const isMain = (url) => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url)); } catch { return false; } };

if (isMain(import.meta.url)) {
  const ev = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const repo = process.env.GITHUB_REPOSITORY;
  const pr = ev.pull_request;
  if (!pr?.merged) { console.log('PR 没有合并，跳过'); process.exit(0); }
  const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8' }).trim();
  const issues = closesIn(pr.body).map((n) => JSON.parse(gh('api', `repos/${repo}/issues/${n}`)));
  const byMs = new Map();
  for (const i of issues) if (i.milestone) byMs.set(i.milestone.number, [...(byMs.get(i.milestone.number) ?? []), i]);
  for (const [num, list] of byMs) {
    const ms = JSON.parse(gh('api', `repos/${repo}/milestones/${num}`));
    const closing = list.filter((i) => i.state === 'open').length;
    if (!shouldClose(ms, closing)) { console.log(`里程碑「${ms.title}」还有 ${ms.open_issues - closing} 个 open issue`); continue; }
    gh('api', '-X', 'PATCH', `repos/${repo}/milestones/${num}`, '-f', 'state=closed');
    gh('issue', 'comment', String(pr.number), '-R', repo, '-b', `🏁 里程碑「${ms.title}」的 issue 已全部完成，已关闭。记得把《迭代计划》里它的状态改为“已完成”（复核 PR 一般已经改好）。`);
    console.log(`已关闭里程碑「${ms.title}」`);
  }
}
