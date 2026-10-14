# @eliteforge/agent-ui-composer-vue

可独立使用的 Vue 3 消息输入区。无需创建聊天会话或安装 chat 包。

```vue
<script setup lang="ts">
import { ref } from "vue";
import {
  Composer,
  type ComposerSubmitMode,
} from "@eliteforge/agent-ui-composer-vue";
import "@eliteforge/agent-ui-composer-vue/styles.css";
const draft = ref("");
function send(mode: ComposerSubmitMode = "send") {
  console.log(mode, draft.value);
}
</script>
<template>
  <Composer :draft="draft" @draft-change="draft = $event" @send="send">
    <template #composerHeader>自定义头部</template>
    <template #footerAddon>模型与其他扩展控件</template>
  </Composer>
</template>
```

`composerHeader` 也可以传入组件；组件实例暴露 `focus()` 和 `textarea`。`composerKey` 配合 `autoFocusComposer` 在切换输入上下文时聚焦。

支持发送/停止、排队/即时调整、IME、Shift+Enter 换行、命令/技能建议、技能标签、图片粘贴、附件选择/预览/移除、队列编辑/移除、禁用状态和主题覆盖。上传、发送及队列存储由宿主回调处理。

仓库开发预览：`npm run dev --workspace=@eliteforge/agent-ui-composer-vue`。完整参数与主题说明见 [docs/composer.md](../../docs/composer.md)。
