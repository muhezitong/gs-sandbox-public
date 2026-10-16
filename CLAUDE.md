# 公开沙盒

唯一设计基准：`docs/01-设计/01-游戏方向.md`。改玩法数值先改文档，再改 `src/data/`。

## 平台与技术栈

- 目标平台：浏览器竖版 2D 单机；如需微信小游戏，在 `src/platform/` 增加 `wx` 实现，规则层不改。
- 原生 JavaScript（ES Modules）+ Canvas 2D，不引入游戏引擎；构建用 Vite。
- 逻辑与渲染分离：`src/core/`、`src/data/` 不碰 Canvas、DOM 与平台 API，单测直接导入。

## 命令

- `npm run dev` — 开发服务器 http://localhost:5190
- `npm test` — 规格单测（`node --test`）：规则、文档规范、分层约束
- `npm run build` — 构建到 `dist/`（相对路径）；`npm run preview` 在 5191 端口预览构建产物
- `npm run e2e [场景...]` — Playwright + Chrome 自动试玩并截图到 `tests/shots/`（场景在 `tests/e2e/scenarios.mjs`）；默认测 `--mode e2e` 构建产物，`BASE=` 连已有服务器
- 预览：CI 在 e2e 通过后发布试玩地址并在 PR 下维护一条评论（`tools/preview.mjs`）。有 Secrets `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID` 用 Cloudflare Pages；公开仓库用 GitHub Pages 的 `pr-<N>/`；都没有只给构建产物下载
- `npm run setup:github -- [owner/repo] [--prune-default]` — 按 CLAUDE.md 与《迭代计划》建标签与里程碑（幂等）
- 调试：开发服务器与非生产构建里有 `window.__game`；`?seed=<数字>` 固定随机种子
- agent：给 issue 打 `agent:go`，或在评论里写 `/agent 拆 issue：…`、`/agent 确认`，在 PR 里写 `/agent 再改改：…`，由 `.github/workflows/agent.yml` 在 Actions 里运行；预算在 `.game-studio/budget.json`。首次使用需要：仓库 Secrets `ANTHROPIC_API_KEY`（可选 `ANTHROPIC_BASE_URL`）、可选仓库变量 `AGENT_MODEL`，以及允许 Actions 创建 PR（`npm run setup:github` 会设置；组织仓库要先在组织设置里打开）

## 结构

- `src/data/` 纯数据：数值表（无副作用，单测直接导入）
- `src/core/` 纯规则：随机数、对局状态
- `src/render/` Canvas 绘制；`src/platform/` 画布、输入、存储适配
- `public/` 静态资产（构建时原样复制）；`assets/README.md` 资产登记表
- `tests/` 单测与 e2e；`tools/` 资产与辅助脚本

<!-- studio:process -->
## 开发流程

需求用 GitHub issues 维护，一个 issue 由一个 PR 完成。不直接往 `main` 提交。

**issue**

- 粒度：一个 PR 能独立完成、独立验证。做不完或混了多件事就拆开，拆出的部分建新 issue。
- 新 issue 用 `.github/ISSUE_TEMPLATE/` 的模板，写清背景、要做的事、验收、依赖（`#编号`）、参考文档章节。
- 标签每类各选一个：`类型:`（功能/缺陷/重构/美术/文档/测试）、`区域:`（玩法/数值/界面/美术/音频/工程/发布）、`优先级:`（高/中/低）。
- 归入对应里程碑（迭代 1 起顺延）。新迭代先建里程碑，再建 issue。
- 开工前检查依赖：依赖的 issue 未关闭就先做依赖。
- 做的过程中发现新问题，另开 issue，不塞进当前 PR。

**分支与提交**

- 从最新的 `main` 拉分支，命名 `<issue 编号>-<英文短描述>`，例如 `3-score-combo`。
- 提交信息用英文祈使句，正文写为什么改；结尾带 `Refs #<编号>`。

**PR**

- 一个 PR 只关联一个 issue，正文第一行 `Closes #<编号>`，按 `.github/pull_request_template.md` 填写。
- 标题与 issue 标题一致或更具体，不超过 70 字符。
- 提 PR 前必须通过：`npm test`、`npm run build`、`npm run e2e`，并打开本次相关的截图核对。没验证的项在 PR 里写明原因。
- 改玩法数值或规则：同一个 PR 里先改《游戏方向》，再改 `src/data/`。
- 合并方式为 squash merge，合并后远端分支自动删除，本地切回 `main` 并拉取。
- 合并需要用户确认。用户明确要求，或“项目特有约定”里写有合并授权（授权人、日期、范围）时，才由我按授权合并。

**迭代收尾**

- 每个里程碑最后一个 issue 是真人试玩复核。复核结论写进 `docs/04-审计/` 的新文档，新问题拆成新 issue。

## 约定

- 托管文件（`.game-studio.json` 里的模板生成的测试、e2e 运行器、`.github/`、`tools/setup-github.mjs`）由模板升级统一更新，不在项目里改；需要改时向 game-studio 提 issue。
- 文档按 `docs/00-文档规范.md` 命名和排版：`docs/分类/两位编号-中文名称.md`，带四项元数据头，新增后登记索引；`npm test` 会校验。
- 资产：`public/` 与 `assets/` 下的图片、模型、音频文件都在 `assets/README.md` 登记来源（文件、用途、来源、模型、提示词或参考、任务 ID、日期），没登记的不合入，`npm test` 校验。默认用代码绘制，生成资产前先确认《美术参考》。
- 随机统一走 `src/core/rng.js` 的可播种随机数，不直接调 `Math.random()`；同一种子必须复现同一局。
- 不要自行加入《游戏方向》范围外的系统（联网、排行榜、广告、付费）。
<!-- /studio:process -->

## 项目特有约定

<!-- 项目在迭代中沉淀下来的规则写在这里（术语、数值取整、结算顺序、平台限制等），通过 PR 增改。模板升级不会覆盖本节。 -->
