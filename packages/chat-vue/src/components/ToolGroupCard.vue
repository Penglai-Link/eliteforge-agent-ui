<script setup lang="ts">
import { ChevronDown, ChevronRight, Terminal } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import type { ToolGroupWorkCard } from "@eliteforge/agent-ui-chat-core";
import ToolCard from "./ToolCard.vue";

const props = defineProps<{
  card: ToolGroupWorkCard;
}>();

const toolCards = computed(() =>
  props.card.toolCards.filter((tc) => tc.started),
);
const hasRunningTool = computed(() =>
  toolCards.value.some((tc) => tc.started && !tc.ended && !tc.result),
);
const expanded = ref(false);

watch(
  hasRunningTool,
  () => {
    if (!hasRunningTool.value) expanded.value = false;
  },
  { immediate: true },
);
</script>

<template>
  <section
    v-if="toolCards.length"
    aria-label="Tool run steps"
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
          Ran {{ toolCards.length }}
          {{ toolCards.length === 1 ? "command" : "commands" }}
        </span>
      </span>
      <span class="ef-chat__rail-entry-chevron">
        <ChevronDown v-if="expanded" :size="14" />
        <ChevronRight v-else :size="14" />
      </span>
    </button>
    <ol v-if="expanded" class="ef-chat__rail-entry-list">
      <li v-for="(tc, index) in toolCards" :key="tc.id">
        <ToolCard :card="tc" :nested="true" :step-number="index + 1" />
      </li>
    </ol>
  </section>
</template>
