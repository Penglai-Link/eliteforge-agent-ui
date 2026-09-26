---
name: eliteforge-agent-ui-theme
description: "在维护 eliteforge-agent-ui 的聊天主题、色彩令牌、主题挂点或 React/Vue 样式一致性时使用。"
metadata:
  version: 1.0.0
---

# EliteForge Agent UI 聊天主题

维护 `eliteforge-agent-ui` 公共聊天组件的主题能力。当前主题包提供 SCSS/CSS 令牌和组件挂点；它不解析 Tron 的 `skin.json`、ZIP 皮肤包，也不负责宿主应用的主题导入或运行时。

## 修改规则

- 先检查 `packages/chat-theme/src/theme.scss`、React/Vue 对应组件与样式，再按实际需要改动；不要把 Tron 私有 API、产品名称或皮肤包格式引入公共包。
- 颜色、字体、Markdown 与语法高亮优先通过 `--agent-ui-*` CSS 自定义属性覆盖，避免为单个主题复制整份组件样式。
- 聊天结构需要主题选择器时，React 与 Vue 必须保持相同的 `data-theme-part` 值；目前挂点约定见 [聊天主题契约](references/chat-theme-contract.md)。
- `data-theme-effect-layer="chat"` 是宿主主题引擎可选使用的视觉效果挂点，不代表本项目会加载或执行任意 CSS。
- 新增或改变主题外观时，同时检查 React 与 Vue，补充相应测试，并运行受影响包的构建与测试。

## 验证

优先运行相关 workspace 的 `npm run test --workspace ...` 和 `npm run build --workspace ...`；若改动共享令牌或多个包，再运行根目录 `npm run check`。
