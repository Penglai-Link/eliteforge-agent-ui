# @personai/agent-ui-chat-react-native

最小可用的 React Native 聊天组件集，状态类型来自 [`@personai/agent-ui-chat-core/headless`](../chat-core)（平台无关子路径，不引入 DOM/mermaid），A2UI 由 [`@personai/agent-ui-a2ui-react-native`](../a2ui-react-native) 渲染。

## 安装

```sh
npm install --save-exact \
  @personai/agent-ui-chat-react-native@1.0.0-preview.16 \
  @personai/agent-ui-chat-core@1.0.0-preview.16
```

peer dependencies：`react`（>= 19.2）、`react-native`（>= 0.70）。不导出 CSS 入口。

## 组件

| 组件 | 说明 |
| --- | --- |
| `ChatPanel` | 头部 + `MessageList` + 待回答审批卡 + `Composer` |
| `MessageList` | `FlatList` 虚拟化消息列表，空态文案、新消息自动滚底 |
| `MessageBubble` | 身份/时间、Markdown 正文、附件名、内嵌 A2UI 表面 |
| `Composer` | 受控多行输入 + 发送/停止按钮 |
| `ApprovalCard` | 复用 `chat-core` 的 `createInteractionClient` 与 A2UI 交互组件渲染审批/问答 |
| `ToolCard` | 可折叠工具卡片，标题来自 `presentToolCall`，结果来自 `toolResultPreview` |
| `A2UISurface` / `A2UIRenderer` | 从 `a2ui-react-native` 透传，方便单包接入 |

## 用法

```tsx
import { useState } from "react";
import { ChatPanel } from "@personai/agent-ui-chat-react-native";
import type { ChatMessage } from "@personai/agent-ui-chat-core/headless";

<ChatPanel
  messages={messages}
  draft={draft}
  onDraftChange={setDraft}
  onSend={(mode) => send(draft, mode)}
  onStop={stop}
  sending={running}
  userInputRequests={requests}
  onAnswerUserInput={(answers) => answer(answers)}
/>;
```

`ChatPanel` 不持有传输层：消息和交互请求由宿主（Tron/PersonAI-Mobile 的 RPC 客户端）提供，A2UI 增量通过 `ChatA2uiSession` 应用。

## 主题

`ChatReactNativeTheme` 在 A2UI token 基础上增加 `panelColor`、`userBubbleColor`、`userBubbleTextColor`、`assistantBubbleColor`；通过 `theme` prop 传入，所有组件共享 `defaultChatReactNativeTheme` 默认值。

## 边界

- 不依赖 `chat-react`、`a2ui-react`、`react-markdown`、`lucide-react` 或任何 CSS。
- Markdown 由本包内置的 RN 渲染器提供：标题、粗体/斜体/删除线、行内与代码块、列表、引用、链接和 GFM 表格；不抓取远程图片，HTML 不渲染。
- Mermaid、文本批注选择、历史侧栏和悬浮窗口仍是 Web 专属能力，本包不提供。
- 完整接入与宿主对接约定见 [React Native 聊天与 A2UI](../../docs/react-native.md)。