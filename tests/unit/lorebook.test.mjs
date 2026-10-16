// 设定集网站：启用后，public/lorebook/index.html 必须与《世界观设定集》的当前内容一致（tools/lorebook.mjs）。
// 没启用（.game-studio.json 的 features.lorebook 不是 true）时只测解析与渲染。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, OUT, enabled, build, parse, renderSite, inline } from '../../tools/lorebook.mjs';

test('解析：章、节、表格、列表；行内转义与图片只认 public/', () => {
  const md = '# 世界观设定集\n\n> 编号：设定 02-02  \n> 状态：草稿  \n> 更新：2026-01-01  \n> 说明：说明\n\n导语\n\n## 1. 世界\n\n**木**之国。\n\n### 1.1 起源\n\n- 一\n- 二\n\n## 2. 角色\n\n| 名字 | 身份 |\n|---|---|\n| 阿木 | 樵夫 |\n';
  const c = parse(md);
  assert.equal(c.sections.length, 2);
  assert.equal(c.sections[0].subs[0].n, '1.1');
  assert.deepEqual(c.sections[1].blocks[0].rows, [['阿木', '樵夫']]);
  assert.equal(inline('<b>&'), '&lt;b&gt;&amp;');
  assert.match(inline('![图](public/images/a.png)'), /<img src="\.\.\/images\/a\.png"/);
  assert.doesNotMatch(inline('![图](docs/x.png)'), /<img/);
  const html = renderSite(c, '测试');
  assert.match(html, /<a href="#s1-1">1\.1 起源<\/a>/);
  assert.match(html, /<td>阿木<\/td>/);
});

test('启用后：生成物与设定集一致（改了文档要运行 node tools/lorebook.mjs build）', { skip: !enabled() && '未启用设定集' }, () => {
  assert.ok(existsSync(join(ROOT, OUT)), `缺少 ${OUT}`);
  assert.equal(readFileSync(join(ROOT, OUT), 'utf8'), build(), `${OUT} 与《世界观设定集》不一致：运行 node tools/lorebook.mjs build`);
});
