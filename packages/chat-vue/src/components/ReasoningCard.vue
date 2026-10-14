<script lang="ts">
import type { AguiUserWorkCard } from "@eliteforge/agent-ui-chat-core";

export type ReasoningValue = Extract<
  AguiUserWorkCard,
  { kind: "reasoning" }
>["value"];
</script>

<script setup lang="ts">
import { BrainCircuit, ChevronDown, ChevronRight } from "lucide-vue-next";
import { computed, ref } from "vue";
import { summarizeReasoning } from "@eliteforge/agent-ui-chat-core";
import { cx } from "../utils";
import MarkdownBlock from "./MarkdownBlock.vue";

const props = defineProps<{
  card: ReasoningValue;
  unfolded?: boolean;
}>();

const expanded = ref(false);

const summary = computed(
  () =>
    summarizeReasoning(props.card) ||
    (props.card.ended ? "Reasoning captured." : "Thinking..."),
);
const detail = computed(() => props.card.summary);
</script>

<template>
  <section v-if="unfolded" aria-label="Thinking" class="ef-chat__rail-entry">
    <div class="ef-chat__rail-entry-main ef-chat__reasoning-inline">
      <BrainCircuit :class="{ 'animate-pulse': !card.ended }" :size="15" />
      <div class="ef-chat__rail-detail"><MarkdownBlock :content="detail || summary" :streaming="!card.ended" /></div>
    </div>
  </section>
  <section v-else aria-label="Thinking" class="ef-chat__rail-entry">
    <button
      :aria-expanded="expanded"
      class="ef-chat__rail-entry-toggle"
      type="button"
      @click="expanded = !expanded"
    >
      <span class="ef-chat__rail-entry-main">
        <span class="ef-chat__rail-entry-icon">
          <BrainCircuit
            :class="{ 'animate-pulse': !props.card.ended }"
            :size="15"
          />
        </span>
        <span
          :class="
            cx(
              'ef-chat__rail-entry-summary',
              !props.card.ended && 'ef-chat__rail-entry-summary--pending',
            )
          "
        >
          {{ summary }}
        </span>
      </span>
      <span class="ef-chat__rail-entry-chevron">
        <ChevronDown v-if="expanded" :size="14" />
        <ChevronRight v-else :size="14" />
      </span>
    </button>
    <div
      v-if="expanded && detail"
      class="ef-chat__rail-entry-body"
    >
      <div class="ef-chat__rail-detail">
        <MarkdownBlock :content="detail" />
      </div>
    </div>
  </section>
</template>
