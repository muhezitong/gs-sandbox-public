// 设定集网站（可选能力）：《世界观设定集》是唯一原始数据，public/lorebook/index.html 由它生成（随游戏一起部署到 /lorebook/）。
// node tools/lorebook.mjs enable   在 docs/02-设定/ 建设定集骨架、登记索引、打开开关并生成
// node tools/lorebook.mjs build    改了设定集后重新生成；npm test 会校验生成物与文档一致
// 网站不写任何文档里没有的设定。来源：《城市吞噬者》tools/build-lorebook.mjs 精简。
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
// 是否被直接运行：比较真实路径（macOS 上 /var 是 /private/var 的符号链接，直接比字符串会误判）
const isMain = (url) => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url)); } catch { return false; } };

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SETTINGS_DIR = 'docs/02-设定';
export const DOC_NAME = '世界观设定集';
export const OUT = 'public/lorebook/index.html';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 行内：**粗体**、`代码`、[文字](http 链接)、![说明](public/ 下的图片)；其余转义
export function inline(src) {
  const re = /!\[([^\]]*)\]\(public\/([^)\s]+)\)|\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:[^)\s]+)\)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    if (m[2]) out += `<img src="../${esc(m[2])}" alt="${esc(m[1])}" loading="lazy">`;
    else if (m[3]) out += `<strong>${inline(m[3])}</strong>`;
    else if (m[4]) out += `<code>${esc(m[4])}</code>`;
    else out += `<a href="${esc(m[6])}" target="_blank" rel="noopener">${inline(m[5])}</a>`;
    last = re.lastIndex;
  }
  return out + esc(src.slice(last));
}

const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((s) => s.trim());

function blocks(lines) {
  const out = [];
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (!l.trim() || /^<!--.*-->$/.test(l.trim())) { i++; continue; }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const [head, , ...body] = rows;
      out.push({ t: 'table', head: cells(head), rows: body.map(cells) });
      continue;
    }
    const li = /^(-|\d+\.) /;
    if (li.test(l)) {
      const ordered = /^\d/.test(l), items = [];
      while (i < lines.length && li.test(lines[i])) items.push(lines[i++].replace(li, ''));
      out.push({ t: 'list', ordered, items });
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('|') && !li.test(lines[i])) para.push(lines[i++].trim());
    out.push({ t: 'p', text: para.join('') });
  }
  return out;
}

