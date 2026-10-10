<script setup lang="ts">
import { computed } from "vue";
import { chatErrorPresentation, defaultHistoryLabels, historyToolResult, historyBlockUrl, type ChatHistoryLabels, type ChatMessage, type ToolWorkCard } from "@eliteforge/agent-ui-chat-core";
import ReasoningCard from "./ReasoningCard.vue";
import ToolCard from "./ToolCard.vue";
const props = defineProps<{ message: ChatMessage; labels?: ChatHistoryLabels }>();
const labels = computed(() => props.labels ?? defaultHistoryLabels);
const view = computed(() => props.message.history);
const error = computed(() => chatErrorPresentation(view.value?.run?.error ?? "", labels.value.statuses.Failed));
const reasoning = computed(() => view.value?.message.content.filter((b) => b.type === "Reasoning").map((b) => "text" in b ? b.text : "").join("") ?? "");
const tools = computed(() => view.value?.tools.map((tool) => ({ tool, card: {
  id: tool.id, runId: tool.runId, toolCallId: tool.id, toolName: tool.toolName, args: tool.arguments,
  result: historyToolResult(tool), logs: [], parentReasoningId: null, firstMillis: tool.startedAtMs ?? view.value!.message.createdAtMs,
  started: tool.status === "Running", ended: ["Completed", "Failed"].includes(tool.status),
} satisfies ToolWorkCard })) ?? []);
</script>
<template>
  <section v-if="view" class="ef-chat__history-details" :data-history-message-id="message.messageId">
    <ReasoningCard v-if="reasoning" :card="{ id: `${message.messageId}:reasoning`, runId: message.runId ?? '', content: reasoning, summary: reasoning, ended: view.message.status !== 'Running', firstMillis: view.message.createdAtMs, endMillis: view.step?.finishedAtMs ?? null, toolCards: [] }" />
    <template v-for="(block, index) in view.message.content" :key="index">
      <pre v-if="block.type === 'Json'">{{ JSON.stringify(block.value, null, 2) }}</pre>
      <img v-else-if="block.type === 'Media' && block.mimeType.startsWith('image/') && historyBlockUrl(block)" :src="historyBlockUrl(block)!" :alt="block.name ?? block.mimeType" loading="lazy" />
      <template v-else-if="block.type === 'Resource' || block.type === 'Media'">
        <a v-if="historyBlockUrl(block)" :href="historyBlockUrl(block)!" target="_blank" rel="noreferrer">{{ block.name ?? (block.type === 'Resource' ? block.uri : block.mimeType) }}</a>
        <code v-else>{{ block.name ?? (block.type === 'Resource' ? block.uri : block.mimeType) }}</code>
      </template>
    </template>
    <pre v-if="view.message.structured != null">{{ JSON.stringify(view.message.structured, null, 2) }}</pre>
    <div v-for="item in tools" :key="item.tool.id" :data-tool-invocation-id="item.tool.id">
      <small>{{ labels.statuses[item.tool.status] }}</small>
      <ToolCard :card="item.card" :status-label="labels.statuses[item.tool.status]" />
    </div>
    <details v-for="interaction in view.interactions.filter((i) => i.response != null)" :key="interaction.id" :data-history-interaction-id="interaction.id">
      <summary>{{ interaction.prompt.filter((b) => b.type === 'Text').map((b) => 'text' in b ? b.text : '').join('') }} · {{ labels.statuses.Completed }}</summary>
      <pre>{{ JSON.stringify(interaction.response, null, 2) }}</pre>
    </details>
    <div v-if="message.role === 'ASSISTANT' && view.run?.error" role="status">{{ error.summary }}<details v-if="error.details" class="ef-chat__error-details"><summary>{{ /[\u3400-\u9fff]/.test(labels.statuses.Failed) ? "错误详情" : "Error details" }}</summary><pre>{{ error.details }}</pre></details></div>
  </section>
</template>

<style scoped>
.ef-chat__error-details pre {
  max-width: 100%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
