# EliteForge Agent UI 接入指南

本文说明如何在 Web 应用中接入公共聊天组件和终端组件。组件负责界面和交互；宿主应用负责业务 API、认证，以及服务端运行环境。

## 1. 选择要接入的包

| 需求 | 使用的包 | 宿主需要提供 |
|---|---|---|
| React 聊天界面 | `@eliteforge/agent-ui-chat-react` | `ChatAdapter` |
| Vue 3 聊天界面 | `@eliteforge/agent-ui-chat-vue` | `ChatAdapter` |
| 聊天数据类型和协议处理 | `@eliteforge/agent-ui-chat-core` | React/Vue 聊天包会依赖它 |
| 聊天主题 | `@eliteforge/agent-ui-chat-theme` | 按需覆盖 CSS 变量 |
| 浏览器终端 | `@eliteforge/agent-ui-terminal` | `TerminalTransport`；AI 功能还需 `AITransport` |

组件不会直接调用宿主的会话 API 或 Agent API。`chat-core` 定义公共数据类型和 `ChatAdapter` 接口；宿主实现 adapter，在自己的 API 与这些公共类型之间转换：

```text
React / Vue 聊天组件
        ⇅ 调用 / 接收 ChatAdapter
宿主实现的 ChatAdapter
        ⇅ 请求 API，并映射宿主实体和事件
宿主会话、消息、Agent 和 AG-UI 服务

Terminal 组件
        ⇅ TerminalTransport / AITransport 接口
传输实现（包内提供默认实现，也可由宿主实现）
        ⇅ Socket.IO / SSE 或宿主自定义协议
宿主 PTY 服务 / Agent 服务
```

`ChatSession`、`ChatMessage`、`ChatSendResult` 和 AG-UI 事件类型是 chat-core 的公共 UI 契约，不是宿主数据库实体。宿主 adapter 负责双向转换。`ChatModelSelection` 只描述发送给宿主 Agent 的模型选择信息；框架不提供模型厂商 SDK 或模型调用层。

终端包定义 `TerminalSession`、`TerminalTransport` 和 `AITransport` 契约，也提供 Socket.IO PTY 和 SSE AI 的默认客户端。宿主服务符合默认协议时可直接使用；协议不同则由宿主实现对应接口并转换数据。PTY 进程必须由宿主服务端创建、隔离和回收，浏览器组件不会启动 shell 进程。

## 2. 安装

这些包的发布配置指向内部 npm registry。包发布后，在消费项目配置 `.npmrc`：

```ini
@eliteforge:registry=http://nexus.cisdigital.cn/repository/npm-internal/
```

然后按需安装。React 聊天示例：

```sh
npm install @eliteforge/agent-ui-chat-react @eliteforge/agent-ui-chat-core @eliteforge/agent-ui-chat-theme
```

Vue 聊天示例：

```sh
npm install @eliteforge/agent-ui-chat-vue @eliteforge/agent-ui-chat-core @eliteforge/agent-ui-chat-theme
```

终端示例：

```sh
npm install @eliteforge/agent-ui-terminal
```

安装时还要满足对应包声明的 React、Vue 和 xterm peer dependencies。当前仓库尚未发布这些包；发布前可在本仓库运行模拟宿主演示。

## 3. 接入聊天组件

### 3.1 先用模拟宿主验证界面

`createMockChatAdapter()` 会在内存中创建会话、回显消息并生成模拟 AG-UI 事件，不需要后端。

React：

```tsx
import { ChatRuntimeWindow } from "@eliteforge/agent-ui-chat-react";
import { createMockChatAdapter } from "@eliteforge/agent-ui-chat-core";
import "@eliteforge/agent-ui-chat-theme";
import "@eliteforge/agent-ui-chat-react/styles.css";

const adapter = createMockChatAdapter();

export function ChatPage() {
  return (
    <ChatRuntimeWindow
      adapter={adapter}
      config={{ floating: false, title: "项目助手" }}
    />
  );
}
```

Vue 3：

