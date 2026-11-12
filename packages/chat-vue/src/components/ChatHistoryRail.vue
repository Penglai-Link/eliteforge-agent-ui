<script setup lang="ts">
import { useMotion } from "@personai/agent-ui-motion-vue";
import { computed, nextTick, ref, useId, watch } from "vue";
import type { ChatHistoryTurn } from "../chatHistory";

const props = defineProps<{ turns: ChatHistoryTurn[]; transcript: HTMLElement | null }>();
const motion = useMotion();
const previewId = useId();
const activeId = ref("");
const previewIndex = ref<number | null>(null);
const previewTop = ref(0);
const rail = ref<HTMLElement | null>(null);
const strip = ref<HTMLElement | null>(null);
const preview = ref<HTMLElement | null>(null);
const markers = ref<HTMLElement[]>([]);
const previewTurn = computed(() => previewIndex.value === null ? null : props.turns[previewIndex.value]);
const activeIndex = computed(() => Math.max(0, props.turns.findIndex(turn => turn.id === activeId.value)));

function findTurn(id: string) {
  return Array.from(props.transcript?.querySelectorAll<HTMLElement>("[data-chat-turn-id]") ?? [])
    .find(node => node.dataset.chatTurnId === id);
}

watch([() => props.transcript, () => props.turns], ([transcript], _, cleanup) => {
  if (!transcript || !props.turns.length) return;
  const nodes = new Map(Array.from(transcript.querySelectorAll<HTMLElement>("[data-chat-turn-id]"))
    .map(node => [node.dataset.chatTurnId, node]));
  function syncActive() {
    if (!transcript) return;
    const distance = transcript.scrollHeight - transcript.clientHeight;
    if (distance > 0 && transcript.scrollTop >= distance - 1) { activeId.value = props.turns.at(-1)?.id ?? ""; return; }
    const top = transcript.getBoundingClientRect().top + 24;
    let best = Infinity;
    activeId.value = props.turns[0]?.id ?? "";
    for (const turn of props.turns) {
      const node = nodes.get(turn.id);
      if (!node) continue;
      const distance = Math.abs(node.getBoundingClientRect().top - top);
      if (distance < best) { best = distance; activeId.value = turn.id; }
    }
  }
  syncActive();
  transcript.addEventListener("scroll", syncActive, { passive: true });
  const observer = new ResizeObserver(syncActive);
  observer.observe(transcript);
  if (transcript.firstElementChild) observer.observe(transcript.firstElementChild);
  cleanup(() => { transcript.removeEventListener("scroll", syncActive); observer.disconnect(); });
}, { immediate: true, flush: "post" });

function revealMarker(index: number) {
  const marker = markers.value[index];
  const container = strip.value;
  if (!marker || !container) return;
  if (marker.offsetTop < container.scrollTop) container.scrollTop = marker.offsetTop;
  else if (marker.offsetTop + marker.offsetHeight > container.scrollTop + container.clientHeight) {
    container.scrollTop = marker.offsetTop + marker.offsetHeight - container.clientHeight;
  }
}

watch([activeIndex, () => props.turns.length, strip], () => {
  if (previewIndex.value === null) revealMarker(activeIndex.value);
}, { flush: "post" });

watch(strip, (element, _, cleanup) => {
  if (!element) return;
  const observer = new ResizeObserver(() => {
    if (previewIndex.value === null) revealMarker(activeIndex.value);
  });
  observer.observe(element);
  cleanup(() => observer.disconnect());
}, { flush: "post" });

watch([previewIndex, previewTurn, rail, preview], (_, __, cleanup) => {
  const root = rail.value;
  const container = strip.value;
  const tooltip = preview.value;
  const marker = previewIndex.value === null ? null : markers.value[previewIndex.value];
  if (!root || !container || !tooltip || !marker) return;
  function measure() {
    const rect = marker!.getBoundingClientRect();
    const bounds = container!.getBoundingClientRect();
    if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) { previewIndex.value = null; return; }
    const center = rect.top + rect.height / 2 - root!.getBoundingClientRect().top;
    previewTop.value = Math.max(0, Math.min(center - tooltip!.offsetHeight / 2, root!.clientHeight - tooltip!.offsetHeight));
  }
  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(root);
  observer.observe(tooltip);
  container.addEventListener("scroll", measure, { passive: true });
  cleanup(() => { observer.disconnect(); container.removeEventListener("scroll", measure); });
}, { flush: "post" });

function navigate(index: number) {
  const turn = props.turns[index];
  const transcript = props.transcript;
  const node = turn && findTurn(turn.id);
  if (!node || !transcript) return;
  const top = transcript.scrollTop + node.getBoundingClientRect().top - transcript.getBoundingClientRect().top;
  transcript.scrollTo({ top, behavior: motion.value.policy === "full" ? "smooth" : "instant" });
  previewIndex.value = null;
}

async function handleKey(event: KeyboardEvent, index: number) {
  const next = event.key === "ArrowDown" ? Math.min(index + 1, props.turns.length - 1)
    : event.key === "ArrowUp" ? Math.max(index - 1, 0)
    : event.key === "Home" ? 0 : event.key === "End" ? props.turns.length - 1 : null;
  if (next === null) return;
  event.preventDefault();
  revealMarker(next);
  await nextTick();
  markers.value[next]?.focus({ preventScroll: true });
}

function blur(event: FocusEvent) {
  if (!rail.value?.contains(event.relatedTarget as Node | null)) previewIndex.value = null;
}
</script>

<template>
  <div v-if="turns.length" ref="rail" class="ef-chat-history-rail" data-theme-part="chat-history"
    :data-agent-motion-policy="motion.policy" @mouseleave="previewIndex = null" @focusout="blur" @keydown.esc.stop="previewIndex = null">
    <div ref="strip" class="ef-chat-history-rail__markers" role="navigation" aria-label="Chat history">
      <button v-for="(turn, index) in turns" :key="turn.id" :ref="el => { if (el) markers[index] = el as HTMLElement; }"
        type="button" class="ef-chat-history-rail__marker" :data-active="index === activeIndex" :data-hovered="index === previewIndex"
        :aria-label="turn.userPreview" :aria-current="index === activeIndex ? 'location' : undefined"
        :aria-describedby="index === previewIndex ? previewId : undefined" :tabindex="index === activeIndex ? 0 : -1"
        @click="navigate(index)" @mouseenter="previewIndex = index" @focus="previewIndex = index" @keydown="handleKey($event, index)" />
    </div>
    <div v-if="previewTurn" :id="previewId" ref="preview" role="tooltip" class="ef-chat-history-rail__preview" :style="{ top: `${previewTop}px` }">
      <span class="ef-chat-history-rail__preview-user">{{ previewTurn.userPreview }}</span>
      <span v-if="previewTurn.assistantPreview" class="ef-chat-history-rail__preview-assistant">{{ previewTurn.assistantPreview }}</span>
    </div>
  </div>
</template>
