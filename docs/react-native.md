# React Native 聊天与 A2UI

Agent UI 为 React Native / Expo 宿主提供两个平台包，并与 Web 包共享协议逻辑：

| 包 | 作用 |
| --- | --- |
| `@personai/agent-ui-chat-core/headless` | 平台无关的消息、转录、AG-UI、工具展示、历史/A2UI 交互逻辑 |
| `@personai/agent-ui-a2ui-react-native` | A2UI catalog → RN 原语渲染器（`Text`/`View`/`TextInput`/`Pressable`/`ScrollView`） |
| `@personai/agent-ui-chat-react-native` | `ChatPanel`/`MessageList`/`MessageBubble`/`Composer`/`ApprovalCard`/`ToolCard`/`A2UISurface` |

React Native 宿主**不要**直接引入 `chat-core` 根入口、`chat-react` 或 `a2ui-react`：根入口包含 DOM 模块和 `mermaid`，后两者依赖 DOM/CSS。`chat-core/headless` 只导出平台无关模块，`a2ui-core` 的 `A2UIClient`/`Surface`/`Action` 契约保持共用。

```text
RPC 客户端 / AG-UI 事件
        │  ChatMessage / ChatUserInputRequest / ChatA2uiSession
        ▼
@personai/agent-ui-chat-core/headless   （消息排序、工具标题、历史、交互信封）
        │
        ▼
@personai/agent-ui-chat-react-native    （ChatPanel → FlatList / Composer / ApprovalCard）
        │  A2UIClient + surfaceId
        ▼
@personai/agent-ui-a2ui-react-native    （renderSurface + RN 元素映射）
```

## 安装

```sh
npm install --save-exact \
  @personai/agent-ui-chat-react-native@1.0.0-preview.18 \
  @personai/agent-ui-a2ui-react-native@1.0.0-preview.18 \
  @personai/agent-ui-chat-core@1.0.0-preview.18
```

`react`（>= 19.2）与 `react-native`（>= 0.70）由宿主提供，都是 peer dependency。两个 RN 包不导出样式入口，主题通过 JS token 传入，不涉及 CSS。

## 聊天面板

```tsx
import { useState } from "react";
import { SafeAreaView } from "react-native";
import { ChatPanel } from "@personai/agent-ui-chat-react-native";
import type {
  ChatMessage,
  ChatUserInputAnswer,
  ChatUserInputRequest,
} from "@personai/agent-ui-chat-core/headless";

export function ChatScreen({
  messages,
  requests,
  sending,
  send,
  stop,
  answer,
}: {
  messages: ChatMessage[];
  requests: ChatUserInputRequest[];
  sending: boolean;
  send: (text: string) => void;
  stop: () => void;
  answer: (answers: ChatUserInputAnswer[]) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ChatPanel
        draft={draft}
        messages={messages}
        onAnswerUserInput={answer}
        onDraftChange={setDraft}
        onSend={() => {
          if (!draft.trim()) return;
          send(draft);
          setDraft("");
        }}
        onStop={stop}
        sending={sending}
        userInputRequests={requests}
      />
    </SafeAreaView>
  );
}
```

`ChatPanel` 是纯展示组件：消息、待回答交互和发送/停止回调都由宿主提供，状态与 `chat-core` 类型一致。

### `ChatPanel` 主要 props

| prop | 类型 | 说明 |
| --- | --- | --- |
| `messages` | `ChatMessage[]` | `chat-core` 历史/转录消息 |
| `draft` / `onDraftChange` | `string` / `(value: string) => void` | 受控输入区草稿 |
| `onSend` | `(mode?: ChatSubmitMode) => void` | 发送当前草稿 |
| `onStop` | `() => void` | 运行中停止 |
| `sending` / `sendDisabled` / `disabledInput` | `boolean` | 运行态控制 |
| `userInputRequests` / `onAnswerUserInput` | `ChatUserInputRequest[]` / `(answers: ChatUserInputAnswer[]) => void` | 原生审批/问答 |
| `runtime` / `onA2UIAction` | `ChatA2uiSession` / `ChatA2uiActionHandler` | A2UI 会话与动作回传 |
| `showHeader` / `showComposer` / `showIdentity` | `boolean` | 布局开关 |
| `theme` | `Partial<ChatReactNativeTheme>` | RN 主题 token |

