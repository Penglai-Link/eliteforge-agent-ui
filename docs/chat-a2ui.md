# Chat + A2UI

当前接入以 A2UI v0.9.1 和 EliteForge 自定义 Catalog 为基线。React、Vue 共用协议和交互状态逻辑，分别实现渲染组件；没有声明完整实现官方 Basic Catalog。原 minimal Catalog 仍可读取。

## Tron 的运行链路

```text
内置 Agent → Framework A2UI 插件 → 持久化 → CUSTOM / agent.a2ui
                                              ↓
Tron ChatAdapter → ChatRuntimeWindow → 会话级 ChatA2uiSession → A2UI Renderer
                                              ↓ 用户操作
                                   Adapter → Tron → Framework → Agent
```

Framework 负责协议校验、surface 归属、生命周期、持久化、动作去重及 Agent 恢复。公共 UI 负责组件渲染、本地填写状态、提交状态与历史展示。Tron 负责鉴权、工作区权限、HTTP/SSE 和产品字段映射。

普通文本、Markdown 和附件仍通过原消息链路展示。不会从 Markdown 代码块中猜测或执行 A2UI。

## Agent 怎样创建组件

A2UI 是可选能力。宿主安装 Framework 的 `A2uiPack`，Agent 选择对应工具、上下文和 `a2ui-interface` 技能，并且客户端声明兼容的 Catalog 后，才提供这套能力。没有安装或关闭时，普通聊天、业务工具和原生提问、审批沿用原链路。

插件通过 `ContextContributor` 注入简短指引，技能正文和组件 Schema 按需加载：

```text
简短指引 + 技能摘要
  → skill_load(name: "a2ui-interface")
  → skill_read_resource（按需读取 Catalog 索引、具体组件或示例）
  → tool_search（a2ui 领域）
  → tool_execute（a2ui_publish / a2ui_request_input）
```

客户端能力协商和权限检查通过后，Framework 插件提供的工具可通过网关搜索与调用。Tron 负责客户端能力声明、产品文案和权限配置。

可使用两个生成工具：

- `a2ui_publish`：发布、更新、删除普通卡片，创建时明确选择 `Display` 或 `Reusable`。
- `a2ui_request_input`：发布 `SubmitOnce` 表单，提供答案 Schema，绑定真实 interaction，提交后恢复原运行。

Agent 提交标准 JSON 信封：`createSurface`、`updateComponents`、`updateDataModel`、`deleteSurface`。插件校验通过并完成持久化后，才发送流事件。生命周期、版本和归属存放在 Framework 元数据中，不改写标准信封。

| 生命周期 | 用途 | 用户提交后的行为 |
| --- | --- | --- |
| Display | 报告、状态展示 | 只读，Agent 可更新 |
| SubmitOnce | 一次性表单、提问、审批 | 恢复原运行，已处理后只读 |
| Reusable | 查询、筛选、参数调整 | 每次操作启动新一轮，Agent 可更新原卡片 |

卡片使用 Catalog 中声明的组件，例如 Column、Text、TextField、Button。原生 `ask_user` 和工具审批由 Framework 投影成 QuestionCard、ApprovalCard；两种组件都有 React、Vue 实现。模型自行生成的审批外观不能获得工具执行权限。

## ChatRuntimeWindow 的会话级接入

每个会话持有一个 `ChatA2uiSession`。历史快照和实时事件应用到同一份投影，surface 按消息锚点显示；纯 A2UI 消息也可展示。

- 通过 Adapter 的 `loadA2uiState` 加载快照。
- 增量应用事件、跳过重复事件；发现版本缺口时重新读取快照。
- 按更新路径合并服务端数据，保留无关字段的本地填写内容。
- 普通发送和动作附带对应所有者的 `sendDataModel` 元数据。
- 删除后重建同名 surface 使用新的实例 ID，旧页面动作不能提交到新卡片。
- 归档会话只读；已处理、过期或失效的 interaction 禁止再次提交。

可重复卡片的网络提交由 Runtime 调用 Adapter 的 `sendA2uiActionStream` 完成。`onA2UIAction` 是完成后的宿主通知，不应再次发请求。一次性提问、审批和表单通过已有的 answers/resume 链路提交，绑定以服务端 interaction 为准。

Tron 提供两个接口：

- `GET /api/v1/chats/sessions/{sessionCode}/a2ui-state`
- `POST /api/v1/chats/sessions/{sessionCode}/a2ui/actions/stream`

