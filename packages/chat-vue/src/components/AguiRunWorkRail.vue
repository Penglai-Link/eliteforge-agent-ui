<script setup lang="ts">
import { Bot, ChevronDown, ChevronRight } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  aguiWorkElapsedMilliseconds,
  aguiReasoningEffort,
  buildAguiUserWorkCards,
  isAguiRunTerminal,
  type TranscriptAguiEvent,
  type ChatWorkRailLabels,
  type ChatUserInputRequest,
  type TranscriptWorkRun,
  type ChatHistoryLabels,
  defaultHistoryLabels,
  workTimelineElapsedMilliseconds,
} from "@eliteforge/agent-ui-chat-core";
import ReasoningCard from "./ReasoningCard.vue";
import ToolGroupCard from "./ToolGroupCard.vue";
import ToolCard from "./ToolCard.vue";
import AguiRunNotices from "./AguiRunNotices.vue";

const props = withDefaults(defineProps<{
  historyCovered?: boolean;
  debugEvents?: string[];
  events?: TranscriptAguiEvent[];
  labels?: ChatWorkRailLabels;
  messageId?: string;
  userInputRequests?: ChatUserInputRequest[];
  timeline?: TranscriptWorkRun;
  historyLabels?: ChatHistoryLabels;
}>(), {
  debugEvents: () => [],
  events: () => [],
  labels: undefined,
  messageId: "",
  userInputRequests: () => [],
});

const defaultLabels: ChatWorkRailLabels = {
  ariaLabel: "Agent work",
  preparing: "Preparing request…",
  responding: "Drafting response…",
  thinking: "Thinking…",
  workedFor: (duration) => `Worked for ${duration}`,
  workingFor: (duration) => `Working for ${duration}`,
  askingQuestions: (count) => `Asking ${count} questions`,
  askedQuestions: (count) => `Asked ${count} questions`,
  waitingForAnswer: "Waiting for your answer",
  skipped: "Skipped",
};

function formatAguiDuration(milliseconds: number) {
  if (milliseconds < 1000) return "<1s";
  const totalSeconds = Math.max(1, Math.round(milliseconds / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) return seconds ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

const userCards = computed(() => buildAguiUserWorkCards(props.events));
const matchingUserInputRequests = computed(() => {
  const runCodes = new Set(props.events.map((event) => {
    if ("runId" in event && typeof event.runId === "string") return event.runId;
    return "";
  }));
  return props.userInputRequests.filter((request) => (
    runCodes.has(request.runId) || request.assistantMessageId === props.messageId
  ));
});
const pendingUserInputRequest = computed(() => matchingUserInputRequests.value.find(
  (request) => request.status === "Pending",
));
const visibleUserCards = userCards;
const reasoningEffort = computed(() => aguiReasoningEffort(props.events));
const terminalEvent = computed(() => props.timeline?.completed ?? (props.historyCovered || isAguiRunTerminal(props.events) && !pendingUserInputRequest.value));
const expanded = ref(false);
const now = ref(Date.now());
const labels = computed(() => props.labels ?? defaultLabels);
const duration = computed(() => formatAguiDuration(props.timeline ? workTimelineElapsedMilliseconds(props.timeline, now.value) : aguiWorkElapsedMilliseconds(props.events, now.value)));
let timer: ReturnType<typeof setInterval> | undefined;

watch(terminalEvent, (completed) => {
  if (timer) clearInterval(timer);
  if (completed) {
    expanded.value = false;
    return;
  }
  now.value = Date.now();
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1_000);
}, { immediate: true });

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <section
    v-if="(props.timeline || !props.historyCovered || props.debugEvents.length) && (props.timeline?.items.length || props.events.length || userCards.length || props.debugEvents.length)"
    :aria-label="labels.ariaLabel"
    class="ef-chat__rail"
  >
    <button
      v-if="terminalEvent && (props.timeline?.items.length || userCards.length || props.debugEvents.length)"
      :aria-expanded="expanded"
      class="ef-chat__rail-summary"
      type="button"
      @click="expanded = !expanded"
    >
      <span class="ef-chat__rail-summary-label">
        {{ terminalEvent ? labels.workedFor(duration) : labels.workingFor(duration) }}
        <span v-if="reasoningEffort"> · {{ reasoningEffort }}</span>
      </span>
      <ChevronDown v-if="expanded" :size="14" />
      <ChevronRight v-else :size="14" />
    </button>
    <div v-else class="ef-chat__rail-summary ef-chat__rail-summary--static">{{ terminalEvent ? labels.workedFor(duration) : labels.workingFor(duration) }}</div>
    <AguiRunNotices :events="props.events" :messages="props.timeline?.messages" :labels="labels" />
    <div
      v-if="!terminalEvent || expanded"
      class="ef-chat__rail-stack"
      :style="{ marginTop: '8px' }"
    >
      <section v-if="props.timeline" aria-label="Agent work rail" class="ef-chat__rail" style="max-width: none; padding-left: 0">
        <div class="ef-chat__rail-card-list">
          <div v-for="item in props.timeline.items" :key="item.id" :data-work-item="item.kind" :data-work-item-id="item.id">
            <slot v-if="item.kind === 'message'" name="message" :message="item.message" />
            <ReasoningCard v-else-if="item.kind === 'reasoning'" :card="item.value" unfolded />
            <ToolCard v-else :card="item.value" :labels="labels" compact :status-label="item.historyStatus ? (props.historyLabels ?? defaultHistoryLabels).statuses[item.historyStatus] : undefined" />
          </div>
        </div>
      </section>
      <section
        v-else-if="visibleUserCards.length"
        aria-label="Agent work rail"
        class="ef-chat__rail"
        style="max-width: none; padding-left: 0"
      >
        <div class="ef-chat__rail-card-list">
          <template v-for="card in visibleUserCards" :key="card.value.id">
            <ReasoningCard v-if="card.kind === 'reasoning'" :card="card.value" />
            <ToolGroupCard v-else-if="card.kind === 'toolGroup'" :card="card.value" :labels="labels" />
            <ToolCard v-else :card="card.value" :labels="labels" />
          </template>
        </div>
      </section>
      <section
        v-if="props.debugEvents.length"
        aria-label="AG-UI debug event cards"
        class="ef-chat__rail"
        style="max-width: none; padding-left: 0"
      >
        <div class="ef-chat__debug-list">
          <div
            v-for="(event, index) in props.debugEvents"
            :key="`${event}-${index}`"
            class="ef-chat__debug-item"
          >
            <div class="ef-chat__debug-summary">{{ event }}</div>
          </div>
        </div>
      </section>
    </div>
    <div v-if="!terminalEvent" class="ef-chat__rail-current ef-chat__rail-current--working" role="status">
      <Bot class="ef-chat__rail-current-icon" :size="15" aria-hidden="true" />
      <span class="ef-chat__rail-current-text">{{ labels.working ?? (/^[\u3400-\u9fff]/.test(labels.thinking) ? '工作中' : 'Working') }}</span>
    </div>
  </section>
</template>
