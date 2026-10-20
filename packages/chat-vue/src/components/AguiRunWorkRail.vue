<script setup lang="ts">
import { Bot, ChevronDown, ChevronRight, CircleAlert, CircleX } from "lucide-vue-next";
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
  type WorkTimelineItem,
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
  showReasoningCards?: boolean;
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
const visibleUserCards = computed(() => userCards.value.filter(card => props.showReasoningCards !== false || card.kind !== "reasoning"));
const visibleTimelineItems = computed(() => props.timeline?.items.filter(item => props.showReasoningCards !== false || item.kind !== "reasoning") ?? []);
const reasoningEffort = computed(() => aguiReasoningEffort(props.events));
const terminalEvent = computed(() => props.timeline?.completed ?? (props.historyCovered || isAguiRunTerminal(props.events) && !pendingUserInputRequest.value));
const expanded = ref(false);
const hasDetails = computed(() => visibleTimelineItems.value.length > 0 || visibleUserCards.value.length > 0 || props.debugEvents.length > 0);
const now = ref(Date.now());
const labels = computed(() => props.labels ?? defaultLabels);
const duration = computed(() => formatAguiDuration(props.timeline ? workTimelineElapsedMilliseconds(props.timeline, now.value) : aguiWorkElapsedMilliseconds(props.events, now.value)));
const summary = computed(() => terminalEvent.value ? labels.value.workedFor(duration.value) : labels.value.workingFor(duration.value));
const historyStatusNotice = computed(() => {
  if (props.timeline?.events.length) return null;
  const runs = props.timeline?.messages.flatMap(message => message.history?.run ? [message.history.run] : []) ?? [];
  const history = props.historyLabels ?? defaultHistoryLabels;
  if (runs.some(run => run.status === "Failed")) return { failed: true, label: history.statuses.Failed };
  if (runs.some(run => run.status === "Interrupted")) return { failed: false, label: history.statuses.Interrupted };
  return null;
});
function historyGroupStatusLabels(item: WorkTimelineItem) {
  if (item.kind !== "toolGroup" || !item.historyStatuses) return undefined;
  const history = props.historyLabels ?? defaultHistoryLabels;
  return Object.fromEntries(Object.entries(item.historyStatuses).map(([id, status]) => [id, history.statuses[status]]));
}
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
      v-if="hasDetails"
      :aria-expanded="expanded"
      class="ef-chat__rail-summary"
      type="button"
      @click="expanded = !expanded"
    >
      <span class="ef-chat__rail-summary-label">
        {{ summary }}
        <span v-if="reasoningEffort"> · {{ reasoningEffort }}</span>
      </span>
      <ChevronDown v-if="expanded" :size="14" />
      <ChevronRight v-else :size="14" />
    </button>
    <div v-else class="ef-chat__rail-summary ef-chat__rail-summary--static">{{ summary }}</div>
    <AguiRunNotices :events="props.events" :messages="props.timeline?.messages" :labels="labels" />
    <div v-if="historyStatusNotice" class="ef-chat__run-notice" :class="{ 'ef-chat__run-notice--error': historyStatusNotice.failed }" :role="historyStatusNotice.failed ? 'alert' : 'status'">
      <CircleAlert v-if="historyStatusNotice.failed" :size="16" aria-hidden="true" />
      <CircleX v-else :size="16" aria-hidden="true" />
      <div class="ef-chat__run-notice-content"><div class="ef-chat__run-notice-title">{{ historyStatusNotice.label }}</div></div>
    </div>
    <div
      v-if="expanded && hasDetails"
      class="ef-chat__rail-stack"
      :style="{ marginTop: '8px' }"
    >
      <section v-if="props.timeline && visibleTimelineItems.length" aria-label="Agent work rail" class="ef-chat__rail" style="max-width: none; padding-left: 0">
        <div class="ef-chat__rail-card-list">
          <div v-for="item in visibleTimelineItems" :key="item.id" :data-work-item="item.kind" :data-work-item-id="item.id">
            <slot v-if="item.kind === 'message'" name="message" :message="item.message" />
            <ReasoningCard v-else-if="item.kind === 'reasoning'" :card="item.value" />
            <ToolGroupCard v-else-if="item.kind === 'toolGroup'" :card="item.value" :labels="labels" :status-labels="historyGroupStatusLabels(item)" />
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
