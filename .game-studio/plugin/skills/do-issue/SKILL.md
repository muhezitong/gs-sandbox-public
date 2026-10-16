---
name: do-issue
description: 按仓库 CLAUDE.md 完成一个 GitHub issue：检查依赖、开分支、先改文档再改代码、登记资产、跑 npm test / build / e2e 并读截图、提 PR、等 CI。在木禾子桐工作台生成的游戏仓库里，用户说“做 #12”“开始下一个 issue”或运行 /do-issue 时使用。
---

# 做 issue

仓库的 `CLAUDE.md` 是最高约定；本技能与它冲突时以 `CLAUDE.md` 为准。

## 1. 选题与依赖

- 用户给了编号就用它；没给就取当前里程碑里优先级最高、依赖都已关闭的 open issue，并告诉用户选了哪个。
- `gh issue view <N> --json number,title,body,state,labels,milestone`，读“依赖”一节（一律带 `--json`：部分 gh 版本的默认视图会因 Projects classic 弃用报错）；依赖未关闭就先报告，建议先做依赖，不要硬做。

## 2. 分支

```bash
git switch main && git pull
git switch -c <N>-<英文短描述>
```

## 3. 实现

- 读 issue 的“参考”章节与相关代码，再动手。
- 改玩法数值或规则：先改《游戏方向》，再改 `src/data/`；`npm test` 校验二者一致。
- 规则放 `src/core/`、数值放 `src/data/`，不碰画布与平台；随机只走 `src/core/rng.js`。
- 新玩法或画面变化：在 `tests/e2e/scenarios.mjs` 补场景。
- 新增资产文件：在 `assets/README.md` 登记来源。
- 发现新问题：另开 issue，不塞进当前 PR。

## 4. 门禁

```bash
npm test && npm run build && npm run e2e
```

逐张打开 `tests/shots/` 里本次相关的截图核对画面。失败就修；修不了就停下来报告原因，不要跳过测试或改测试来放水。

## 5. 提交与 PR

- 提交信息：英文祈使句，正文写为什么改，结尾 `Refs #<N>`。
- PR 标题与 issue 标题一致或更具体（≤ 70 字符），正文第一行 `Closes #<N>`，按 `.github/pull_request_template.md` 勾选实际做过的验证，没做的写明原因。

```bash
git push -u origin HEAD
gh pr create -t "<标题>" -F <正文文件>
gh pr checks --watch
```

## 6. 合并

默认**不合并**，报告 PR 链接、CI 结果和截图，等用户确认。只有用户在本次对话里明确要求，或仓库 `CLAUDE.md`“项目特有约定”里有合并授权（授权人、日期、范围，例如“CI 全绿后由 agent 自行合并”）时，才 `gh pr merge --squash --delete-branch`，之后 `git switch main && git pull`。授权只按写明的范围执行。
