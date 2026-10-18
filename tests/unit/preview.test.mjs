// PR 预览的档位选择、地址与评论（tools/preview.mjs）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseTier, cfProject, pagesUrl, commentBody, pickShots, MARK } from '../../tools/preview.mjs';

test('档位：Cloudflare 优先，其次公开仓库的 Pages，否则只有构建产物', () => {
  assert.equal(chooseTier({ cloudflare: true, visibility: 'private' }), 'cloudflare');
  assert.equal(chooseTier({ cloudflare: false, visibility: 'public' }), 'pages');
  assert.equal(chooseTier({ cloudflare: false, visibility: 'private' }), 'artifact');
  assert.equal(chooseTier({ cloudflare: false, visibility: 'internal' }), 'artifact');
});

test('地址：Pages 子路径与用户站点、Cloudflare 项目名', () => {
  assert.equal(pagesUrl('MuheZitong/Yidao', 'pr-3/'), 'https://muhezitong.github.io/Yidao/pr-3/');
  assert.equal(pagesUrl('a/a.github.io', ''), 'https://a.github.io/');
  assert.equal(cfProject('o/Yidao_Liangban'), 'yidao-liangban');
});

test('评论：带隐藏标记；有地址给试玩链接，没有就说明如何开启', () => {
  const base = { sha: 'abcdef123', runUrl: 'https://x/run', repo: 'o/r' };
  const withUrl = commentBody({ ...base, tier: 'pages', url: 'https://o.github.io/r/pr-1/', shots: [{ name: 'smoke-title', url: 'https://o.github.io/r/pr-1/_shots/smoke-title.png' }] });
  assert.ok(withUrl.startsWith(MARK));
  assert.match(withUrl, /\[打开试玩\]\(https:\/\/o\.github\.io\/r\/pr-1\/\)/);
  assert.match(withUrl, /<img src="https:\/\/o\.github\.io\/r\/pr-1\/_shots\/smoke-title\.png"/);
  const none = commentBody({ ...base, tier: 'artifact', url: null });
  assert.doesNotMatch(none, /打开试玩/);
  const fold = none.slice(none.indexOf('<details>'));
  for (const w of ['CLOUDFLARE_API_TOKEN', 'e2e-shots', 'preview-dist']) assert.ok(fold.includes(w), `${w} 应在详情里`);
  assert.ok(!none.slice(0, none.indexOf('<details>')).includes('CLOUDFLARE'), '详情外不出现技术细节');
});

test('截图：失败截图优先，最多 4 张', () => {
  assert.deepEqual(pickShots(['b.png', 'a.png', 'x-FAIL.png', 'c.png', 'd.png', 'e.json']), ['x-FAIL.png', 'a.png', 'b.png', 'c.png']);
});

test('发布 gh-pages 时写 .nojekyll（否则 _shots/ 不发布）；开启 Pages 用 JSON 请求体', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../tools/preview.mjs', import.meta.url), 'utf8');
  assert.match(src, /'\.nojekyll'/);
  assert.match(src, /'--input', '-'\], \{ input: JSON\.stringify\(\{ source: \{ branch: 'gh-pages'/);
});

test('启用设定集时评论附设定集链接', () => {
  const b = commentBody({ tier: 'pages', url: 'https://o.github.io/r/pr-1/', sha: 'abcdef1', runUrl: 'u', repo: 'o/r', lorebook: true });
  assert.match(b, /\[设定集\]\(https:\/\/o\.github\.io\/r\/pr-1\/lorebook\/\)/);
});

test('评论列出这次的资产：有地址时图片给缩略图，文件名都在详情里', () => {
  const b = commentBody({ tier: 'pages', url: 'https://o.github.io/r/pr-1/', sha: 'abcdef1', runUrl: 'u', repo: 'o/r', assets: ['public/images/hero.png', 'public/models/hero.glb'] });
  assert.match(b, /这次新做的美术\*\*（2 个/);
  assert.match(b, /<img src="https:\/\/o\.github\.io\/r\/pr-1\/images\/hero\.png"/);
  assert.match(b, /<details>[\s\S]*`public\/models\/hero\.glb`[\s\S]*<\/details>/);
  const priv = commentBody({ tier: 'artifact', url: null, sha: 'abcdef1', runUrl: 'u', repo: 'o/r', assets: ['public/images/hero.png'] });
  assert.doesNotMatch(priv, /<img/);
  assert.match(priv, /`public\/images\/hero\.png`/);
});

test('改前改后：同名截图并排，新画面单列；隐藏标记带截图名单', () => {
  const u = 'https://o.github.io/r/pr-1/';
  const body = commentBody({ tier: 'pages', url: u, sha: 'abcdef1', runUrl: 'r', repo: 'o/r',
    shots: [{ name: 'title', url: `${u}_shots/title.png` }, { name: 'combo', url: `${u}_shots/combo.png` }],
    before: [{ name: 'title', url: `${u}_shots/before/title.png` }] });
  assert.match(body, /改前 → 改后[\s\S]*\| title \| <img src="https:\/\/o\.github\.io\/r\/pr-1\/_shots\/before\/title\.png"[^|]*\| <img src="https:\/\/o\.github\.io\/r\/pr-1\/_shots\/title\.png"/);
  assert.match(body, /新画面[\s\S]*combo/);
  assert.match(body, /<!-- game-studio:shots \{"url":"https:\/\/o\.github\.io\/r\/pr-1\/","shots":\["title","combo"\],"before":\["title"\]/);
});
