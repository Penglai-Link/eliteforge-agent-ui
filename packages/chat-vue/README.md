# @personai/agent-ui-chat-vue

Vue 3 聊天界面和运行时组件。包负责展示会话、消息、附件、AG-UI 事件和运行状态；宿主通过 `ChatAdapter` 对接自己的服务，组件不绑定具体后端。

## 安装

```sh
npm install @personai/agent-ui-chat-vue @personai/agent-ui-chat-core @personai/agent-ui-chat-theme
```

应用入口引入主题和组件样式：

```ts
import "@personai/agent-ui-chat-theme";
import "@personai/agent-ui-chat-vue/styles.css";
```

## 快速试用

```vue
<script setup lang="ts">
import { ChatRuntimeWindow } from "@personai/agent-ui-chat-vue";
import { createMockChatAdapter } from "@personai/agent-ui-chat-core";

const adapter = createMockChatAdapter();
</script>

<template>
  <ChatRuntimeWindow :adapter="adapter" :config="{ floating: false, title: '助手' }" />
</template>
```

模拟 adapter 会回显消息并生成 AG-UI 流事件，无需后端。包内 `npm run dev` 页面同样使用该模拟 adapter。

## 接入自己的后端

宿主实现 `ChatAdapter`，把会话、消息和流事件映射为 `@personai/agent-ui-chat-core` 的通用类型。至少需要提供 `createSession`、`deleteSession`、`loadMessages`、`loadAguiEvents` 和 `streamMessage`。流式过程中通过 handlers 报告文本片段和 AG-UI 事件。

只有后端确实支持时，才声明 `supportsActiveRun`、`supportsSteer`、`supportsStop` 等能力，并实现 `getActiveRun`、`steerMessage`、`stopRun`。停止后端运行需要 adapter 调用对应控制接口；断开事件流只表示停止接收事件。

```vue
<script setup lang="ts">
import { ChatRuntimeWindow } from "@personai/agent-ui-chat-vue";
import type { ChatAdapter } from "@personai/agent-ui-chat-core";

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

组件文案可通过 props、主题 CSS 变量及 `@personai/agent-ui-chat-theme` 覆盖；头部、侧栏和底部可用 `#header`、`#sidebar`、`#footerAddon` slots 扩展。

`ChatPanel`、`ChatWindow` 和 `ChatRuntimeWindow` 支持 `#composerTop`，对应 React 的 `composerTop`：内容位于输入框外部上方，适合放置工作目录、Agent 等会话控件。`#composerHeader` 位于输入框内部，`#footerAddon` 位于输入框底部工具栏。也可通过 `composerTop` prop 传入 Vue 组件；同时提供时优先使用 slot。

```vue
<ChatRuntimeWindow :adapter="adapter" :config="{ floating: false }">
  <template #composerTop>
    <div class="conversation-controls">
      <DirectorySelector />
      <AgentSelector />
    </div>
  </template>
</ChatRuntimeWindow>
```

上例的 `DirectorySelector`、`AgentSelector` 由宿主提供。设置 `:show-composer="false"` 的面板或窗口不渲染 `composerTop`。运行时压缩上下文期间，插槽中的原生表单控件会与 React 一样通过 `fieldset disabled` 禁用。

历史定位栏默认显示，可通过 `:show-history-rail="false"` 关闭。滚动到底部时选中最新消息，向上滚动时跟随当前视口；点击标记可跳转，悬停或聚焦可预览消息。

## 工具展示

正文始终独立显示；思考与工具按相邻正文分段折叠，不会因同一运行又产生回复而隐藏之前的正文。展开过程后，每个连续工具阶段按工具调用数量展示：

```text
0 个调用 -> 不展示工具卡片
1 个调用 -> 直接展示工具卡片
多个调用 -> 分组摘要 -> 展开后展示工具卡片
```

一次调用中的批量条目仍属于同一个工具调用。实时运行、历史恢复和事件重放均遵循此规则。

当前源码中，React/Vue 工具分组标题只显示已开始的工具调用总数，使用 `workRailLabels.tool.group(count)`，例如“13 个工具调用”；失败的调用也计入总数，一次批量调用计为一次。分组不再按命令、搜索、读写或其他操作分类统计，旧 `groupSummary` 回调保留类型兼容但不再调用。展开后的工具明细保持原有展示。消费方需安装包含此变更的 npm 版本后生效。

## 导出

- `ChatRuntimeWindow`：包含会话和消息状态管理的完整运行时。
- `ChatPanel`：宿主自行管理状态时使用的低层聊天面板。
- `ChatWindow`：悬浮、拖动和调整大小的聊天窗口。

完整 props 与 adapter 类型以包导出的 TypeScript 声明为准。

只读会话可设置 `showComposer={false}`（Vue 使用 `:show-composer="false"`），复用相同的消息、工作过程和工具卡片，不渲染输入框。

Finished context-compaction notices can expand block details supplied through `HistoryStep.compaction` or the live `agent.memory.compaction.details` event. Translate them with `workRailLabels.notices.compactionBlock`, `compactionNoChanges` and `compactionDetailsUnavailable`. This addition is available from `1.0.0-preview.5`; see `docs/integration-guide.md`.

图片附件及结构化历史的图片以紧凑缩略图显示，点击查看原图。可通过 `--agent-ui-chat-image-thumbnail-width`、`--agent-ui-chat-image-thumbnail-height` 和 `--agent-ui-chat-image-thumbnail-radius` 调整，默认分别为 `112px`、`80px`、`10px`；此行为适用于当前源码，发布状态以 npm 版本为准。

用户历史图片与实时附件归入对应用户消息组，缩略图位于消息正文上方并沿右边缘对齐；多张图片自动换行，点击仍打开原图预览。助手和系统消息不使用用户消息的右对齐分组。

Since `1.0.0-preview.7`, work rails clear resolved question pauses and use a local monotonic clock for live elapsed time. `chat-core` exports `WorkElapsedClock(initialElapsedMs)`, `setRunning(running, now?)`, and `elapsed(now?)`; optional clock values use milliseconds on the same monotonic time base.
