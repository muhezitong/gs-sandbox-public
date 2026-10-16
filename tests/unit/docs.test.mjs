// 文档规范校验：对应 docs/00-文档规范.md
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = fileURLToPath(new URL('../../docs/', import.meta.url));
// 分类取自《文档规范》§1 的表格：目录 `NN-类名/`；“原样保存”的目录是存档，不适用命名与格式规则
const SPEC = fs.readFileSync(path.join(DOCS, '00-文档规范.md'), 'utf8');
const ROWS = [...(SPEC.split(/^## /m).find((x) => x.startsWith('1. ')) ?? '').matchAll(/^\| `(\d{2})-([^/`]+)\/` \|(.*)$/gm)];
const CATEGORIES = Object.fromEntries(ROWS.filter((m) => !m[3].includes('原样保存')).map((m) => [`${m[1]}-${m[2]}`, m[2]]));
const ARCHIVES = ROWS.filter((m) => m[3].includes('原样保存')).map((m) => `${m[1]}-${m[2]}`);
const STATUSES = ['草稿', '执行中', '现行', '已完成', '历史参考', '已废弃'];
const NAME = /^(\d{2})-([^\s.A-Z]*(?:UI|API)?[^\s.A-Z]*)\.md$/;

function listDocs() {
  const out = [];
  for (const entry of fs.readdirSync(DOCS, { withFileTypes: true })) {
    if (entry.isFile()) { if (entry.name.endsWith('.md')) out.push({ dir: null, file: entry.name }); }
    else if (!ARCHIVES.includes(entry.name)) for (const f of fs.readdirSync(path.join(DOCS, entry.name))) if (f.endsWith('.md')) out.push({ dir: entry.name, file: f });
  }
  return out;
}

const docs = listDocs();
const read = (d) => fs.readFileSync(path.join(DOCS, d.dir || '', d.file), 'utf8');
const rel = (d) => (d.dir ? `${d.dir}/${d.file}` : d.file);

test('docs 根目录只有文档规范，其余文档都在已登记的分类目录里', () => {
  for (const d of docs) {
    if (d.dir === null) assert.equal(d.file, '00-文档规范.md', `根目录不应有 ${d.file}`);
    else assert.ok(CATEGORIES[d.dir], `未登记的分类目录 ${d.dir}`);
  }
});

test('文件名为 两位编号-中文名称.md，编号在分类内从 01 起连续', () => {
  const byDir = {};
  for (const d of docs.filter((x) => x.dir)) {
    const m = d.file.match(NAME);
    assert.ok(m, `文件名不合规：${rel(d)}`);
    (byDir[d.dir] ||= []).push(+m[1]);
  }
  for (const [dir, nums] of Object.entries(byDir)) {
    const sorted = [...nums].sort((a, b) => a - b);
    assert.deepEqual(sorted, sorted.map((_, i) => i + 1), `${dir} 编号应从 01 起连续`);
  }
});

test('文档头：一级标题与文件名一致，四项元数据齐全且合法', () => {
  for (const d of docs) {
    const lines = read(d).split('\n');
    const name = d.file.replace(/^\d{2}-/, '').replace(/\.md$/, '');
    assert.equal(lines[0], `# ${name}`, `${rel(d)} 一级标题应为「# ${name}」`);
    assert.equal(lines[1], '', `${rel(d)} 一级标题后应空一行`);
    const head = lines.slice(2, 6);
    const keys = ['编号', '状态', '更新', '说明'];
    head.forEach((l, i) => {
      assert.match(l, new RegExp(`^> ${keys[i]}：\\S`), `${rel(d)} 第 ${i + 3} 行应为「${keys[i]}」`);
      if (i < 3) assert.ok(l.endsWith('  '), `${rel(d)}「${keys[i]}」行末应保留两个空格`);
    });
    const meta = Object.fromEntries(head.map((l, i) => [keys[i], l.replace(/^> [^：]+：/, '').trim()]));
    const expected = d.dir ? `${CATEGORIES[d.dir]} ${d.dir.slice(0, 2)}-${d.file.slice(0, 2)}` : '规范 00';
    assert.equal(meta['编号'], expected, `${rel(d)} 编号应为「${expected}」`);
    assert.ok(STATUSES.includes(meta['状态']), `${rel(d)} 状态「${meta['状态']}」不在允许范围`);
    assert.match(meta['更新'], /^\d{4}-\d{2}-\d{2}$/, `${rel(d)} 更新日期格式`);
    if (meta['状态'] === '历史参考') assert.match(meta['说明'], /取代/, `${rel(d)} 历史参考需写明被谁取代`);
  }
});

test('标题层级：仅一个一级标题；二级 N. 连续编号；三级 N.M 跟随；无四级标题', () => {
  for (const d of docs) {
    let h1 = 0, h2 = 0, h3 = 0, inCode = false;
    for (const line of read(d).split('\n')) {
      if (line.startsWith('```')) { inCode = !inCode; continue; }
      if (inCode) continue;
      if (/^# /.test(line)) h1++;
      assert.ok(!/^#{4,} /.test(line), `${rel(d)} 不应有四级标题：${line}`);
      if (/^## /.test(line)) {
        const m = line.match(/^## (\d+)\. \S/);
        assert.ok(m, `${rel(d)} 二级标题需编号：${line}`);
        assert.equal(+m[1], ++h2, `${rel(d)} 二级编号不连续：${line}`);
        h3 = 0;
      }
      if (/^### /.test(line)) {
        const m = line.match(/^### (\d+)\.(\d+) \S/);
        assert.ok(m, `${rel(d)} 三级标题需编号：${line}`);
        assert.equal(+m[1], h2, `${rel(d)} 三级标题不属于当前二级：${line}`);
        assert.equal(+m[2], ++h3, `${rel(d)} 三级编号不连续：${line}`);
      }
    }
    assert.equal(h1, 1, `${rel(d)} 应只有一个一级标题`);
  }
});

test('索引：每份文档都在 §8 登记，状态与文档头一致；索引里没有不存在的文档', () => {
  const index = fs.readFileSync(path.join(DOCS, '00-文档规范.md'), 'utf8');
  const rows = [...index.matchAll(/^\| (.+?) \| \[(.+?)\]\((.+?)\) \| (.+?) \|$/gm)].map((m) => ({ no: m[1], link: m[3], status: m[4] }));
  for (const d of docs) {
    const row = rows.find((r) => r.link === rel(d));
    assert.ok(row, `${rel(d)} 未在 00-文档规范.md §8 索引登记`);
    const status = read(d).split('\n')[3].replace(/^> 状态：/, '').trim();
    assert.equal(row.status, status, `${rel(d)} 索引状态与文档头不一致`);
  }
  for (const r of rows) assert.ok(fs.existsSync(path.join(DOCS, r.link)), `索引指向不存在的文档：${r.link}`);
});

test('相对链接：文档里指向本仓库的 .md 链接都存在', () => {
  for (const d of docs) {
    // 代码块与反引号里的是示例，不算链接
    const text = read(d).replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    for (const m of text.matchAll(/\]\(((?!https?:)[^)#]+\.md)(#[^)]*)?\)/g)) {
      const target = path.join(DOCS, d.dir || '', m[1]);
      assert.ok(fs.existsSync(target), `${rel(d)} 链接不存在：${m[1]}`);
    }
  }
});
