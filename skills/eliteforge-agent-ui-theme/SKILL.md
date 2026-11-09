---
name: eliteforge-agent-ui-theme
description: "维护 Agent UI 的 Chat、Composer、A2UI、Motion 和终端主题；用于调整公开样式变量、主题挂点、动效策略及 React/Vue 外观一致性。"
metadata:
  version: 1.2.2
---

# EliteForge Agent UI 主题

以当前源码和包导出为准维护公共主题。npm 包使用 `@personai/agent-ui-*`；公共组件不加载产品皮肤文件、不执行主题脚本，也不依赖 Tron 等宿主私有 API。

## Output Path

1. 用户明确指定的主题源码或文档路径优先。
2. 未指定时，在本仓库现有主题源码中修改；按[主题契约](references/chat-theme-contract.md)选择 Chat、Composer、A2UI、Motion 或终端的文件。
3. 只修改宿主皮肤时，沿用宿主已有样式入口；不修改 `node_modules` 或复制公共渲染器。源码与对应文档、令牌索引是维护对象，`dist/` 由构建生成。

## 工作流程

1. 读取主题契约中受影响模块的源码入口，核对 CSS 引用链、组件挂点和 `package.json.exports`。不要把仓库内相对路径当成 npm 导出路径。
2. 确认改动属于公共组件默认值还是宿主覆盖；先检查祖先继承、变量回退和选择器优先级，再改实现。
3. 按下列规则修改；同步契约、受影响文档和机器索引。凡影响安装、样式入口或宿主调用方式的改动，也更新对接 skill。

## 修改规则

- 可主题化的颜色、字体、字号、字重、间距、尺寸、圆角、边框、阴影、透明度和动画参数应提供 CSS 自定义属性及合理回退。0、100%、布局方向、SVG 数据坐标等结构常量不必变量化。
- 复用 `--agent-ui-*` 通用变量；Chat、Composer、A2UI、Motion 使用各自的语义变量。终端保留现有 `--ai-terminal-*` 和 `TerminalThemeTokenOverrides` 契约，不擅自改名为另一套前缀。
- 同一语义使用同一变量。组件使用点的回退不能通过新增根节点默认值遮蔽祖先覆盖；完整全局主题 `chat-theme` 的根色板与局部组件回退应区分处理。
- React / Vue 共用主题契约和公共挂点。不要依赖内部 DOM 层级、私有 class 或内联固定颜色绕过变量；SVG 的 stroke、fill、图例和阈值色也属于检查范围。
- 新增、删除或改名变量/挂点前检查调用方；同步相应文档与 JSON 索引，写明兼容变化。A2UI、Composer、Motion 各有独立索引，不能只更新 A2UI 清单。
- 保留 reduced-motion、隐藏页面及 Provider 关闭策略；不可通过组件 key 重建表单来重播动画。终端 CSS 变化后也要核对 xterm 画布颜色同步。

## 验证与交付

- 样式实现变更：在真实浏览器中修改祖先或 Surface 的变量并读取 computed style；仅出现 `var()` 不代表覆盖生效。检查独立默认、浅色、宿主深色、Matrix 深色，以及焦点、禁用、窄屏和减少动画状态。
- 按影响范围检查字体、尺寸、圆角、间距、统计/图表和终端 ANSI 色；React / Vue 共用实现要核对两端。
- 运行受影响 workspace 的构建；共享令牌或多包源码变更运行根目录 `npm run check`（当前仅执行构建）。只运行仓库实际存在且相关的检查，不把旧文档的测试数量当作本次结果；仅在用户要求时新增测试代码。
- 仅修改 skill/文档时，核对源码、示例和链接，运行 skill-creator 的 `quick_validate.py`；保持 `agents/openai.yaml` 与范围一致。不将文档校验描述为浏览器或构建验证。
