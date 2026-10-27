<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { ChatHistoryTurn } from "../chatHistory";
import MarkdownBlock from "./MarkdownBlock.vue";

const props = defineProps<{ turns: ChatHistoryTurn[]; transcript: HTMLElement | null }>();
const activeId = ref("");
const hoveredIndex = ref<number | null>(null);
const rail = ref<HTMLElement | null>(null);
const markers = ref<HTMLElement[]>([]);
const offsets = ref<number[]>([]);
const hovered = computed(() => hoveredIndex.value === null ? null : props.turns[hoveredIndex.value]);

function findTurn(id: string) {
  return Array.from(props.transcript?.querySelectorAll<HTMLElement>("[data-chat-turn-id]") ?? [])
    .find(node => node.dataset.chatTurnId === id);
}
function syncActive() {
  const transcript = props.transcript;
  if (!transcript || !props.turns.length) { activeId.value = ""; return; }
  const distance = transcript.scrollHeight - transcript.clientHeight;
  if (distance > 0 && transcript.scrollTop >= distance - 1) {
    activeId.value = props.turns.at(-1)?.id ?? "";
    return;
  }
  const top = transcript.getBoundingClientRect().top + 24;
  let best = Infinity;
  activeId.value = props.turns[0]?.id ?? "";
  for (const turn of props.turns) {
    const node = findTurn(turn.id);
    if (!node) continue;
    const d = Math.abs(node.getBoundingClientRect().top - top);
    if (d < best) { best = d; activeId.value = turn.id; }
  }
}
function measure() {
  const top = rail.value?.getBoundingClientRect().top ?? 0;
  offsets.value = markers.value.map(node => {
    const rect = node.getBoundingClientRect();
    return rect.top - top + rect.height / 2;
  });
}
watch(() => props.transcript, (element, _, cleanup) => {
  if (!element) return;
  element.addEventListener("scroll", syncActive, { passive: true });
  window.addEventListener("resize", syncActive);
  window.addEventListener("resize", measure);
  cleanup(() => { element.removeEventListener("scroll", syncActive); window.removeEventListener("resize", syncActive); window.removeEventListener("resize", measure); });
  void nextTick().then(() => { syncActive(); measure(); });
}, { immediate: true, flush: "post" });
watch(() => props.turns, async () => {
  if (hoveredIndex.value !== null && hoveredIndex.value >= props.turns.length) hoveredIndex.value = null;
  await nextTick(); markers.value.length = props.turns.length; syncActive(); measure();
}, { flush: "post" });
function move(event: MouseEvent) {
  if (!rail.value || !offsets.value.length) return;
  const y = event.clientY - rail.value.getBoundingClientRect().top;
  let closest = 0;
  offsets.value.forEach((offset, i) => { if (Math.abs(offset - y) < Math.abs(offsets.value[closest]! - y)) closest = i; });
  hoveredIndex.value = closest;
}
function markerWidth(index: number) {
  if (hoveredIndex.value === null) return props.turns[index]?.id === activeId.value ? 14 : 6;
  if (hoveredIndex.value === index) return 24;
  const distance = Math.abs((offsets.value[index] ?? 0) - (offsets.value[hoveredIndex.value] ?? 0));
  return 6 + Math.max(0, 1 - distance / 60) ** 2 * 14;
}
function navigate(index: number) {
  const turn = props.turns[index];
  if (turn) findTurn(turn.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<template>
  <div v-if="turns.length" ref="rail" class="ef-chat-history-rail" @mousemove="move" @mouseleave="hoveredIndex = null" @click="hoveredIndex !== null && navigate(hoveredIndex)">
    <div class="ef-chat-history-rail__markers" aria-label="Chat history">
      <button v-for="(turn, index) in turns" :key="turn.id" :ref="el => { if (el) markers[index] = el as HTMLElement; }"
        type="button" class="ef-chat-history-rail__marker" :class="{ 'ef-chat-history-rail__marker--active': hoveredIndex === null && turn.id === activeId }"
        :aria-label="turn.userPreview" :data-active="hoveredIndex === null && turn.id === activeId" :data-hovered="hoveredIndex === index"
        :style="{ width: `${markerWidth(index)}px` }" @click.stop="navigate(index)" @mouseenter="hoveredIndex = index"
        @focus="hoveredIndex = index" @blur="hoveredIndex = null">
        <span class="ef-chat-history-rail__sr-only">{{ turn.userPreview }}</span>
      </button>
    </div>
    <div v-if="hovered && hoveredIndex !== null" role="tooltip" class="ef-chat-history-rail__preview"
      :class="{ 'ef-chat-history-rail__preview--compact': !hovered.hasAssistantReply && hovered.hasWorkActivity }"
      :style="{ top: `${offsets[hoveredIndex] ?? 0}px` }">
      <span class="ef-chat-history-rail__preview-user">{{ hovered.userPreview }}</span>
      <MarkdownBlock v-if="hovered.hasAssistantReply" class="ef-chat-history-rail__preview-assistant" :content="hovered.assistantPreview" />
    </div>
  </div>
</template>
