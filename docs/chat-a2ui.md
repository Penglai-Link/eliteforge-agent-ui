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
