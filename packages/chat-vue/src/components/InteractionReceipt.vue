<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, useId, computed } from "vue";
import { Check, CircleHelp, FileText, X } from "lucide-vue-next";
import { formatTime, type ChatMessage } from "@eliteforge/agent-ui-chat-core";

const props = defineProps<{ message: ChatMessage; actorName: string; hideMessageIdentity?: boolean }>();
const response = computed(() => props.message.interactionResponse!);
const label = computed(() => response.value.summaryLabel ?? response.value.rows[0]?.value ?? "");
const icon = computed(() => response.value.approval ? response.value.approval.approved ? Check : X : response.value.kind === "form" ? FileText : CircleHelp);
const id = useId();
const trigger = ref<HTMLButtonElement>();
const panel = ref<HTMLDivElement>();
const open = ref(false);
let pinned = false;
let timer: ReturnType<typeof setTimeout> | undefined;
function cancelClose() { clearTimeout(timer); }
function close() { cancelClose(); panel.value?.hidePopover(); pinned = false; }
function show() {
  cancelClose();
  if (!trigger.value || !panel.value) return;
  const rect = trigger.value.getBoundingClientRect();
  const above = rect.top > window.innerHeight - rect.bottom;
  Object.assign(panel.value.style, {
    width: `${Math.min(420, window.innerWidth - 24)}px`,
    left: `${Math.max(12, Math.min(rect.left, window.innerWidth - Math.min(420, window.innerWidth - 24) - 12))}px`,
    top: above ? "auto" : `${rect.bottom + 8}px`,
    bottom: above ? `${window.innerHeight - rect.top + 8}px` : "auto",
    maxHeight: `${Math.max(80, (above ? rect.top : window.innerHeight - rect.bottom) - 24)}px`,
  });
  panel.value.showPopover();
}
function scheduleClose() { cancelClose(); if (!pinned) timer = setTimeout(close, 180); }
function toggle() { if (pinned) close(); else { pinned = true; show(); } }
function onToggle(event: Event) { open.value = (event as ToggleEvent).newState === "open"; if (!open.value) pinned = false; }
function onBlur(event: FocusEvent) { if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) close(); }
function dismiss(event: Event) {
  if (event.target instanceof Node && panel.value?.contains(event.target)) return;
  close();
}
onMounted(() => { window.addEventListener("scroll", dismiss, true); window.addEventListener("resize", dismiss); });
onBeforeUnmount(() => { cancelClose(); window.removeEventListener("scroll", dismiss, true); window.removeEventListener("resize", dismiss); });
</script>

<template>
  <div class="ef-chat__interaction-receipt" :data-message-id="message.messageId" :data-history-interaction-id="response.requestId"
    @mouseenter="show" @mouseleave="scheduleClose" @focusout="onBlur">
    <button ref="trigger" type="button" class="ef-chat__interaction-chip" :aria-expanded="open" :aria-controls="id" aria-haspopup="dialog" @focus="show" @click="toggle">
      <component :is="icon" :size="14" aria-hidden="true" /><span>{{ label }}</span>
    </button>
    <div :id="id" ref="panel" popover="auto" role="dialog" :aria-label="label" tabindex="0" class="ef-chat__interaction-popover"
      @mouseenter="cancelClose" @mouseleave="scheduleClose" @toggle="onToggle">
      <div class="ef-chat__interaction-meta"><span v-if="!hideMessageIdentity">{{ actorName }}</span><time v-if="response.answeredAt != null">{{ formatTime(message.createdAt) }}</time></div>
      <dl class="ef-chat__interaction-summary"><div v-for="(row, index) in response.rows" :key="index"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div></dl>
    </div>
  </div>
</template>
