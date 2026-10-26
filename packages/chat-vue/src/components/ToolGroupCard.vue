<script setup lang="ts">
import { ChevronDown, ChevronRight, Terminal } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { defaultToolActionSummaryLabel, summarizeToolActions, type ChatWorkRailLabels, type ToolGroupWorkCard } from "@eliteforge/agent-ui-chat-core";
import ToolCard from "./ToolCard.vue";

const props = defineProps<{
  card: ToolGroupWorkCard;
  labels?: ChatWorkRailLabels;
  statusLabels?: Record<string, string>;
  failedStatuses?: Record<string, boolean>;
  locale?: string;
  autoExpanded?: boolean;
}>();

const toolCards = computed(() =>
  props.card.toolCards.filter((tc) => tc.started),
);
const hasRunningTool = computed(() =>
  toolCards.value.some((tc) => tc.started && !tc.ended && !tc.result),
);
const summary = computed(() => props.labels?.tool?.groupSummary?.(summarizeToolActions(toolCards.value))
  ?? defaultToolActionSummaryLabel(summarizeToolActions(toolCards.value)));
const expanded = ref(props.autoExpanded ?? false);

watch(
  () => props.autoExpanded,
  (value) => {
    expanded.value = value ?? false;
  },
  { immediate: true },
);
</script>

<template>
  <section
    v-if="toolCards.length > 0"
    :aria-label="props.labels?.tool?.ariaLabel ?? 'Tool run steps'"
    class="ef-chat__rail-entry"
  >
    <button
      :aria-expanded="expanded"
      class="ef-chat__rail-entry-toggle"
      type="button"
      @click="expanded = !expanded"
    >
      <span class="ef-chat__rail-entry-main">
        <span class="ef-chat__rail-entry-icon">
          <Terminal :class="{ 'animate-pulse': hasRunningTool }" :size="15" />
        </span>
        <span
          class="ef-chat__rail-entry-summary ef-chat__rail-entry-summary--strong"
        >
          {{ summary }}
        </span>
      </span>
      <span class="ef-chat__rail-entry-chevron">
        <ChevronDown v-if="expanded" :size="14" />
        <ChevronRight v-else :size="14" />
      </span>
    </button>
    <ol v-if="expanded" class="ef-chat__rail-entry-list">
      <li v-for="tc in toolCards" :key="tc.id">
            <ToolCard :card="tc" :labels="props.labels" :locale="props.locale" :nested="true" :status-label="props.statusLabels?.[tc.id]" :status-failed="props.failedStatuses?.[tc.id]" />
      </li>
    </ol>
  </section>
</template>
