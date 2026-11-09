# Agent UI 主题契约

以下路径以 Agent UI 仓库根目录为基准。npm 消费项目只能使用包的公开导出；`src/`、`primitives.css` 等仓库内部路径不是安装后可导入的接口。

## 源码与文档路由

| 模块 | 维护入口 | 对应文档 |
| --- | --- | --- |
| 全局色板、Markdown、代码高亮 | `packages/chat-theme/src/theme.scss` | 本契约；包 `exports` |
| 共用控件与审批按钮 | `packages/chat-theme/src/primitives.css`、`approval-actions.css` | A2UI/Composer 主题文档 |
| Chat 外观与挂点 | `packages/chat-{react,vue}/src/styles.css` 及两端组件 | `docs/integration-guide.md` |
| 独立输入区 | `packages/composer-core/src/styles.css`；两端 `Composer` | `docs/composer-theme.md`、`docs/composer-theme-tokens.json` |
| A2UI | `packages/a2ui-core/{components,defaults,statistics,shadcn}.css`；两端渲染器 | `docs/a2ui-theme.md`、`docs/a2ui-theme-tokens.json` |
| 动效 | `packages/motion-core/src/{index.ts,styles.css}`；两端 motion 入口 | `docs/motion.md`、`docs/motion-tokens.json` |
| 终端 | `packages/terminal/src/terminal/styles/`、`types/themes.ts`、`utils/themes.ts`、`index.ts` | `packages/terminal/README.md` |

## 样式加载与作用域

- Chat、Composer、A2UI 和 Terminal 的消费入口均为对应渲染包的 `styles.css`。Vite 构建提取 CSS，宿主应显式导入，不能只看源码中的 CSS import 就假设安装后的 JS 会加载全部样式。
- Chat 构建合入 Composer、annotations、Mermaid、共用 primitives 以及组件引用的 A2UI 样式；独立 Composer/A2UI 不要求宿主安装 Tailwind 或全局 chat-theme。
- `chat-theme` 根入口及 `styles.css` 都导出完整主题，另导出 `theme.scss`。它包含 `:root`、`html`、`body` 和全局控件规则，会影响宿主页面；已有设计系统应先评估，再决定引入或直接提供变量。
- 色板定义了默认/`light` 与 `matrix-dark`。`data-theme="dark"` 有 Markdown 规则，但没有完整的普通深色色板；宿主必须提供所需深色变量，不能承诺仅切属性即可得到完整深色主题。
- `motion-react` / `motion-vue` 没有 `./styles.css` 导出；其入口导入 `motion-core/styles.css` 策略样式。不要捏造框架包的 CSS 子路径。

## 变量继承

基础色使用 `--color-*`；Chat 使用 `--agent-ui-chat-*`；Markdown 和高亮使用 `--agent-ui-markdown-*`、`--agent-ui-syntax-*`。共享控件优先使用 `--agent-ui-font`、`--agent-ui-control-*`、`--agent-ui-panel-*`、`--agent-ui-gap` 等；Composer/A2UI 特有项分别使用 `--agent-ui-composer-*` / `--agent-ui-a2ui-*`。

公开接口包括变量引用及其回退，不仅包括根节点赋值。独立组件应允许从祖先继承；不能为了“列全变量”而在组件根节点给每项赋值。

## 结构挂点

| 范围 | `data-theme-part` | `data-theme-anchor` |
| --- | --- | --- |
| Chat 面板 | `chat` | `chat` |
| 用户/助手/系统通知 | `chat-message-user` / `chat-message-assistant` / `chat-message-system` | `chat-message` |
| Composer 根 | `composer` | `composer` |
| 输入框 | `chat-input` | `chat-input` |
| Chat 弹窗 | 按实际组件核对 | `dialog` |
| A2UI Surface | `a2ui` | 不假定存在同名 anchor |
| A2UI 组件 | `a2ui-<组件名称小写>` | 按渲染实现核对 |

React/Vue 对应节点保持一致；更细的 A2UI 挂点见主题文档。`data-theme-effect-layer="chat"` 是可选背景效果区域，使用 `pointer-events: none`，内容位于其上方。宿主负责效果生命周期和样式范围；公共包不接收或执行主题脚本。

