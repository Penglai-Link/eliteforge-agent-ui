# 独立 A2UI 客户端

第一阶段只提供独立客户端。消息传输、聊天历史、AG-UI 桥接、Agent 和审批路由由后续阶段接入。

## 包与使用

- `@personai/agent-ui-a2ui-core`：消息校验、surface 状态、绑定、action、订阅、快照和共享渲染语义。
- `@personai/agent-ui-a2ui-react`：React `A2UISurface`。
- `@personai/agent-ui-a2ui-vue`：Vue `A2UISurface`。

```ts
import { A2UIClient, CATALOG_ID } from '@personai/agent-ui-a2ui-core';
const client = new A2UIClient();
client.apply({ version: 'v0.9.1', createSurface: {
  surfaceId: 'profile', catalogId: CATALOG_ID, sendDataModel: true
}});
// 每收到一个完整 JSON 对象调用一次 apply；客户端不处理 JSONL/SSE 字节流。
```

React：

```tsx
import { A2UISurface } from '@personai/agent-ui-a2ui-react';
import '@personai/agent-ui-a2ui-react/styles.css';
<A2UISurface client={client} surfaceId="profile"
  onAction={(message, metadata) => host.handle(message, metadata)} />
```

Vue：

```vue
<script setup lang="ts">
import { A2UISurface } from '@personai/agent-ui-a2ui-vue';
import '@personai/agent-ui-a2ui-vue/styles.css';
</script>
<template>
  <A2UISurface :client="client" surface-id="profile" :on-action="host.handle" />
</template>
```

`onAction(message, metadata)` 收到标准 `action` 信封和独立传输 metadata。
宿主决定调用业务、继续 Agent 或发起审批，也负责异步请求状态及错误展示。
`sendDataModel` 为真的 surface 放在 `metadata.a2uiClientDataModel.surfaces` 中。
客户端不会自动调用审批恢复接口，也不会发送网络请求。

## 支持范围

协议固定为 `v0.9.1`，支持四种信封：`createSurface`、`updateComponents`、`updateDataModel`、`deleteSurface`。
自定义 Catalog ID：`https://eliteforge.dev/a2ui/v0.9.1/minimal`。这是协议标识，不要求在线可下载。
可从 core 包导出路径 `./catalog.json` 和 `./common_types.json` 获取配套 Schema；JavaScript 可直接导入 `catalog`。

| 组件 | 支持 |
| --- | --- |
| Text | 纯文本、h1–h5；不解释 HTML/Markdown |
| Row / Column | 静态 children、集合模板、justify / align |
| Card | 单 child 引用 |
| Button | child、default / primary / borderless、action.event |
| TextField | shortText / longText / number / obscured；输入值为字符串 |
| CheckBox | boolean value |
| ChoicePicker | mutuallyExclusive / multipleSelection；value 为字符串数组 |
| Image | 动态 URL、description、fit 与尺寸 variant |
| Icon | person / check / close / add / mail / search / info / warning；svgPath；动态绑定 |
| Divider | horizontal / vertical |
| Slider | 数值绑定、min / max，允许小数；写入时校验范围 |
| DateTimeInput | 日期、时间、日期时间；动态 min / max；可清空 |
| Video / AudioPlayer | 动态 URL、浏览器原生播放控制；不自动播放 |

支持字面量和 `{path}` 绑定、JSON Pointer 转义、集合模板中的相对路径、双向写入。
只有绑定了 path 的输入才可编辑。缺失引用先渲染空占位，后续消息补齐。
不支持完整官方 Basic Catalog；函数调用、checks、validationRegexp、ChoicePicker filterable / displayStyle 和 surface theme 均不在首版 Catalog 范围内，校验时拒绝。
协议信封支持与组件/表达式能力需分别判断，不应把本客户端声明为完整 Basic Catalog 实现。

## 常用扩展组件

Catalog 当前共 79 个组件。除已有 15 个组件外，补充如下：

