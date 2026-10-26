<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronDown, ChevronRight, CircleAlert, CircleX } from "lucide-vue-next";
import { defaultHistoryLabels, historyWorkCompleted, type ChatMessage, type ChatWorkRailLabels, type ChatHistoryLabels } from "@eliteforge/agent-ui-chat-core";
import StructuredMessageDetails from "./StructuredMessageDetails.vue";
const props = defineProps<{ messages: ChatMessage[]; labels?: ChatWorkRailLabels; historyLabels?: ChatHistoryLabels; showReasoningCards?: boolean; locale?: string }>();
const completed = computed(() => historyWorkCompleted(props.messages));
const expanded = ref(false);
watch(completed, value => { if (value) expanded.value = false; });
const summary = computed(() => {
  const runs = props.messages.flatMap(message => message.history?.run ? [message.history.run] : []);
  const starts = runs.map(run => run.startedAtMs);
  const ends = runs.flatMap(run => run.finishedAtMs == null ? [] : [run.finishedAtMs]);
  const ms = starts.length && ends.length ? Math.max(...ends) - Math.min(...starts) : 0;
  const duration = ms < 1000 ? "<1s" : `${Math.round(ms / 1000)}s`;
  if (!completed.value) return props.labels?.workingFor(duration) ?? `Working for ${duration}`;
  return props.labels?.workedFor(duration) ?? `Worked for ${duration}`;
});
const statusNotice = computed(() => {
  const runs = props.messages.flatMap(message => message.history?.run ? [message.history.run] : []);
  const statuses = props.historyLabels?.statuses ?? defaultHistoryLabels.statuses;
  if (runs.some(run => run.status === "Failed")) return { failed: true, label: statuses.Failed };
  if (runs.some(run => run.status === "Interrupted")) return { failed: false, label: statuses.Interrupted };
  return null;
});
</script>
<template>
  <section class="ef-chat__rail" :aria-label="labels?.ariaLabel ?? 'Agent work'" data-history-work>
    <button class="ef-chat__rail-summary" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      {{ summary }}<ChevronDown v-if="expanded" :size="14" /><ChevronRight v-else :size="14" />
    </button>
    <div v-if="statusNotice" class="ef-chat__run-notice" :class="{ 'ef-chat__run-notice--error': statusNotice.failed }" :role="statusNotice.failed ? 'alert' : 'status'">
      <CircleAlert v-if="statusNotice.failed" :size="16" aria-hidden="true" />
      <CircleX v-else :size="16" aria-hidden="true" />
      <div class="ef-chat__run-notice-content"><div class="ef-chat__run-notice-title">{{ statusNotice.label }}</div></div>
    </div>
    <div v-if="expanded" class="ef-chat__rail-stack">
      <StructuredMessageDetails v-for="message in messages" :key="message.messageId" :message="message" work-only :show-reasoning-cards="showReasoningCards" :labels="historyLabels" :locale="locale" />
    </div>
  </section>
</template>