动作包含 `actionId`、`surfaceInstanceId`、`expectedRevision`、标准 action 信封及 metadata。Framework 校验归属、生命周期和版本，并将动作关联稳定 run；重复提交观察原运行。冲突或提交失败时保留本地输入。

普通 surface 复用 Framework 的 SessionLifecycleStore，在 `framework.a2ui.v1` 命名空间持久化；一次性交互以 InteractionStore 为事实来源。Tron 没有新增独立的 surface 数据库或审批执行机制。

## 直接使用 ChatPanel

不使用 Runtime 时，也可以直接在消息中传入协议数据：

```ts
const message = {
  // 其余 ChatMessage 字段照常填写
  content: "请确认下面的信息",
  a2ui: {
    messages: [/* 按顺序排列的 A2UI v0.9.1 信封 */],
    surfaceIds: ["profile"],
  },
};
```

这个独立用法由宿主通过 `onA2UIAction` 接管提交，并保存服务端确认的协议数据；它与 Runtime 的会话级 Adapter 接入不同。需要跨消息更新、快照恢复和统一提交管理时，应使用 Runtime 接入。

非法协议只影响对应卡片的展示。聊天主题继续使用现有 token，文案由宿主提供。

## 表单校验与必填提示

表单默认最大宽度为 `36rem`，普通 A2UI surface 为 `56rem`，均不超过宿主可用宽度。表单使用轻边框、统一内边距和字段间距；提交按钮在宽屏按内容宽度显示，在窄容器中铺满。响应式规则依据 surface 容器宽度，Dude 弹框与移动端同样生效。宿主可通过 `--agent-ui-a2ui-form-max-width`、`--agent-ui-a2ui-surface-max-width`、`--agent-ui-a2ui-form-padding`、`--agent-ui-a2ui-form-gap`、`--agent-ui-a2ui-form-radius` 和 `--agent-ui-a2ui-form-background` 调整外观，React/Vue 共用实现。

React 和 Vue 的 `ChatUserInputCard` 通过 `createInteractionClient` 将持久化交互的 `responseSchema` 注册到同一个 `A2UIClient`。独立使用时调用 `client.setResponseSchema(surfaceId, schema)`；默认校验动作的 `context.response`，可用第三个参数指定上下文字段。校验位于 `createAction`，直接调用动作 API 也不能绕过。

```text
responseSchema → 共享校验器 → 字段错误、必填星号、提交拦截
                       ↓ 合法答案
                  Framework 再校验 → 恢复交互
```

默认使用 JSON Schema 2020-12，也支持显式 draft-07、2019-09。前后端开启已知 `format` 校验，不转换类型、不注入默认值、不删除额外字段、不加载远程或文件引用。未知 format 与标准注解一样不参与断言。支持 required、字符串长度/正则/格式、数值范围/整数/倍数、枚举、数组、对象、内部引用和组合/条件规则。非法 schema 阻止提交并展示表单级错误。

`required` 控制属性是否必须存在以及星号；非空文本需要同时声明 `minLength: 1`，多选至少一项需要 `minItems: 1`，必须同意需使用 `const: true`。校验失败保留原输入，显示字段错误并聚焦首个无效控件；修改后重新校验，无对应控件的错误在提交按钮旁显示一条简短提示，不在表单顶部重复汇总。

有 responseSchema 的数字字段以 schema 为提交约束，不能只在组件配置 min/max/step 而省略 schema 中的 minimum/maximum/multipleOf。数字草稿中的未完成输入不能作为 null 提交。Slider 默认 step=1；小数场景声明正数 step，schema 的 multipleOf 优先，integer 使用整数步长。拖动时按步长生成实际数值，不仅格式化显示。已提交的历史答案不改写。

等待交互响应时，输入区显示居中的锁定提示并保留草稿。宿主自定义输入控件必须消费同一锁定状态：React 在 Composer 后代中使用 `useComposerDisabled`（由 composer-react 和 chat-react 导出）；Vue 使用 `footerAddon` 作用域插槽的 `disabled`。修改会话输入的按钮使用原生 `disabled`，组合控件可用 `fieldset disabled` 与 `inert` 一起限制鼠标和键盘访问；只读用量指标不属于输入操作，可保持可查看。语音输入在锁定时取消录音或识别，快捷键同时停用。

已完成的询问、审批和表单回执按对应工具调用 ID 排在工具之后，并在工具下方缩进展示。历史记录缺少回答时间时不依赖合成时间戳排序；点击回执仍可查看提交内容。React 与 Vue 共用 chat-core 的关联与排序逻辑。
