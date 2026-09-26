<script setup lang="ts">
import { BrainCircuit, ChevronDown, ChevronRight, MessageSquareText } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  aguiWorkElapsedMilliseconds,
  aguiReasoningEffort,
  buildAguiUserWorkCards,
  currentAguiWorkSnapshot,
  isAguiRunTerminal,
  type TranscriptAguiEvent,
  type ChatWorkRailLabels,
  type ChatUserInputRequest,
  type AguiUserWorkCard,
} from "@eliteforge/agent-ui-chat-core";
import ReasoningCard from "./ReasoningCard.vue";
import ToolGroupCard from "./ToolGroupCard.vue";
import ToolCard from "./ToolCard.vue";

const props = withDefaults(defineProps<{
  debugEvents?: string[];
  events?: TranscriptAguiEvent[];
  labels?: ChatWorkRailLabels;
  messageId?: string;
  userInputRequests?: ChatUserInputRequest[];
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
    if ("runId" in event && typeof event.runId === "string") return event.runId;
    return "";
  }));
  return props.userInputRequests.filter((request) => (
    runCodes.has(request.runId) || request.assistantMessageId === props.messageId
  ));
});
const answeredUserInputRequests = computed(() => matchingUserInputRequests.value.filter(
  (request) => request.status === "Answered",
));
const pendingUserInputRequest = computed(() => matchingUserInputRequests.value.find(
  (request) => request.status === "Pending",
));
const expandedRequestCode = ref<string | null>(null);
const visibleUserCards = computed<AguiUserWorkCard[]>(() => userCards.value.flatMap((card): AguiUserWorkCard[] => {
  if (card.kind === "tool" && card.value.toolName === "chat_ask_user") return [];
  if (card.kind !== "toolGroup") return [card];
  const toolCards = card.value.toolCards.filter((toolCard) => toolCard.toolName !== "chat_ask_user");
  return toolCards.length ? [{ ...card, value: { ...card.value, toolCards } }] : [];
}));
const reasoningEffort = computed(() => aguiReasoningEffort(props.events));
const terminalEvent = computed(() => isAguiRunTerminal(props.events));
const expanded = ref(false);
const now = ref(Date.now());
const labels = computed(() => props.labels ?? defaultLabels);
const duration = computed(() => formatAguiDuration(aguiWorkElapsedMilliseconds(props.events, now.value)));
const currentSummary = computed(() => {
  const snapshot = currentAguiWorkSnapshot(props.events);
  if (snapshot?.summary) return snapshot.summary;
  const activity = snapshot?.activity;
  if (activity === "PREPARING") return labels.value.preparing;
  if (activity === "RESPONDING") return labels.value.responding;
  return labels.value.thinking;
});
function answerText(request: ChatUserInputRequest, question: ChatUserInputRequest["questions"][number]) {
  const answer = request.answers?.find((item) => item.questionId === question.questionId);
  if (!answer) return labels.value.waitingForAnswer ?? "Waiting for your answer";
  if (answer.answerKind === "Other") return answer.otherText?.trim() || labels.value.waitingForAnswer || "Waiting for your answer";
  if (answer.answerKind === "Skipped") return labels.value.skipped ?? "Skipped";
  return question.options.find((option) => option.optionId === answer.optionId)?.label
    ?? answer.optionId
    ?? labels.value.waitingForAnswer
    ?? "Waiting for your answer";
}
function requestSummary(request: ChatUserInputRequest) {
  return labels.value.askedQuestions?.(request.questions.length)
    ?? `Asked ${request.questions.length} questions`;
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
    v-if="props.events.length || userCards.length || props.debugEvents.length"
    :aria-label="labels.ariaLabel"
    class="ef-chat__rail"
  >
    <button
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
    <section
      v-for="request in answeredUserInputRequests"
      :key="request.requestId"
      :aria-label="requestSummary(request)"
      class="ef-chat__rail-entry"
    >
      <button
        :aria-expanded="expandedRequestCode === request.requestId"
        class="ef-chat__rail-entry-toggle"
        type="button"
        @click="expandedRequestCode = expandedRequestCode === request.requestId ? null : request.requestId"
      >
        <span class="ef-chat__rail-entry-label">
          <MessageSquareText :size="15" />
          <span>{{ requestSummary(request) }}</span>
        </span>
        <ChevronRight v-if="expandedRequestCode !== request.requestId" :size="14" />
        <ChevronDown v-else :size="14" />
      </button>
      <ol v-if="expandedRequestCode === request.requestId" class="ef-chat__rail-entry-list">
        <li
          v-for="question in request.questions"
          :key="question.questionId"
          class="ef-chat__user-input-work-answer"
        >
          <span class="ef-chat__user-input-work-question">{{ question.question }}</span>
          <span class="ef-chat__user-input-work-value">{{ answerText(request, question) }}</span>
        </li>
      </ol>
    </section>
    <div v-if="!terminalEvent || pendingUserInputRequest" aria-live="polite" class="ef-chat__rail-current">
      <template v-if="pendingUserInputRequest">
        <MessageSquareText class="ef-chat__rail-current-icon animate-pulse" :size="15" />
        <span class="ef-chat__rail-current-text">
          {{ labels.askingQuestions?.(pendingUserInputRequest.questions.length) ?? 'Asking questions' }}
          <span class="ef-chat__rail-current-subtext">{{ labels.waitingForAnswer ?? 'Waiting for your answer' }}</span>
        </span>
      </template>
      <template v-else>
        <BrainCircuit class="ef-chat__rail-current-icon animate-pulse" :size="15" />
        <span class="ef-chat__rail-current-text">{{ currentSummary }}</span>
      </template>
    </div>
    <div
      v-if="expanded"
      class="ef-chat__rail-stack"
      :style="{ marginTop: '8px' }"
    >
      <section
        v-if="visibleUserCards.length"
        aria-label="Agent work rail"
        class="ef-chat__rail"
        style="max-width: none; padding-left: 0"
      >
        <div class="ef-chat__rail-card-list">
          <template v-for="card in visibleUserCards" :key="card.value.id">
            <ReasoningCard v-if="card.kind === 'reasoning'" :card="card.value" />
            <ToolGroupCard v-else-if="card.kind === 'toolGroup'" :card="card.value" />
            <ToolCard v-else :card="card.value" />
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
  </section>
</template>