| 分类 | 组件 | 行为 |
| --- | --- | --- |
| 官方布局与交互 | List、Tabs、Modal | List 支持静态和集合模板；Tabs 支持左右键/Home/End；Modal 使用原生 dialog，支持 Esc、焦点约束和关闭按钮 |
| 自定义布局 | Grid、Spacer、Accordion | 响应式网格、间距、可恢复展开状态的折叠区域 |
| 自定义表单 | NumberField、Select、Switch | 数字、字符串、布尔值双向绑定；输入校验与 action context 共用核心 |
| 自定义展示 | Link、Badge、Avatar、Table | 安全链接、状态标签、头像回退、绑定数据行的只读表格 |
| 自定义反馈 | Alert、Progress、Spinner、Skeleton、EmptyState | 提示、确定进度、加载、骨架屏和空状态；支持减少动态效果系统偏好 |

以上 15 个自定义组件不是官方 Basic Catalog 的组件名，Agent 必须使用本包 Catalog。
已覆盖官方 18 个组件名，但仍不等于完整 Basic Catalog：函数、checks、完整图标集合等仍受前述范围限制。
Table 接收 `columns: [{key, label}]` 和 `rows: [...] | {path}`；单元格按文本输出，不解释 HTML。
Modal 的 trigger 使用 Button 引用，点击只打开本地弹窗，不额外发出 trigger 配置的服务器 action；弹窗内容里的业务按钮正常回传。
Tabs、Modal、Accordion 的本地状态写入 surface 的 `viewState`，快照导入导出会一起保存；这些状态不进入 `sendDataModel` metadata。
`getViewState(surfaceId, JSON.stringify([componentId, scope]))` 与 `setViewState(...)` 可供宿主操作，状态字段为 `tab` 或 `open`。
两端演示下方的“布局、数据与反馈”区域可验证新增组件、保存设置及弹窗。

## 状态与恢复

- `subscribe(listener)` 返回取消订阅函数；`getSnapshot()` 返回冻结的稳定快照。
- `exportSnapshot()` 返回可序列化的独立副本。
- `importSnapshot(snapshot)` 验证所有 surface、Catalog、组件和数据后一次性替换状态，失败保留原状态。
- 每次 `apply` 原子提交；无效消息、未知 surface、重复 create、组件环和危险路径均抛错，由宿主捕获。
- `updateComponents` 按 ID 替换整个组件定义；未涉及的组件保留。
- `updateDataModel` 在指定路径替换值，省略 value 删除值；省略 path 或 `/` 替换整个模型。

快照接口为后续历史恢复提供基础，本轮没有修改聊天历史存储格式。

## 宿主组件

渲染器的 `components` 参数按组件名注册渲染函数，可覆盖内置组件。
回调收到 `RenderContext`：component、scope、resolve、setValue、children、dispatch 等。
新增组件时，必须给 `new A2UIClient([{catalogId, schema}])` 提供相应 Catalog Schema，再在两端注册渲染函数。
Schema 采用官方结构，含 `$defs.anyComponent`、`$defs.theme`，公共类型引用指向随包提供的 common_types ID。
仅注册渲染函数不会放宽协议校验；只声明宿主实际支持的能力。

## 主题与演示

React / Vue A2UI 与 Chat 共用 `chat-theme/src/primitives.css` 的局部默认样式，构建后包含在各自的 `styles.css` 中，不要求宿主使用 Tailwind 或加载全局主题。默认使用紧凑控件、6px 控件圆角和 10px 面板圆角，观感参考 Tron，但不依赖 Tron。

两端使用现有 `--color-*` 与 `--agent-ui-skin-font` 令牌，并带独立使用时的回退值。
React / Vue 宿主可以在共同祖先上覆盖下列共享令牌，Chat 与 A2UI 会一起生效：

