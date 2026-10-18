// 发到 GitHub 的文字的用语规范（木禾子桐工作台《控制台架构》§3）：玩家看得懂的白话，技术细节收进折叠的“详情”。
// 禁用词表与控制台 console/ui/lib/wording.js 一致（平台单测校验）。零依赖。

export const BANNED = ['PR', 'pull request', 'issue', 'workflow', 'Actions', 'merge', 'squash', 'rework', 'budget.json', 'costs.jsonl', 'token', 'Secrets', 'Artifacts', 'preview-dist', 'CI', 'milestone', 'agent:go', 'JSON', 'YAML'];

// 找出文字里的禁用词（按整词，大小写不敏感）
export function bannedIn(text) {
  const s = String(text ?? '');
  return BANNED.filter((w) => new RegExp(`(^|[^A-Za-z0-9_:.-])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9_:.-])`, 'i').test(s));
}

// 玩家看得到的部分：去掉隐藏标记、折叠的“详情”、代码与链接地址
export function visibleText(md) {
  return String(md ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<details>[\s\S]*?<\/details>/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/<[^>]+>/g, '');
}

// 折叠的“详情”：技术细节放这里
export const details = (lines) => (lines.filter(Boolean).length ? ['', '<details><summary>详情</summary>', '', ...lines.filter(Boolean), '', '</details>'] : []);

// 隐藏标记：<!-- game-studio:<kind> {...} -->，控制台据此识别
export const marker = (kind, data) => `<!-- game-studio:${kind} ${JSON.stringify(data)} -->`;
export function readMarkers(body, kind) {
  return [...String(body ?? '').matchAll(new RegExp(`<!-- game-studio:${kind} (\\{.*?\\}) -->`, 'g'))].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
}

// agent 的几种模式的白话
export const MODE_TEXT = { do: '做任务', rework: '再改改', plan: '拆任务', confirm: '创建任务' };