// 章节树：## N. 标题 → 章；### N.M 标题 → 节；导语进 intro
export function parse(md) {
  const lines = md.split('\n');
  const title = lines[0].replace(/^# /, '');
  const meta = {};
  for (const l of lines.slice(1, 8)) { const m = /^> (编号|状态|更新|说明)：(.*?)\s*$/.exec(l); if (m) meta[m[1]] = m[2]; }
  const sections = [];
  let cur = null, sub = null, buf = [], intro = [];
  const flush = () => { const t = sub ?? cur; if (t) t.blocks = blocks(buf); else intro = blocks(buf.filter((l) => !l.startsWith('>'))); buf = []; };
  for (const l of lines.slice(1)) {
    const h2 = /^## (\d+)\. (.+)$/.exec(l), h3 = /^### (\d+)\.(\d+) (.+)$/.exec(l);
    if (h2) { flush(); cur = { id: `s${h2[1]}`, n: h2[1], title: h2[2], blocks: [], subs: [] }; sub = null; sections.push(cur); continue; }
    if (h3 && cur) { flush(); sub = { id: `s${h3[1]}-${h3[2]}`, n: `${h3[1]}.${h3[2]}`, title: h3[3], blocks: [] }; cur.subs.push(sub); continue; }
    buf.push(l);
  }
  flush();
  return { title, meta, intro, sections };
}

function renderBlocks(bs) {
  return bs.map((b) => {
    if (b.t === 'p') return `<p>${inline(b.text)}</p>`;
    if (b.t === 'list') { const tag = b.ordered ? 'ol' : 'ul'; return `<${tag}>${b.items.map((x) => `<li>${inline(x)}</li>`).join('')}</${tag}>`; }
    return `<table><thead><tr>${b.head.map((h) => `<th scope="col">${inline(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }).join('\n');
}

// 单文件静态站：目录 + 正文 + 本地搜索；不依赖构建工具与网络
export function renderSite(codex, gameName) {
  const nav = codex.sections.map((s) => `<li><a href="#${s.id}">${s.n}. ${esc(s.title)}</a>${s.subs.length ? `<ul>${s.subs.map((x) => `<li><a href="#${x.id}">${x.n} ${esc(x.title)}</a></li>`).join('')}</ul>` : ''}</li>`).join('');
  const body = codex.sections.map((s) => `<section id="${s.id}"><h2>${s.n}. ${esc(s.title)}</h2>${renderBlocks(s.blocks)}${s.subs.map((x) => `<section id="${x.id}"><h3>${x.n} ${esc(x.title)}</h3>${renderBlocks(x.blocks)}</section>`).join('')}</section>`).join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(gameName)} · 设定集</title>
<!-- 由 tools/lorebook.mjs 从 ${SETTINGS_DIR}/ 的《${DOC_NAME}》生成，不要手改；改文档后运行 node tools/lorebook.mjs build -->
<style>
:root{color-scheme:dark;--ink:#f2ede1;--muted:#9fb3a6;--line:#2c3330;--bg:#101317;--card:#161b1f;--accent:#e0a458}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 -apple-system,"PingFang SC","Noto Sans SC",sans-serif}
header{padding:32px 24px 8px;max-width:1080px;margin:0 auto}h1{margin:0;font-size:30px}.lead{color:var(--muted);margin:6px 0 0}
.wrap{display:grid;grid-template-columns:240px 1fr;gap:32px;max-width:1080px;margin:0 auto;padding:16px 24px 64px}
nav{position:sticky;top:16px;align-self:start;font-size:14px}nav ul{list-style:none;margin:0;padding:0}nav ul ul{padding-left:12px}nav a{color:var(--muted);text-decoration:none;display:block;padding:2px 0}nav a:hover,nav a:focus{color:var(--accent)}
input[type=search]{width:100%;margin-bottom:12px;padding:8px 10px;border-radius:6px;border:1px solid var(--line);background:var(--card);color:var(--ink)}
h2{border-bottom:1px solid var(--line);padding-bottom:6px;margin-top:36px}h3{color:var(--accent)}
table{border-collapse:collapse;width:100%;background:var(--card);margin:12px 0}th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}
img{max-width:100%;border-radius:6px}code{background:var(--card);padding:1px 5px;border-radius:4px}a{color:var(--accent)}
.hidden{display:none}@media (max-width:720px){.wrap{grid-template-columns:1fr}nav{position:static}}
</style>
</head>
<body>
<header><h1>${esc(codex.title.replace(DOC_NAME, '') ? codex.title : `${gameName} · ${DOC_NAME}`)}</h1><p class="lead">${inline(codex.meta['说明'] ?? '')}</p></header>
<div class="wrap">
<nav aria-label="目录"><label for="q" class="hidden">搜索设定</label><input id="q" type="search" placeholder="搜索设定…"><ul>${nav}</ul></nav>
<main id="main">${renderBlocks(codex.intro)}${body}</main>
</div>
<script>
const q=document.getElementById('q');q.addEventListener('input',()=>{const k=q.value.trim();for(const s of document.querySelectorAll('main section')){s.classList.toggle('hidden',!!k&&!s.textContent.includes(k))}});
</script>
</body>
</html>
`;
}

export function findDoc(root = ROOT) {
  const dir = join(root, SETTINGS_DIR);
  const f = existsSync(dir) ? readdirSync(dir).find((n) => n.endsWith(`-${DOC_NAME}.md`)) : null;
  return f ? `${SETTINGS_DIR}/${f}` : null;
}

export function enabled(root = ROOT) {
  const f = join(root, '.game-studio.json');
  return existsSync(f) && JSON.parse(readFileSync(f, 'utf8')).features?.lorebook === true;
}

export function build(root = ROOT) {
  const doc = findDoc(root);
  if (!doc) throw new Error(`没有找到 ${SETTINGS_DIR}/NN-${DOC_NAME}.md；先运行 node tools/lorebook.mjs enable`);
  const name = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).description ?? '';
  return renderSite(parse(readFileSync(join(root, doc), 'utf8')), name);
}

// 启用：建骨架文档（下一个编号）、在《文档规范》§8 登记、打开开关、生成
export function enable(root = ROOT, today = new Date().toLocaleDateString('sv-SE')) {
  if (findDoc(root)) return { created: null };
  const dir = join(root, SETTINGS_DIR);
  mkdirSync(dir, { recursive: true });
  const n = String(Math.max(0, ...readdirSync(dir).map((f) => Number(f.slice(0, 2)) || 0)) + 1).padStart(2, '0');
  const rel = `${SETTINGS_DIR}/${n}-${DOC_NAME}.md`;
  const name = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).description ?? '本游戏';
  writeFileSync(join(root, rel), `# ${DOC_NAME}

> 编号：设定 02-${n}  
> 状态：草稿  
> 更新：${today}  
> 说明：《${name}》世界观、角色、地点与物件的唯一原始数据；设定集网站 \`public/lorebook/\` 由本文件生成，与《游戏方向》冲突时以《游戏方向》为准。

本文件是设定集网站的唯一来源：改设定只改这里，然后运行 \`node tools/lorebook.mjs build\`。图片放在 \`public/\` 下，用 \`![说明](public/路径)\` 引用。

## 1. 世界

待定。一句话写清这个世界是什么、玩家在其中是谁。

## 2. 角色

| 名字 | 身份 | 一句话 |
|---|---|---|
| 待定 | 待定 | 待定 |

## 3. 地点

| 地点 | 在游戏里的作用 |
|---|---|
| 待定 | 待定 |

## 4. 物件

| 物件 | 外观 | 作用 |
|---|---|---|
| 待定 | 待定 | 待定 |
`);
  const spec = join(root, 'docs/00-文档规范.md');
  const s = readFileSync(spec, 'utf8');
  const row = `| 设定 02-${n} | [${DOC_NAME}](${rel.replace('docs/', '')}) | 草稿 |`;
  const lines = s.split('\n');
  // 插在最后一个“设定 02-”行之后，没有就插在索引表末尾
  let at = lines.map((l, i) => (l.startsWith('| 设定 02-') ? i : -1)).filter((i) => i >= 0).pop();
  if (at === undefined) { at = lines.length - 1; while (at > 0 && !lines[at].startsWith('|')) at--; }
  lines.splice(at + 1, 0, row);
  writeFileSync(spec, lines.join('\n'));
  const cfg = join(root, '.game-studio.json');
  const meta = existsSync(cfg) ? JSON.parse(readFileSync(cfg, 'utf8')) : {};
  writeFileSync(cfg, JSON.stringify({ ...meta, features: { ...meta.features, lorebook: true } }, null, 2) + '\n');
  mkdirSync(join(root, 'public/lorebook'), { recursive: true });
  writeFileSync(join(root, OUT), build(root));
  return { created: rel };
}

if (isMain(import.meta.url)) {
  const cmd = process.argv[2];
  if (cmd === 'enable') { const r = enable(); console.log(r.created ? `已启用设定集：${r.created} → ${OUT}` : '设定集已启用'); }
  else if (cmd === 'build') { mkdirSync(join(ROOT, 'public/lorebook'), { recursive: true }); writeFileSync(join(ROOT, OUT), build()); console.log(`已生成 ${OUT}`); }
  else { console.error('用法：node tools/lorebook.mjs enable | build'); process.exit(1); }
}