```vue
<script setup lang="ts">
import { ChatRuntimeWindow } from "@eliteforge/agent-ui-chat-vue";
import { createMockChatAdapter } from "@eliteforge/agent-ui-chat-core";
import "@eliteforge/agent-ui-chat-theme";
import "@eliteforge/agent-ui-chat-vue/styles.css";

const adapter = createMockChatAdapter();
</script>

<template>
  <ChatRuntimeWindow
    :adapter="adapter"
    :config="{ floating: false, title: '项目助手' }"
  />
</template>
```

### 3.2 对接宿主的聊天服务

真实接入时，用宿主实现的 adapter 替换模拟 adapter。`ChatAdapter` 负责把宿主协议转换成 chat-core 的通用数据类型。

| Adapter 方法 | 用途 |
|---|---|
| `createSession(input)` | 创建会话并返回 `ChatSession` |
| `deleteSession(sessionId)` | 删除会话 |
| `loadMessages(sessionId)` | 加载会话消息，返回 `ChatMessage[]` |
| `loadAguiEvents(sessionId)` | 加载会话级 AG-UI 事件，返回 `ChatAguiEvent[]` |
| `streamMessage(session, input, handlers, signal)` | 向 Agent 发送消息并返回 `ChatSendResult` |

`streamMessage` 收到文本片段时调用 `handlers?.onDelta(delta)`；收到 AG-UI 流事件时调用 `handlers?.onAguiEvent(event)`。把宿主的会话、消息、事件和最终运行结果分别映射成 `ChatSession`、`ChatMessage`、`ChatAguiStreamEvent` 和 `ChatSendResult`。

最小 adapter 骨架：

```ts
import type { ChatAdapter } from "@eliteforge/agent-ui-chat-core";

export const adapter: ChatAdapter = {
  capabilities: {
    supportsAbort: true,
    supportsAgui: true,
    supportsProtocolReplay: false,
    supportsStreaming: true,
  },

  async createSession(input) {
    return mapSession(await hostApi.createSession(input));
  },
  async deleteSession(sessionId) {
    return mapSession(await hostApi.deleteSession(sessionId));
  },
  async loadMessages(sessionId) {
    return (await hostApi.loadMessages(sessionId)).map(mapMessage);
  },
  async loadAguiEvents(sessionId) {
    return (await hostApi.loadAguiEvents(sessionId)).map(mapAguiEvent);
  },
  async streamMessage(session, input, handlers, signal) {
    const result = await hostApi.streamMessage(session.sessionId, input, {
      signal,
      onDelta: (delta) => handlers?.onDelta?.(delta),
      onEvent: (event) => handlers?.onAguiEvent?.(mapStreamEvent(event)),
    });
    return mapSendResult(result);
  },
};
```

`hostApi` 和 `map*` 是宿主代码：按自己的 API 实现请求和数据转换。不要直接把产品响应对象当作 chat-core 类型返回。

只有后端确实支持时，才开启可选能力：

- `supportsProtocolReplay: true` 时提供 `loadProtocolEvents(sessionId)`。
- `supportsActiveRun: true` 时提供 `getActiveRun(sessionId)`。
- `supportsStop: true` 时提供 `stopRun(session, context)`。该方法必须调用后端停止运行；只中断浏览器流不会停止 Agent。
- `supportsSteer: true` 时提供 `steerMessage(...)`。
- 要启用附件上传或下载，实现 `uploadAttachment` 或 `downloadAttachment`。要启用用户输入请求，设置 `supportsUserInputRequests: true`，并实现 `loadUserInputRequests` 和 `answerUserInputRequestStream`。

把 adapter 传给聊天组件：

```tsx
<ChatRuntimeWindow
  adapter={adapter}
  config={{ floating: false, title: "项目助手" }}
  currentUserDisplayName="访客"
  onSessionChange={(session) => saveCurrentSession(session)}
/>
```

`ChatRuntimeWindow` 管理常见会话与运行状态。宿主要完全控制状态时可使用 `ChatPanel`；要在可移动、可调整大小的悬浮窗中显示聊天时可使用 `ChatWindow`。React 和 Vue 都使用同一个 `ChatAdapter` 类型。

## 4. 接入终端

终端包渲染终端、Shell 命令块和可选的 AI 交互。传输由宿主提供，组件初始化时会连接终端服务：

