# 资产登记

`public/` 与 `assets/` 下每个图片、模型、音频、视频文件都在下表登记一行；没有登记的不合入，`npm test` 会校验（`tests/unit/assets.test.mjs`）。代码绘制、程序化生成的内容不是文件，不用登记。`docs/05-原始输入/` 的原稿按文档规范存档，也不在这里登记。

| 列 | 填法 |
|---|---|
| 文件 | 相对仓库根的路径，用反引号，如 `` `public/images/hero.webp` `` |
| 用途 | 在游戏里哪里用 |
| 来源 | `生成`、`手绘`、`外部授权` 三选一 |
| 模型 | 来源为“生成”时必填，如 `gpt-image-2.5`、`Tripo P2.0`；其它填 `-` |
| 提示词或参考 | 生成：提示词或参考图路径；外部授权：作者与许可证；手绘：作者 |
| 任务 ID | 生成服务返回的任务 ID，没有填 `-` |
| 日期 | `YYYY-MM-DD` |

## 登记表

| 文件 | 用途 | 来源 | 模型 | 提示词或参考 | 任务 ID | 日期 |
|---|---|---|---|---|---|---|
| `public/images/player-ref.png` | 玩家角色小木匠的三维参考图（生成 player.glb 用） | 生成 | gpt-image-2.5-sunburst | Chibi cute little carpenter character, full body, standing, three-quarter front view, wearing a cap and a brown work apron, low-poly cartoon style, flat colors, simple shapes, plain pure white background, no shadow, no text, single character centered | - | 2026-10-16 |
| `public/models/player.glb` | 玩家角色小木匠（src/render/scene.js 加载，高约 1.3 单位） | 生成 | Tripo P2-20260801 | 参考：public/images/player-ref.png | f3dff0f1-5bbf-44ea-bed9-9a98ed36db3b | 2026-10-16 |