## A2UI 表面

`A2UISurface` 复用 `a2ui-core` 的 `renderSurface`，因此数据绑定、校验、`ActionMessage` 信封与 Web 端一致，只替换元素创建：

```tsx
import { A2UIClient, A2UISurface } from "@personai/agent-ui-a2ui-react-native";
import { AGENT_CATALOG_ID } from "@personai/agent-ui-chat-core/headless";

const client = new A2UIClient();
client.apply({
  version: "v0.9.1",
  createSurface: { surfaceId: "greeting", catalogId: AGENT_CATALOG_ID },
});

<A2UISurface
  client={client}
  surfaceId="greeting"
  onAction={(message, metadata) => submitAction(message, metadata)}
/>;
```

### 映射规则

| A2UI / catalog | React Native |
| --- | --- |
| `Text`、`h1`–`h5`、`strong`、`code` | `Text`（按 variant 取字号） |
| `Card` | 带边框/圆角/内边距的 `View` |
| `Row` / `Column` | `View`（`flexDirection: row/column`） |
| `Button` | `Pressable` + `Text` |
| `TextField` / `CheckBox` / `ChoicePicker` | `TextInput` / `Pressable` 勾选 |
| `List` / `Grid` | `View`（可横向） |
| `Image` / `Video` / `AudioPlayer` | `Image` / 占位符（宿主可注册自定义组件） |
| `Slider` / `Progress` / `Icon` | 只读文本或进度条 / 图标降级为项目符号 |
| 未知组件 | `Unsupported component: <name>` 文案 |

`components` prop 可注册自定义渲染器覆盖任意组件（签名为 `(context: RenderContext) => ReactNode`）。复杂组件（地图、富文本编辑器等）可以只在宿主侧用 WebView 兜底，但不要把整个会话塞进 WebView。

### 主题 token

CSS 变量映射为 JS token，避免引入 `chat-theme` 的 CSS：

```tsx
import { defaultA2UIReactNativeTheme } from "@personai/agent-ui-a2ui-react-native";

const theme = {
  ...defaultA2UIReactNativeTheme,
  primaryColor: "#0a7ea4",
  textColor: "#111827",
};
```

`A2UIReactNativeTheme` 字段：`textColor`、`mutedTextColor`、`surfaceColor`、`borderColor`、`primaryColor`、`primaryTextColor`、`dangerColor`、`borderRadius`、`spacing`。`ChatReactNativeTheme` 在此基础上增加 `panelColor`、`userBubbleColor`、`userBubbleTextColor`、`assistantBubbleColor`。

## 宿主对接要点

- RPC 事件本身就是 AG-UI 事件：沿用 `chat-core/headless` 的 `buildTranscriptPresentation`、`buildAguiUserWorkCards`、`toolDisplayName` 等函数，不要另写一套事件名。
- 审批/问答答案优先使用 `nativeUserInputAnswer` / `nativeUserInputBatchAnswer`（`ChatUserInputAnswerInput`），保留 resume 载荷。
- A2UI 快照持久化和增量应用使用 `ChatA2uiSession`（`chat-core/headless`），`MessageBubble` 与 `ApprovalCard` 会直接消费。
- `ApprovalCard` 由 `createInteractionClient` + A2UI 交互组件渲染，因此批准/拒绝按钮、过期和状态文案与 Web 端一致。
- `MessageBubble` 渲染 Markdown 正文（标题、列表、代码、表格等）、附件名和 A2UI 表面；Mermaid、文本批注选择仍是 Web 专属能力。

## 已知边界

- 图标组件没有内置图标库，降级为项目符号；需要图标时用 `components` 覆盖 `Icon`。
- `QuestionCard` 多问题导航依赖 `queueMicrotask`，需要 RN 运行时提供该全局（Hermes/React Native 0.70+ 已提供；如宿主环境缺失需自行 polyfill）。
- RN 包不导出 CSS 样式入口；主题通过上表 token 控制。
- 仅当宿主显式支持时才使用 `react-native-web`，它负责 RN → Web，不负责 Web 组件 → RN。