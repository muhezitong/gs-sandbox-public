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
  assert.match(none, /CLOUDFLARE_API_TOKEN/);
  assert.match(none, /e2e-shots/);
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