## 消息辅助操作

当前源码中，React/Vue 的用户消息和正文答复下方的复制、编辑、删除按钮及时间，在支持 hover 的精确指针设备上随对应消息悬停显示；键盘焦点进入消息或按钮时也显示。无 hover 或粗指针设备保持可见。操作行隐藏时保留原有占位，避免聊天内容跳动；只禁用隐藏行的鼠标命中，不移除按钮的键盘焦点能力。工作过程中的消息和系统通知不使用此隐藏规则。

两端由 `styles.css` 中的消息操作行规则实现，不增加 JS 状态、动画、主题变量或组件参数。仅改变显示策略，复制、编辑、删除及时间格式保持原行为。此行为从 `1.0.0-preview.4` 开始提供。

工作过程的摘要、分组和工具条目末尾的展开箭头，在支持 hover 的精确指针设备上仅在对应行悬停或获得键盘焦点时显示；无 hover 或粗指针设备保持可见。隐藏箭头时保留占位，不改变展开状态或点击范围。此行为从 `1.0.0-preview.4` 开始提供。

## A2UI 与 Composer

A2UI 的 `components.css` 汇入 shadcn、defaults、statistics 和共享 primitives，两端使用同一入口。图表、迷你趋势图的 stroke/fill/图例必须使用同一系列变量；阈值条保留成功、警告、错误色。SVG 数据坐标是结构，线宽、点半径、轴字号是主题。

Composer 两端共用 core 样式，保留 `composer` 与 `chat-input` 的 part/anchor。调整尺寸或聚焦样式时，同时检查独立输入区和 Chat 内嵌输入区，不能只在 Chat 祖先存在时生效。

## 动效

宿主通过 `MotionProvider` 提供 `MotionConfig`，负责偏好持久化。参数优先级为效果配置、通用配置、效果专用 CSS 变量、通用 CSS 变量、回退值。变量完整定义见 motion 索引，保留旧控件 transition 与 A2UI spinner/skeleton 覆盖入口。

祖先 `off` / `reduced` 不得被子 Provider 重新开启；页面隐藏会取消出现效果并停止 Provider 内 CSS 动画。只在 `preset` / `replayKey` 改变时重播，普通内容和配置变化不重建表单。自定义 effects 需取消自身动画、显示最终内容并局部清理，不能清理宿主所有动画。

## 终端

终端语义变量为 `--ai-terminal-primary`（文本）、`--ai-terminal-secondary`（背景）、`--ai-terminal-card-background`、`--ai-terminal-border`。初始化通过 `terminalOptions.themeTokens` 设置，类型为 `TerminalThemeTokenOverrides`；`ansi` 可覆盖 xterm 原生调色板。

`setThemeTokens()` 合并覆盖并刷新；`resetTheme()` 清除显式语义/ANSI 覆盖、恢复 CSS 解析；`refreshTheme()` 将当前容器解析后的颜色同步到 xterm。宿主切换样式后按需要调用刷新，不能只检查 DOM 卡片而遗漏画布。参数颜色必须是浏览器可解析的 CSS 颜色值。

终端 `1.0.0-preview.3` 的实例控制方法 `clear()`、`getSelection()`、`focus()` 不重建终端，也不改变主题或语言；调整相关实现时保留这一行为。主题验收可在清屏和重新聚焦后继续检查 DOM 与 xterm 配色。

## Compaction disclosure (since 1.0.0-preview.5)

React and Vue share `.ef-chat__compaction-details` and `.ef-chat__compaction-blocks`
from `chat-theme/src/primitives.css`. Native `details/summary` provides keyboard
activation and expanded state. Contents are a plain list without another card.
Text inherits `--agent-ui-chat-text`, focus uses `--agent-ui-chat-focus`, both
resolved from existing public color tokens. Spacing uses `--agent-ui-space-1`,
`--agent-ui-space-2`, `--agent-ui-space-4` with 4/8/16px fallbacks. No motion added.