```ts
import {
  createAITransport,
  createTerminalTransport,
  initTerminal,
} from "@eliteforge/agent-ui-terminal";
import "@eliteforge/agent-ui-terminal/styles.css";

const terminal = initTerminal({
  el: document.querySelector<HTMLElement>("#terminal")!,
  transport: {
    terminal: createTerminalTransport({
      url: "https://your-app.example.com/terminal",
    }),
    ai: createAITransport({
      url: "https://your-app.example.com/api/assistant/stream",
      headers: () => ({
        Authorization: `Bearer ${getAccessToken()}`,
      }),
    }),
  },
  locale: "zh-CN",
  onExit: (code) => closeTerminalTab(code),
  onError: (error) => reportError(error),
});

// 组件卸载或标签页关闭时调用
terminal.dispose();
```

AI 是可选的：省略 `ai` 后，普通终端仍可使用。`createTerminalTransport` 使用 Socket.IO 连接 PTY 服务；若现有服务不是兼容协议，请实现并注入 `TerminalTransport`。若要自定义 AI 通信方式，实现 `AITransport` 的 `request` 和 `stream` 方法。

终端服务至少要负责认证用户、授权工作目录、安全创建 PTY、限制资源并在会话结束时回收进程。不要把 shell 启动权限或服务端凭据放进浏览器代码。`dispose()` 会释放终端、传输和未完成的 AI 请求。

## 5. 主题、文案和布局

- 聊天主题：先引入 `@eliteforge/agent-ui-chat-theme`，再用 CSS 变量覆盖颜色和边框。
- React 聊天组件提供 `headerContent`、`sidebarContent`、`footerAddon` 等扩展点；Vue 组件提供对应插槽。
- 终端可通过 `terminalOptions`、`themeTokens`、`locale` 和 `messages` 设置终端外观及文案。
- 聊天历史时间轴在视口宽度不超过 900px 时自动隐藏。

## 6. 本地调试

在仓库根目录安装依赖后，可分别启动各包的模拟宿主页面：

```sh
npm install
npm run dev --workspace @eliteforge/agent-ui-chat-react
npm run dev --workspace @eliteforge/agent-ui-chat-vue
npm run dev --workspace @eliteforge/agent-ui-terminal
```

这些命令分别启动 React 聊天、Vue 聊天和终端演示。模拟 adapter 只用于界面与交互验证，不会连接产品 API，也不能替代生产环境的宿主 adapter 和服务端。

## 7. 相关文档

- [React 聊天包说明](../packages/chat-react/README.md)
- [Vue 聊天包说明](../packages/chat-vue/README.md)
- [终端包说明](../packages/terminal/README.md)
- [仓库包结构与开发命令](../README.md)

## 宿主迁移时保留的契约

宿主将自己的 Code 字段映射为 UI 的 Id 字段时，须同步处理历史消息、实时事件、主动运行状态、用户问题、附件和恢复回答。
尤其是 `resume[].payload.answers` 中的 question/option 标识，不能只转换外层 `answers`。
宿主扩展字段可放在 `metadata` 中；转换后的 metadata 不代替后端权限检查。

运行中的发送策略依赖结构化错误码。宿主应将其“运行已存在/steer 不可用”等错误映射为公共 `ChatAdapterError` 的相应代码，
并保留 HTTP 状态、错误详情、AbortSignal 与预期 run 标识。不能仅抛普通 Error 导致队列误判。

React/Vue 聊天组件提供 `data-theme-anchor="chat"`、`chat-input`、`chat-message` 和 `dialog` 的宿主主题锚点，
同时保留 `data-theme-part`。摘要栏只使用公开 reasoning summary；已结束的空 reasoning 若拥有工具卡片仍保留，
避免终端过滤 reasoning 时一并丢掉工具执行结果。

Tron 的初始接入使用公共 chat 与 terminal 渲染器，Tron 自己维护 `@tron/chat-agent-ui-adapter`、认证、业务 API 和服务端 PTY。
公共项目修复需要在这里验证后由宿主更新依赖；不能让宿主复制渲染器。当前联合开发使用显式本地路径，发布依赖需另行固定版本。
