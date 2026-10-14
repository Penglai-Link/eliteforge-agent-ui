# 聊天主题契约

## 令牌

`packages/chat-theme/src/theme.scss` 是主题变量的公共入口。基础主题色来自 `--color-*` 变量，再映射到 `--agent-ui-chat-*`；聊天 Markdown 和代码高亮支持 `--agent-ui-markdown-*`、`--agent-ui-syntax-*` 覆盖。添加变量时应保留合理回退值，并检查浅色、深色和 Matrix 深色主题。

## 结构挂点

| 挂点 | 用途 |
| --- | --- |
| `data-theme-part="chat"` | 聊天面板整体 |
| `data-theme-part="chat-message-user"` | 用户消息 |
| `data-theme-part="chat-message-assistant"` | 助手消息 |
| `data-theme-part="composer"` | 独立消息输入区整体 |
| `data-theme-part="chat-input"` | 消息输入框 |
| `data-theme-effect-layer="chat"` | 宿主主题引擎可选放置聊天背景效果的区域 |

React 和 Vue 对应节点必须保持一致的挂点值。主题只应依赖这些公开标记和 CSS 变量，不应依赖内部 DOM 层级或 `ef-chat__*` 私有类名；除非用户明确要求调整结构契约。

## 效果层限制

效果层覆盖聊天容器、使用 `pointer-events: none`，聊天内容位于其上方。它仅预留宿主集成位置；包自身不接收主题 CSS、执行脚本或读取皮肤文件。任何由宿主加载的样式都应限制在该区域，并由宿主负责安全校验与生命周期。

## A2UI 契约

A2UI 外观由两端共用的 `packages/a2ui-core/{components,defaults,statistics}.css` 和渲染器 SVG 属性实现。完整变量接口见 `docs/a2ui-theme.md` 与 `docs/a2ui-theme-tokens.json`。

根挂点为 `data-theme-part="a2ui"`；组件根挂点为 `a2ui-<组件名称小写>`。尺寸和动画优先使用共享 `--agent-ui-*`，组件特有外观使用 `--agent-ui-a2ui-*`，基础颜色保留 `--color-*` 回退。

图表、迷你趋势图的 stroke / fill / 图例色必须使用同一公开系列变量；阈值条必须支持成功、警告、错误色。SVG 数据坐标属于结构，颜色、线宽、点半径、轴字号属于主题。

## 独立输入区

React/Vue 共用 `packages/composer-core/src/styles.css`。直接继承 chat 和通用主题变量，独立默认值采用使用点回退。完整接口见 `docs/composer-theme.md` 和 `docs/composer-theme-tokens.json`。根节点保留 `data-theme-anchor="composer"`，textarea 保留 `data-theme-anchor="chat-input"`。
