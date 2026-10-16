# 公开沙盒3D

由木禾子桐工作台 `web-2d` 模板生成。设计基准见 `docs/01-设计/01-游戏方向.md`，工程约定见 `CLAUDE.md`。

```bash
npm install
npm test
npm run dev
npm run build
```

## 模板升级

本仓库由木禾子桐工作台 `web-2d` 模板生成，来源记录在 `.game-studio.json`。在 game-studio 仓库运行 `npm run upgrade -- <本仓库目录> --pr` 可接收模板的通用部分更新（测试、e2e 运行器、`.github/`、CLAUDE.md 的开发流程一节），项目自己的代码、文档与“项目特有约定”不会被改动。
