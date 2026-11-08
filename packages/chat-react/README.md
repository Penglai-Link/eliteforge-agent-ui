# @personai/agent-ui-chat-react

React 聊天界面和运行时组件。包负责展示会话、消息、附件、AG-UI 事件和运行状态；宿主负责把自己的会话服务接到 `ChatAdapter`，组件不假设具体后端。

## 安装

```sh
npm install @personai/agent-ui-chat-react @personai/agent-ui-chat-core @personai/agent-ui-chat-theme
```

需要 React 19。应用入口引入主题和组件样式：

```tsx
import "@personai/agent-ui-chat-theme";
import "@personai/agent-ui-chat-react/styles.css";
```

## 快速试用

无需后端即可用内置模拟 adapter 查看组件：

```tsx
import { ChatRuntimeWindow } from "@personai/agent-ui-chat-react";
import { createMockChatAdapter } from "@personai/agent-ui-chat-core";

export function App() {
  return (
    <ChatRuntimeWindow
      adapter={createMockChatAdapter()}
      config={{ floating: false, title: "助手" }}
    />
  );
}
```

发送消息后，模拟 adapter 会回显内容并产生一组 AG-UI 流事件。包内 `npm run dev` 页面也使用该模拟 adapter。

如果要在首次发送前保持本地草稿，给 `ChatRuntimeWindow` 设置 `allowDraftSession`。组件会直接显示输入框，空白输入不会创建会话；首次有效发送才调用 `adapter.createSession`。创建期间会锁定重复提交，创建失败保留草稿并通过 `onError` 报告，用户可重试。默认关闭该选项，保持原有空会话展示。

宿主可通过 `onPasteAttachment` 接管粘贴文件，在本地暂存附件，再在首次发送时上传；默认附件上传需要先创建会话。

## 接入自己的后端

为宿主实现 `ChatAdapter`，把后端协议转换成 chat-core 的通用类型。最小实现需要声明能力并提供会话、消息、AG-UI 事件和流式发送方法：

```ts
import type { ChatAdapter } from "@personai/agent-ui-chat-core";

const adapter: ChatAdapter = {
  capabilities: {
    supportsAbort: true,
    supportsActiveRun: false,
    supportsAgui: true,
    supportsProtocolReplay: false,
    supportsSteer: false,
    supportsStop: false,
    supportsStreaming: true,
  },
  async createSession(input) { throw new Error("实现宿主的会话创建请求"); },
  async deleteSession(sessionId) { throw new Error("实现宿主的会话删除请求"); },
  async loadMessages(sessionId) { throw new Error("将宿主消息映射为 ChatMessage[]"); },
  async loadAguiEvents(sessionId) { throw new Error("将宿主事件映射为 ChatAguiEvent[]"); },
  async streamMessage(session, input, handlers, signal) {
    // 收到片段时调用 handlers?.onDelta(delta)
    // 收到事件时调用 handlers?.onAguiEvent(event)
    throw new Error("实现宿主的流式发送请求");
  },
};
```

仅在后端支持对应操作时，才声明 `supportsActiveRun`、`supportsSteer`、`supportsStop` 等能力并实现 `getActiveRun`、`steerMessage`、`stopRun`。停止运行必须由宿主 adapter 调用后端控制接口；断开流只代表停止接收事件。

```tsx
<ChatRuntimeWindow
  adapter={adapter}
  config={{ floating: false, title: "项目助手" }}
  agentReplyEffect="typewriter"
  agentReplySpeed={120}
  currentUserDisplayName="访客"
  onSessionChange={(session) => console.log(session)}
/>
```

`agentReplyEffect` 默认为 `off`，可设为 `typewriter` 按字符呈现流式回复；`agentReplySpeed` 表示每秒字符数，范围为 30–240，默认 120。运行中的空回复气泡会在首个文本片段到达后显示。

组件名称、配置和数据类型均不绑定业务项目。文案可通过组件 props、主题 CSS 变量及 `@personai/agent-ui-chat-theme` 覆盖；侧栏、头部和底部可通过 `sidebarContent`、`headerContent`、`footerAddon` 扩展。

## 目标提示

`ChatRuntimeWindow` 和 `ChatPanel` 接受可选的 `goal` 属性，在输入框上方显示宿主提供的目标、状态和进度。宿主传入本地化的 `labels` 和可用操作回调（`onPause`、`onResume`、`onRestart`、`onDelete`）；未提供的操作不会显示。`busy` 禁用全部操作，`resumeDisabled` 单独禁用恢复。传入 `null` 或不传时不显示提示。组件只负责展示和触发回调，目标读取、生命周期与持久化由宿主管理。

## 工具展示

正文始终独立显示；思考与工具按相邻正文分段折叠，不会因同一运行又产生回复而隐藏之前的正文。展开过程后，每个连续工具阶段按工具调用数量展示：

```text
0 个调用 -> 不展示工具卡片
1 个调用 -> 直接展示工具卡片
多个调用 -> 分组摘要 -> 展开后展示工具卡片
```

一次调用中的批量条目仍属于同一个工具调用。实时运行、历史恢复和事件重放均遵循此规则。

## 导出

- `ChatRuntimeWindow`：包含会话和消息状态管理的完整运行时。
- `ChatPanel`：由宿主自行管理状态时使用的低层聊天面板。
- `ChatWindow`：可悬浮、拖动和调整大小的聊天窗口。

各组件完整 props 与 adapter 类型以包导出的 TypeScript 声明为准。

宿主使用统一气泡提示时，设置 `errorDisplay="external"` 并提供 `onError`。发送前的校验和请求错误只通过回调报告，不在输入框上方重复显示；已收到运行失败事件时，只在运行历史中展示，不再重复调用发送错误回调。默认 `inline` 会在输入框上方显示发送错误。

只读会话可设置 `showComposer={false}`（Vue 使用 `:show-composer="false"`），复用相同的消息、工作过程和工具卡片，不渲染输入框。
