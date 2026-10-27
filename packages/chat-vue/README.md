# @eliteforge/agent-ui-chat-vue

Vue 3 聊天界面和运行时组件。包负责展示会话、消息、附件、AG-UI 事件和运行状态；宿主通过 `ChatAdapter` 对接自己的服务，组件不绑定具体后端。

## 安装

```sh
npm install @eliteforge/agent-ui-chat-vue @eliteforge/agent-ui-chat-core @eliteforge/agent-ui-chat-theme
```

应用入口引入主题和组件样式：

```ts
import "@eliteforge/agent-ui-chat-theme";
import "@eliteforge/agent-ui-chat-vue/styles.css";
```

## 快速试用

```vue
<script setup lang="ts">
import { ChatRuntimeWindow } from "@eliteforge/agent-ui-chat-vue";
import { createMockChatAdapter } from "@eliteforge/agent-ui-chat-core";

const adapter = createMockChatAdapter();
</script>

<template>
  <ChatRuntimeWindow :adapter="adapter" :config="{ floating: false, title: '助手' }" />
</template>
```

模拟 adapter 会回显消息并生成 AG-UI 流事件，无需后端。包内 `npm run dev` 页面同样使用该模拟 adapter。

## 接入自己的后端

宿主实现 `ChatAdapter`，把会话、消息和流事件映射为 `@eliteforge/agent-ui-chat-core` 的通用类型。至少需要提供 `createSession`、`deleteSession`、`loadMessages`、`loadAguiEvents` 和 `streamMessage`。流式过程中通过 handlers 报告文本片段和 AG-UI 事件。

只有后端确实支持时，才声明 `supportsActiveRun`、`supportsSteer`、`supportsStop` 等能力，并实现 `getActiveRun`、`steerMessage`、`stopRun`。停止后端运行需要 adapter 调用对应控制接口；断开事件流只表示停止接收事件。

```vue
<script setup lang="ts">
import { ChatRuntimeWindow } from "@eliteforge/agent-ui-chat-vue";
import type { ChatAdapter } from "@eliteforge/agent-ui-chat-core";

defineProps<{ adapter: ChatAdapter }>();
</script>

<template>
  <ChatRuntimeWindow
    :adapter="adapter"
    :config="{ floating: false, title: '项目助手' }"
    agent-reply-effect="typewriter"
    :agent-reply-speed="120"
    current-user-display-name="访客"
    @session-change="(session) => console.log(session)"
  />
</template>
```

`agent-reply-effect` 默认为 `off`，可设为 `typewriter` 按字符呈现流式回复；`agent-reply-speed` 表示每秒字符数，范围为 30–240，默认 120。运行中的空回复气泡会在首个文本片段到达后显示。

组件文案可通过 props、主题 CSS 变量及 `@eliteforge/agent-ui-chat-theme` 覆盖；头部、侧栏和底部可用 `#header`、`#sidebar`、`#footerAddon` slots 扩展。

## 工具展示

整轮工作过程可以折叠。展开后，每个连续工具阶段按工具调用数量展示：

```text
0 个调用 -> 不展示工具卡片
1 个调用 -> 直接展示工具卡片
多个调用 -> 分组摘要 -> 展开后展示工具卡片
```

一次调用中的批量条目仍属于同一个工具调用。实时运行、历史恢复和事件重放均遵循此规则。

## 导出

- `ChatRuntimeWindow`：包含会话和消息状态管理的完整运行时。
- `ChatPanel`：宿主自行管理状态时使用的低层聊天面板。
- `ChatWindow`：悬浮、拖动和调整大小的聊天窗口。

完整 props 与 adapter 类型以包导出的 TypeScript 声明为准。
