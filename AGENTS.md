# Agent UI 仓库协作要求

## 代码与 skills 必须同步

**每次修改代码后，必须核对主题 skill 和对接 skill，并在同一批改动中同步所有受影响的说明、示例与 references。不能先交付代码，再把 skill 更新留待以后。**

- [主题 skill](skills/eliteforge-agent-ui-theme/SKILL.md)：主题变量、默认值、CSS 导出与作用域、公开挂点、React/Vue 外观、动效及终端主题同步。
- [对接 skill](skills/eliteforge-agent-ui-integration/SKILL.md)：包选择、npm 安装与统一版本、公开 API、peer dependencies、样式入口、adapter/transport、事件、历史、运行控制及释放流程。

修改 `packages/`、构建/版本脚本或包清单时，两份 skill 都要核对；若某份无需修改，在交付说明中写明核对结果与原因，不为制造差异而改无关文字。涉及 A2UI、Composer、Motion 的主题接口，还需更新相应 `docs/*-theme*.md/json` 或 `docs/motion*.md/json`；API 变化同步对应包 README 和接入文档。skill 的 `agents/openai.yaml` 与实际范围保持一致，按变化更新 skill 自身的 `metadata.version`。

以源码、`package.json.exports`、类型声明和构建产物为准，不复制过时文档作为事实。仓库源码能力与已发布 npm 版本要明确区分；A2UI 协议版本不可替换为 npm 包版本。

## 开发与交付

- 宿主默认从公共 npm 安装 `@personai/agent-ui-*`，不得在接入示例中恢复隐式本地路径、软链接或旧 scope。仓库内部 workspaces 按现有构建方式维护。
- 全部工作区包统一版本；使用根目录 `npm run version:all -- <完整版本>`，不手工单独升级一个包。版本和安装示例变化时同步 skills 与 README；改文档不自动授权 npm 发布。
- 复杂数据流或生命周期用 Mermaid 或 ASCII 图说明。
- 仅在用户明确要求时新增测试代码；运行已有且相关的检查。当前 `npm run check` 只执行全包构建，不得把它报告为测试通过。
- 修改 skill 后运行 skill-creator 的 `quick_validate.py`，并核对引用路径和代码示例。仅文档修改不要求全量构建或浏览器验证；实现修改按受影响范围执行构建与交互验证。
- 交付说明列出项目、分支、skills 同步情况与实际验证范围；同时修改多个项目时逐项说明。