| 令牌 | 默认值 | 用途 |
| --- | --- | --- |
| `--agent-ui-font` | skin font / font-sans / Inter / sans-serif | 字体 |
| `--agent-ui-control-height` | A2UI `2.25rem` / Chat `2rem` | 标准按钮、A2UI 输入框和选择器最小高度 |
| `--agent-ui-control-radius` | A2UI `6px` / Chat `4px` | 控件圆角 |
| `--agent-ui-panel-radius` | A2UI `10px` / Chat `8px` | A2UI 卡片、弹窗和 Chat 提问卡片圆角 |
| `--agent-ui-control-font-size` | `0.875rem` | 控件字号 |
| `--agent-ui-control-padding` | `0.625rem` | 控件水平内边距 |
| `--agent-ui-gap` | A2UI `0.875rem` / Chat `0.75rem` | A2UI 布局间距 |
| `--agent-ui-panel-padding` | A2UI `1.25rem` / Chat `1rem` | A2UI 卡片和弹窗内边距 |
| `--agent-ui-transition-duration` | `120ms` | 控件状态过渡 |

现有 Chat 专用颜色覆盖接口保留；要让两端颜色同步，优先覆盖共享的 `--color-*`。图标按钮、长文本输入和聊天编辑器保留各自用途所需的尺寸。

审批卡片与批量审批共用紧凑按钮样式，默认最小高度 `1.75rem`、字号 `0.8125rem`、圆角 `4px`，可用上述 `--agent-ui-control-*` 令牌覆盖；颜色沿用 A2UI / Chat 的公开颜色令牌和 `--color-*` 回退。只有一条待决定的审批时不显示批量按钮；批次中逐项决定到只剩一条时同样隐藏，仍在所有审批决定后统一提交。

React 演示服务的 `/style-preview.html` 提供 Chat / A2UI 并排预览，支持独立默认、浅色、深色和宿主令牌覆盖。React / Vue A2UI 默认样式共用 `a2ui-core/components.css`。
宿主可导入 `@personai/agent-ui-chat-theme/styles.css` 应用完整现有主题。

```sh
npm run build
npm run dev --workspace=@personai/agent-ui-a2ui-react -- --port 5191
npm run dev --workspace=@personai/agent-ui-a2ui-vue -- --port 5192
```

打开对应地址，连续点击四次“接收下一条消息”，观察 surface → 标题/占位 → 数据 → 表单补齐。
修改资料并保存，页面显示结构化 action、metadata 和宿主更新后的成功状态。
两端共用 core 包 `./demo` 的固定消息和模拟宿主逻辑。
页面下方还有独立的原子组件展示 surface，包括滑块、三种日期时间输入、图标、图片和本地音视频。
点击“保存偏好”可查看新增输入的结构化 action 和宿主更新结果。

日期模式写入 `YYYY-MM-DD`，时间模式写入 `HH:mm:ss`（也接受分钟精度）。
日期时间模式按浏览器本地时区显示，编辑后写回带 `Z` 的 ISO 时间。动态 min / max 使用同一转换规则。
媒体仅接收 http、https、blob 或相对 URL；危险协议不生成 src。图标 SVG 仅接受 path 数据，不解释 HTML。

## 官方实现评估与来源

