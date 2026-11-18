<script setup lang="ts">
import { ref } from "vue";
import {
  Composer,
  requestedSkillsFromDraft,
  type ComposerAttachment,
  type ComposerQueuedMessage,
  type ComposerSuggestion,
  type ComposerSubmitMode,
} from "./src";
const suggestions: ComposerSuggestion[] = [
  { kind: "command", name: "clear", description: "清空当前上下文" },
  { kind: "command", name: "compact", description: "整理对话上下文" },
  {
    kind: "skill",
    name: "review",
    displayName: "代码审查",
    description: "检查改动与潜在问题",
  },
  {
    kind: "skill",
    name: "explain",
    displayName: "解释代码",
    description: "说明逻辑与调用关系",
  },
];
const imageUrl =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><rect width="180" height="120" fill="#81a18e"/><circle cx="130" cy="35" r="16" fill="#f8e1a2"/><path d="M0 120L65 40L130 120Z" fill="#2c5744"/></svg>'
  );
async function previewImage(file: File): Promise<string | undefined> {
  if (!file.type.startsWith("image/")) return undefined;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
const initialAttachments: ComposerAttachment[] = [
  {
    id: "image",
    kind: "image",
    imageUrl,
    fileName: "landscape.svg",
    summary: "风景",
    metadata: {},
  },
  {
    id: "file",
    kind: "file",
    fileName: "requirements.md",
    summary: "输入区能力清单",
    metadata: {},
  },
];
const draft = ref(""),
  sending = ref(false),
  disabled = ref(false),
  theme = ref("light"),
  narrow = ref(false);
const attachments = ref(initialAttachments),
  queue = ref<ComposerQueuedMessage[]>([]),
  events = ref<string[]>([]);
function log(value: string) {
  events.value = [value, ...events.value].slice(0, 10);
}
function submit(mode: ComposerSubmitMode = "send") {
  if (!draft.value.trim() && !attachments.value.length) return;
  if (mode === "queue")
    queue.value = [
      ...queue.value,
      {
        id: crypto.randomUUID(),
        input: { content: draft.value || "附件消息" },
      },
    ];
  else sending.value = true;
  log(`${mode}: ${draft.value || "附件消息"} · requestedSkills=${JSON.stringify(requestedSkillsFromDraft(draft.value, suggestions))}`);
  draft.value = "";
  if (mode !== "queue") attachments.value = [];
}
async function attach(file: File) {
  const imageUrl = await previewImage(file);
  attachments.value = [
    ...attachments.value,
    {
      id: crypto.randomUUID(),
      kind: file.type.startsWith("image/") ? "image" : "file",
      imageUrl,
      fileName: file.name,
      contentType: file.type,
      summary: file.name,
      metadata: {},
    },
  ];
  log(`attachment: ${file.name}`);
}
function removeAttachment(id: string) {
  attachments.value = attachments.value.filter((item) => item.id !== id);
  log(`remove attachment: ${id}`);
}
function removeQueue(id: string) {
  queue.value = queue.value.filter((item) => item.id !== id);
  log("remove queue");
}
function editQueue(id: string, content: string) {
  draft.value = content;
  queue.value = queue.value.filter((item) => item.id !== id);
  log("edit queue");
}
function reorderQueue(sourceId: string, targetId: string) {
  const next = [...queue.value];
  const sourceIndex = next.findIndex(item => item.id === sourceId);
  const targetIndex = next.findIndex(item => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [item] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, item);
  queue.value = next;
  log(`reorder queue: ${sourceId} → ${targetId}`);
}
function stop() {
  sending.value = false;
  log("stop");
}
</script>
<template>
  <main>
    <span class="eyebrow">ELITEFORGE / COMPOSER</span>
    <h1>独立消息输入区 · Vue</h1>
    <p>
      输入 / 或 $ 选择命令与技能。Enter 发送，Shift+Enter 换行；运行中 Enter
      排队，⌘/Ctrl+Enter 即时调整。可直接粘贴剪贴板中的图片或文件。
    </p>
    <div class="toolbar">
      <button
        @click="
          theme =
            theme === 'light' ? 'dark' : theme === 'dark' ? 'brand' : 'light'
        "
      >
        主题：{{ theme }}</button
      ><button @click="sending = !sending">
        {{ sending ? "结束运行" : "模拟运行" }}</button
      ><button @click="disabled = !disabled">
        {{ disabled ? "启用输入" : "禁用输入" }}</button
      ><button @click="narrow = !narrow">切换窄屏</button
      ><button @click="attachments = initialAttachments">恢复附件</button>
    </div>
    <section class="stage" :data-theme="theme" :data-narrow="narrow">
      <Composer
        :draft="draft"
        @draft-change="draft = $event"
        @send="submit"
        @stop="stop"
        :sending="sending"
        :disabled-input="disabled"
        :running-submit-modes="['queue', 'steer']"
        :input-suggestions="suggestions"
        auto-focus-composer
        composer-key="demo"
        input-placeholder="输入消息，或用 / 和 $ 选择能力"
        :pending-attachments="attachments"
        show-attachment-control
        :on-attach-file="attach"
        :on-paste-attachment="attach"
        @remove-attachment="removeAttachment"
        :queued-messages="queue"
        reorder-queued-label="拖动排序，也可使用上下方向键调整"
        @reorder-queued-message="reorderQueue"
        @remove-queued-message="removeQueue"
        @edit-queued-message="editQueue"
      >
        <template #composerHeader
          ><span class="header-note"
            >附件预览与自定义头部可以同时显示</span
          ></template
        ><template #footerAddon
          ><label class="addon"
            >模型
            <select aria-label="Model">
              <option>Default</option>
              <option>Fast</option></select
            ><span>扩展区</span></label
          ></template
        >
      </Composer>
    </section>
    <div class="events" role="log">{{ events.join("\n") || "等待操作…" }}</div>
  </main>
</template>
