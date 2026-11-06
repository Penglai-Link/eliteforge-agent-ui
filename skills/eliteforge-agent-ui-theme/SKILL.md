---
name: eliteforge-agent-ui-theme
description: "维护 eliteforge-agent-ui 的 Chat / A2UI 主题变量、组件外观、主题挂点和 React/Vue 样式一致性。"
metadata:
  version: 1.1.0
---

# EliteForge Agent UI 主题

维护公共 Chat / A2UI 组件的主题能力。公共包不解析产品皮肤包，不加载主题脚本，也不依赖产品私有 API。

## Output Path

1. 用户明确指定的主题源码或文档路径优先。
2. 未指定时，在现有源码中修改：基础主题 `packages/chat-theme/src/theme.scss`、共享控件 `primitives.css`、A2UI `packages/a2ui-core/{components,defaults,statistics}.css`。
3. A2UI 公共接口记录在 `docs/a2ui-theme.md` 和 `docs/a2ui-theme-tokens.json`，用法记录在 `docs/a2ui-client.md`。组件渲染代码中的 SVG 外观也属于主题检查范围。

## 修改规则

- 修改前读取相关源码、[主题契约](references/chat-theme-contract.md)和受影响组件，确认 React / Vue 的实际入口。
- 所有可主题化的颜色、字体、字号、字重、间距、尺寸、圆角、边框、阴影、透明度和动画参数必须提供 CSS 自定义属性及合理回退值。0、100%、布局方向、SVG 数据坐标等结构常量不必变量化。
- 优先复用已有 `--agent-ui-*` 通用控件变量；A2UI 专用变量使用语义化 `--agent-ui-a2ui-*`，颜色可回退到 `--color-*`。不得以新高优先级规则、内联固定颜色或 SVG 属性绕过公开变量。
- 同一语义使用同一变量；区分状态或子元素时使用有意义的名字。变量引用即公开接口，不要求在根节点赋默认值，以免遮蔽祖先继承和独立使用时的回退。
- React / Vue 复用同一套 A2UI CSS、SVG 变量和 `data-theme-part` 挂点。主题不依赖内部 DOM 层级或私有 class；公开挂点见契约。
- 每次新增或改名变量，同步更新完整变量清单和机器索引；同时核对文档默认值。修改变量前检查调用方，避免默默破坏已有覆盖能力。
- 保留宿主主题覆盖能力和 reduced-motion 行为；检查独立默认、浅色、深色和 Matrix 深色主题。

## 验证

- 在真实浏览器中修改祖先或 Surface 的变量，读取最终 computed style；仅检查 CSS 存在 `var()` 不算验证。
- 覆盖字体、尺寸、圆角、内边距、过渡时间、统计字号、图表系列/图例色和阈值色；同时检查禁用、焦点及窄屏。
- 运行受影响 workspace 的构建与测试。共享令牌或多包改动还需运行根目录 `npm run check`；已有失败应记录具体用例，不得报告全绿。
- 修改本 skill 后，使用 skill-creator 的 `quick_validate.py` 验证，并保持 `agents/openai.yaml` 与范围一致。