核对 [v0.9.1 协议](https://a2ui.org/specification/v0.9.1-a2ui/) 与官方仓库提交 `03b77ae95a12f5040754f8cc48a8fa9ab761c377`。
官方 `typescript/web_core` 包当前为 0.12.0，包含 Lit、signals、Zod 等依赖，协议代码生成输入为 v0_9 等目录。
官方已有 React 渲染器，没有对应 Vue 渲染器。本轮复用官方 server_to_client Schema，按最小支持范围裁剪公共类型和 Catalog；不引入官方运行时。
保留 `packages/a2ui-core/LICENSE.a2ui`。`common_types.json` 禁用了函数调用；`catalog.json` 裁剪为79 个组件及上述能力。


## 统计展示组件

React 与 Vue 共用 Core 渲染和数据绑定，支持以下组件：

| 组件 | 必填属性 | 可选属性 |
| --- | --- | --- |
| `Statistic` | `value` | `label`、`precision`（0–20）、`grouping`、`prefix`、`unit` |
| `Trend` | `value` | `label`、`precision`、`unit`、`positiveIsGood`（默认 true） |
| `Sparkline` | `values` | `label` |
| `Meter` | `value` | `label`、`min`（默认 0）、`max`（默认 100）、`low`、`high`、`optimum`、`unit` |
| `Chart` | `type`、`labels`、`series` | `label` |
| `DescriptionList` | `items` | `label` |

`value` 支持动态数字绑定，`label`、`prefix`、`unit` 支持动态字符串绑定。
`values`、`labels`、`series`、`items` 支持数组字面量或 `{ "path": "/data" }` 绑定。
`series` 格式为 `[{ "name": "请求量", "values": [12, 18, null, 24] }]`；
`items` 格式为 `[{ "label": "时间范围", "value": "最近 7 天" }]`。

`Chart.type` 支持 `line`、`bar`、`area`、`pie`、`donut`。
折线和面积图按 null / 缺失值断开，柱状图支持负数；饼图和环图使用首个系列，忽略负值，零总量显示空态。
图表提供图例、SVG 名称、数据点标题，以及可展开的完整数据表。
长维度名称或大量数据可通过数据表查看，适合对话内的小型统计图。

缺失或非有限数字显示 `—`，空数组显示“暂无数据”。`Meter` 将显示值限制到有效区间，
`max <= min` 显示空态。`Trend` 的箭头表示数值方向，颜色由 `positiveIsGood` 决定，
例如延迟下降可设置 `positiveIsGood: false`。

两端演示页均包含指标组合、五种图表、缺失点、空态、统计口径和“更新统计数据”按钮，
用于验证绑定更新后指标、阈值和图表同步变化。

演示页将全部 79 个通用组件逐个展示，并标明组件名称；每个独立示例使用独立 Surface 和数据模型。
组合示例放在独立区域，标明参与组合的组件；顶部导航可跳转到两个区域。

默认样式采用紧凑的控件尺寸、细边框、暖白表面和 Tron 主题色，React / Vue 共用 `a2ui-core/defaults.css`。宿主仍可通过 `--agent-ui-*` 尺寸变量和 `--color-*` 颜色变量覆盖；样式仅作用于 `.a2ui-surface`。

完整 A2UI 主题接口见 [变量清单](a2ui-theme.md)，机器可读索引见 [a2ui-theme-tokens.json](a2ui-theme-tokens.json)。
根挂点为 `data-theme-part="a2ui"`，组件根挂点为 `a2ui-<组件名称小写>`，例如 `a2ui-statistic`、`a2ui-chart`。

## shadcn Base UI 对应组件

新增 40 个原子组件，React / Vue 复用 Core 实现、Schema 和主题变量。完整对应关系、属性和支持边界见 [组件覆盖表](a2ui-shadcn-coverage.md)。演示页共 79 个独立示例，组合示例另列。

## 内置交互组合卡片

Agent Catalog 的 `QuestionCard`（AskUser）和 `ApprovalCard` 是固定组合组件，React / Vue 共用渲染实现。原生问答通过 `interactionEnvelopes` 使用同一个 `QuestionCard`；Agent 提供问题、选项、说明和回答设置，客户端负责排版和操作。

`QuestionCard` 固定为题目与翻题导航、无编号选项、底部自定义输入和操作按钮。卡片直接从题目开始，不展示顶部说明（`intro`）。选项标题与说明位于同一列，长文本自动换行；翻题保留已有答案，支持 Enter 确认、Shift+Enter 换行以及跳过。提交中、已回答和过期状态禁止修改。组合卡片不接受 Agent 指定 CSS 或自行拼装内部布局。

自定义多字段表单继续使用 `Field`、`Select`、`Textarea` 等原子组件。审批仍由宿主工具策略创建和处理，`ApprovalCard` 只负责显示与收集决定。

宿主通过 [主题变量](a2ui-theme.md) 调整外观，通过公开的 `data-theme-part` 挂点定位子区域。
