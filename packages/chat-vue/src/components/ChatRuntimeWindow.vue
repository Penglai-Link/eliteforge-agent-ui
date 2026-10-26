<script setup lang="ts">
import { contextCompactionInProgress, historyCompactionEvents } from "@eliteforge/agent-ui-chat-core";
import type { ChatAnnotation } from "@eliteforge/agent-ui-chat-core";
import {
  AssistantReplyQueue,
  AssistantMessageStream,
  requestedSkillsFromDraft,
  applyMessageProvenance,
  ChatA2uiSession, AGENT_CATALOG_ID, type ChatA2uiActionHandler,
  historyMessages,
  historyEventRunId,
  historyUserInputRequests,
  nativeUserInputAnswer,
  activeNativeUserInputRequests,
  type SessionHistory,
  type HistoryCursor,
  type ChatAdapter,
  defaultAssistantReplySpeed,
  buildTranscriptPresentation,
  belongsToNewChatTurn,
  createMockChatAdapter,
  enqueueChatSubmission,
  ChatAdapterError,
  mergeChatMessagesChronologically,
  mergeTranscriptAguiEvents,
  normalizeChatSession,
  removeQueuedChatSubmission,
  reorderQueuedChatSubmission,
  takeNextQueuedChatSubmission,
  type ChatActiveRun,
  type ChatAguiEvent,
  type ChatAguiStreamEvent,
  type ChatFloatingState,
  type ChatMessage,
  type ChatMessageAttachment,
  type ChatQueuedSubmission,
  type ChatRunningSubmitMode,
  type ChatSession,
  type ChatSubmitMode,
  type ChatUserInputAnswer,
  type ChatUserInputRequest,
  type SendChatMessageInput,
  isRecentPendingUserTurn,
  isSteerQueueFallbackCode,
  openAguiProtocolRunCodes,
} from "@eliteforge/agent-ui-chat-core";
import {
  computed,
  onBeforeUnmount,
  ref,
  shallowRef,
  useSlots,
  watch,
} from "vue";
import { defaultErrorReporter, normalizeOptionalValue } from "../utils";
import {
  resolveSuccessfulActiveRunSnapshot,
  retainActiveRunOnStatusFailure,
  type RuntimeActiveRunTrackingState,
} from "../runtimeActiveRun";
import {
  ownsRuntimeStreamObserver,
  resolveRuntimeStreamSettlement,
  type RuntimeStreamAbortReason,
} from "../runtimeStreamObserver";
import ChatPanel from "./ChatPanel.vue";
import ChatWindow from "./ChatWindow.vue";
import { ChatRuntimeWindowProps } from "../types";

const props = withDefaults(defineProps<ChatRuntimeWindowProps>(), {
  adapter: undefined,
  attachmentLabels: undefined,
  autoFocusComposer: false,
  composerHeader: undefined,
  currentUserDisplayName: "",
  draft: undefined,
  debugOptions: undefined,
  emptyDescription: undefined,
  emptyTitle: undefined,
  floatingSubtitle: "AI assistant",
  floatingTitle: "Assistant",
  formatAnnotationCount: undefined,
  footerAddon: undefined,
  initialSession: null,
  onCreateSession: undefined,
  onDraftChange: undefined,
  onError: defaultErrorReporter,
  onInfo: undefined,
  onPendingAttachmentsChange: undefined,
  onRunStateChange: undefined,
  onSessionChange: undefined,
  pendingAttachments: undefined,
  createSendInput: undefined,
  showAttachmentControl: true,
  showHeader: undefined,
  onWindowStateChange: undefined,
  windowState: undefined,
});

const emit = defineEmits<{
  error: [message: string, title?: string];
  info: [message: string, title?: string];
  "session-change": [session: ChatSession | null];
  "window-state-change": [state: ChatFloatingState];
}>();

const forwardedSlotNames: string[] = Object.keys(useSlots()).filter(
  (name) => name !== "footerAddon",
);

const activeAdapter = computed(() => props.adapter ?? createMockChatAdapter());
const normalizedInitialSession = computed(() =>
  props.initialSession ? normalizeChatSession(props.initialSession) : null,
);
const session = ref<ChatSession | null>(normalizedInitialSession.value);
const messages = ref<ChatMessage[]>([]);
const a2uiSession = shallowRef(new ChatA2uiSession(session.value?.sessionId ?? ""));
const a2uiEpoch = ref(0);
watch(() => session.value?.sessionId, (id, _, cleanup) => {
  const runtime = new ChatA2uiSession(id ?? ""); a2uiSession.value = runtime;
  cleanup(runtime.client.subscribe(() => a2uiEpoch.value++));
  if (id && activeAdapter.value.loadA2uiState) void activeAdapter.value.loadA2uiState(id).then(s => runtime.hydrate(s)).catch(e => props.onError?.(String(e), "A2UI state failed"));
}, {immediate: true});
async function reloadA2ui() { const runtime = a2uiSession.value; if (runtime.sessionId && activeAdapter.value.loadA2uiState) runtime.hydrate(await activeAdapter.value.loadA2uiState(runtime.sessionId)); }
function receiveA2ui(event: ChatAguiStreamEvent) { try { if (!a2uiSession.value.applyEvent(event)) void reloadA2ui().catch(e => props.onError?.(String(e), "A2UI recovery failed")); } catch(e) { props.onError?.(String(e), "A2UI presentation failed"); void reloadA2ui().catch(() => {}); } }
const presentedMessages = computed(() => { void a2uiEpoch.value; return applyMessageProvenance(mergeChatMessagesChronologically(messages.value, a2uiSession.value.messages()), [...protocolEvents.value, ...liveAguiEvents.value]); });
const streamingAssistantMessageCode = ref<string | null>(null);
const agentReplySpeed = computed(
  () => props.agentReplySpeed ?? defaultAssistantReplySpeed,
);
const assistantReplyQueue = new AssistantReplyQueue(
  (messageCode, text) => {
    messages.value = messages.value.map((message) =>
      message.messageId === messageCode
        ? { ...message, content: `${message.content}${text}` }
        : message,
    );
  },
  () => agentReplySpeed.value,
);
watch(
  () => props.agentReplyEffect,
  (effect) => {
    if (effect === "off" || effect === undefined) assistantReplyQueue.flush();
  },
);
function receiveAssistantMessage(stream: AssistantMessageStream, event: ChatAguiStreamEvent, fallbackId?: string) {
  const update = stream.receive(event);
  if (!update) return;
  const { message, delta, ended } = update;
  if (ended) assistantReplyQueue.flush(message.messageId);
  if (fallbackId) messages.value = messages.value.filter(item => item.messageId !== fallbackId);
  if (ended && !message.content.trim()) messages.value = messages.value.filter(item => item.messageId !== message.messageId);
  else if (!messages.value.some(item => item.messageId === message.messageId)) messages.value.push({ ...message, content: "" });
  streamingAssistantMessageCode.value = stream.activeMessageId;
  if (delta) {
    liveAguiPending.value = false;
    assistantReplyQueue.enqueue(message.messageId, delta, props.agentReplyEffect ?? "off");
  }
}

onBeforeUnmount(() => assistantReplyQueue.dispose());
const userInputRequest = ref<ChatUserInputRequest | null>(null);
const userInputRequests = ref<ChatUserInputRequest[]>([]);
const acceptedUserInputRequests = ref<ChatUserInputRequest[]>([]);
const presentedUserInputRequests = computed(() => [...new Map(
  [...userInputRequests.value, ...acceptedUserInputRequests.value]
    .filter(request => request.sessionId === session.value?.sessionId)
    .map(request => [request.requestId, request]),
).values()]);
watch(() => session.value?.sessionId, () => { acceptedUserInputRequests.value = []; });
const userInputAnswerPending = ref(false);
const aguiEvents = ref<ChatAguiEvent[]>([]);
const protocolEvents = ref<ChatAguiStreamEvent[]>([]);
const liveAguiEvents = ref<ChatAguiStreamEvent[]>([]);
const liveAguiAnchorMessageCodes = ref<Record<string, string>>({});
const internalDraft = ref("");
const draftSkills = ref<string[]>([]);
const internalPendingAttachments = ref<ChatMessageAttachment[]>([]);
const draft = computed({
  get: () => props.draft ?? internalDraft.value,
  set: (value: string) => {
    draftSkills.value = requestedSkillsFromDraft(value, props.config.inputSuggestions ?? [], draftSkills.value);
    if (props.draft === undefined) internalDraft.value = value;
    props.onDraftChange?.(value);
  },
});
const pendingAttachments = computed({
  get: () => props.pendingAttachments ?? internalPendingAttachments.value,
  set: (value: ChatMessageAttachment[]) => {
    if (props.pendingAttachments === undefined) internalPendingAttachments.value = value;
    props.onPendingAttachmentsChange?.(value);
  },
});
const internalPendingAnnotations = ref<ChatAnnotation[]>([]);
const pendingAnnotations = computed({
  get: () => props.pendingAnnotations ?? internalPendingAnnotations.value,
  set: (value: ChatAnnotation[]) => {
    if (props.pendingAnnotations === undefined) internalPendingAnnotations.value = value;
    props.onPendingAnnotationsChange?.(value);
  },
});
const attachmentUploadPending = ref(false);
const sending = ref(false);
const steering = ref(false);
const loading = ref(false);
const historySnapshot = shallowRef<SessionHistory | null>(null);
watch([historySnapshot, protocolEvents, liveAguiEvents], () => {
  const events = mergeTranscriptAguiEvents(protocolEvents.value, liveAguiEvents.value) as ChatAguiStreamEvent[];
  const active = (requests: ChatUserInputRequest[]) => activeNativeUserInputRequests(
    requests, events, session.value?.sessionId ?? "", historySnapshot.value);
  userInputRequests.value = active(userInputRequests.value);
  if (userInputRequest.value && !active([userInputRequest.value]).length) {
    userInputRequest.value = userInputRequests.value.find(request => request.status === "Pending") ?? null;
  }
}, {deep:true});
const historyCursor = ref<HistoryCursor | null>(null);
const historyLoadingOlder = ref(false);
const liveAguiPending = ref(false);
const liveAguiPendingAnchorMessageCode = ref("");
const activeRunCode = ref("");
const activeRunSupportsSteer = ref<boolean | null>(null);
const remoteActiveRun = ref<ChatActiveRun | null>(null);
const pendingProtocolTerminalRun = ref<ChatActiveRun | null>(null);
const activeRunStatusPending = ref(false);
const stopping = ref(false);
const queuedSubmissions = ref<ChatQueuedSubmission[]>([]);
const activeSessionCodeRef = ref("");
const activeObserverRef = shallowRef<{
  abortReason: RuntimeStreamAbortReason;
  controller: AbortController;
  sessionId: string;
} | null>(null);
const steerAbortRef = ref<AbortController | null>(null);
const stopAbortRef = ref<AbortController | null>(null);
const autoDrainEpochRef = ref(0);
const queuedSubmissionSequenceRef = ref(0);
const optimisticMessageSequenceRef = ref(0);
const queueGenerationRef = ref(0);
const terminalHandledRunCodesRef = new Set<string>();

const aguiEnabled = computed(
  () =>
    props.config.showAgui !== false &&
    activeAdapter.value.capabilities.supportsAgui,
);
const protocolReplayEnabled = computed(
  () =>
    aguiEnabled.value &&
    activeAdapter.value.capabilities.supportsProtocolReplay &&
    Boolean(activeAdapter.value.loadProtocolEvents) && !activeAdapter.value.loadHistory,
);
const effectiveActiveRunCode = computed(
  () =>
    activeRunCode.value ||
    remoteActiveRun.value?.runId ||
    pendingProtocolTerminalRun.value?.runId ||
    "",
);
const runActive = computed(
  () =>
    sending.value ||
    Boolean(remoteActiveRun.value) ||
    Boolean(pendingProtocolTerminalRun.value) ||
    activeRunStatusPending.value,
);
const localCompactionSession = ref("");
const operationKind = computed(() => runActive.value ? remoteActiveRun.value?.operationKind ?? (localCompactionSession.value === session.value?.sessionId || contextCompactionInProgress(protocolEvents.value, effectiveActiveRunCode.value) ? "ContextCompaction" : undefined) : undefined);
const compacting = computed(() => operationKind.value === "ContextCompaction");
watch(runActive, active => { if (!active) localCompactionSession.value = ""; });
const effectiveRunState = computed(() => {
  if (
    pendingProtocolTerminalRun.value?.runId === effectiveActiveRunCode.value
  ) {
    return "FINISHING";
  }
  return remoteActiveRun.value?.runId === effectiveActiveRunCode.value
    ? remoteActiveRun.value.state
    : "RUNNING";
});
const effectiveSupportsSteer = computed(() => {
  if (
    pendingProtocolTerminalRun.value?.runId === effectiveActiveRunCode.value
  ) {
    return false;
  }
  return remoteActiveRun.value?.runId === effectiveActiveRunCode.value
    ? remoteActiveRun.value.supportsSteer
    : activeRunSupportsSteer.value;
});
const canSteer = computed(() =>
  Boolean(
    !compacting.value && activeAdapter.value.capabilities.supportsSteer &&
      activeAdapter.value.steerMessage &&
      effectiveActiveRunCode.value &&
      effectiveRunState.value === "RUNNING" &&
      effectiveSupportsSteer.value !== false,
  ),
);
const runningSubmitModes = computed<ChatRunningSubmitMode[]>(() =>
  canSteer.value ? ["steer", "queue"] : ["queue"],
);
const visibleQueuedSubmissions = computed(() =>
  queuedSubmissions.value.filter(
    (submission) => submission.sessionId === session.value?.sessionId,
  ),
);
const canStop = computed(() =>
  Boolean(
    !compacting.value && session.value &&
      !stopping.value &&
      ((effectiveActiveRunCode.value &&
        effectiveRunState.value === "RUNNING" &&
        activeAdapter.value.capabilities.supportsStop &&
        activeAdapter.value.stopRun) ||
        (sending.value &&
          activeAdapter.value.capabilities.supportsAbort &&
          !(
            activeAdapter.value.capabilities.supportsStop &&
            activeAdapter.value.stopRun
          ))),
  ),
);

watch(
  [runActive, effectiveActiveRunCode, canSteer, () => session.value?.sessionId ?? "", loading, activeRunStatusPending, operationKind],
  ([active, runId, supportsSteer, sessionId, historyLoading, statusPending]) => {
    props.onRunStateChange?.({
      loading: historyLoading || statusPending,
      active,
      runId,
      sessionId,
      supportsSteer,
      operationKind: operationKind.value,
    });
  },
  { immediate: true },
);

function isRunAlreadyActiveError(error: unknown) {
  return (
    (error instanceof ChatAdapterError &&
      error.code === "RUN_ALREADY_ACTIVE") ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "RUN_ALREADY_ACTIVE")
  );
}

function detachRunObserver(reason: "detach" | "stop") {
  const observer = activeObserverRef.value;
  if (observer) {
    observer.abortReason = reason;
    observer.controller.abort();
    if (activeObserverRef.value === observer) {
      activeObserverRef.value = null;
      sending.value = false;
      liveAguiPending.value = false;
      activeRunCode.value = "";
      activeRunSupportsSteer.value = null;
    }
  }
  detachSteerObserver();
}

function detachSteerObserver() {
  const controller = steerAbortRef.value;
  if (controller) {
    steerAbortRef.value = null;
    controller.abort();
  }
  steering.value = false;
}

async function loadActiveRunSnapshot(
  sessionId: string,
  signal?: AbortSignal,
) {
  const adapter = activeAdapter.value;
  if (adapter.loadHistory && (!adapter.capabilities.supportsActiveRun || !adapter.getActiveRun)) {
    return historyActiveRun(await adapter.loadHistory(sessionId, { limit: 20, cursor: null }, signal));
  }
  if (!adapter.capabilities.supportsActiveRun || !adapter.getActiveRun) {
    throw new Error("Active-run status is not supported by this adapter");
  }
  const result = await adapter.getActiveRun(sessionId, signal);
  return result.activeRun;
}

type ActiveRunQueryResult =
  | { activeRun: ChatActiveRun | null; kind: "success" }
  | { kind: "failure" }
  | { kind: "unsupported" };

async function queryActiveRunSnapshot(
  sessionId: string,
  signal?: AbortSignal,
): Promise<ActiveRunQueryResult> {
  const adapter = activeAdapter.value;
  if (!adapter.capabilities.supportsActiveRun || !adapter.getActiveRun) {
    return { kind: "unsupported" };
  }
  try {
    return {
      activeRun: await loadActiveRunSnapshot(sessionId, signal),
      kind: "success",
    };
  } catch {
    return { kind: "failure" };
  }
}

function replaceQueuedSubmissions(next: ChatQueuedSubmission[]) {
  queuedSubmissions.value = next;
}

function createSendInput(
  activeSession: ChatSession,
  content: string,
  attachments: ChatMessageAttachment[] = [],
): SendChatMessageInput | null {
  if (props.createSendInput) {
    const input = props.createSendInput(activeSession, content, attachments);
    return input ? { ...input, annotations: pendingAnnotations.value, requestedSkills: requestedSkillsFromDraft(content, props.config.inputSuggestions ?? [], draftSkills.value) } : null;
  }
  const input: SendChatMessageInput = {
    clientCapabilities: { userInputRequests: true },
    content,
    annotations: pendingAnnotations.value,
    requestedSkills: requestedSkillsFromDraft(content, props.config.inputSuggestions ?? [], draftSkills.value),
  };
  if (attachments.length) input.attachments = attachments;
  return input;
}

function enqueueSubmission(
  activeSession: ChatSession,
  input: SendChatMessageInput,
  position: "front" | "back" = "back",
) {
  queuedSubmissionSequenceRef.value += 1;
  const submission: ChatQueuedSubmission = {
    id: `QUEUED-${Date.now()}-${queuedSubmissionSequenceRef.value}`,
    input,
    sessionId: activeSession.sessionId,
  };
  replaceQueuedSubmissions(
    position === "front"
      ? [submission, ...queuedSubmissions.value]
      : enqueueChatSubmission(queuedSubmissions.value, submission),
  );
  return submission;
}

function takeNextQueuedSubmission(sessionId: string) {
  const result = takeNextQueuedChatSubmission(
    queuedSubmissions.value,
    sessionId,
  );
  replaceQueuedSubmissions(result.remaining);
  return result.submission;
}

function drainNextQueuedSubmission(sessionId: string) {
  const currentSession = session.value;
  if (
    !currentSession ||
    currentSession.sessionId !== sessionId ||
    sending.value ||
    remoteActiveRun.value ||
    pendingProtocolTerminalRun.value ||
    activeRunStatusPending.value
  ) {
    return;
  }
  const nextSubmission = takeNextQueuedSubmission(sessionId);
  if (nextSubmission) {
    void runMessage(currentSession, nextSubmission.input, nextSubmission);
  }
}

function currentActiveRunTrackingState(): RuntimeActiveRunTrackingState {
  return {
    activeRun: remoteActiveRun.value,
    pendingProtocolTerminalRun: pendingProtocolTerminalRun.value,
    statusPending: activeRunStatusPending.value,
  };
}

function applyActiveRunTrackingState(state: RuntimeActiveRunTrackingState) {
  remoteActiveRun.value = state.activeRun;
  pendingProtocolTerminalRun.value = state.pendingProtocolTerminalRun;
  activeRunStatusPending.value = state.statusPending;
}

function markActiveRunStatusPending(sessionId: string) {
  if (activeSessionCodeRef.value !== sessionId) return;
  applyActiveRunTrackingState(
    retainActiveRunOnStatusFailure(currentActiveRunTrackingState()),
  );
}

function acceptActiveRunSnapshot(
  nextActiveRun: ChatActiveRun | null,
  sessionId: string,
  protocolSnapshot: ChatAguiStreamEvent[] = protocolEvents.value,
  drainNow = true,
) {
  if (activeSessionCodeRef.value !== sessionId) return false;
  const resolution = resolveSuccessfulActiveRunSnapshot({
    nextActiveRun,
    protocolEvents: protocolSnapshot,
    protocolReplayEnabled: protocolReplayEnabled.value,
    sessionId,
    state: currentActiveRunTrackingState(),
    suppressedRunCodes: terminalHandledRunCodesRef,
  });
  applyActiveRunTrackingState(resolution.state);
  if (resolution.consumedSuppressedRunCode) {
    terminalHandledRunCodesRef.delete(resolution.consumedSuppressedRunCode);
  }
  if (resolution.shouldDrainQueue && drainNow && !sending.value) {
    drainNextQueuedSubmission(sessionId);
  }
  return resolution.shouldDrainQueue;
}

function releasePendingProtocolTerminal(
  sessionId: string,
  protocolSnapshot: ChatAguiStreamEvent[],
) {
  if (!pendingProtocolTerminalRun.value) return false;
  return acceptActiveRunSnapshot(null, sessionId, protocolSnapshot, true);
}

async function refreshActiveRun(
  sessionId: string,
  signal?: AbortSignal,
  drainNow = true,
) {
  const next = await loadActiveRunSnapshot(sessionId, signal);
  acceptActiveRunSnapshot(next, sessionId, protocolEvents.value, drainNow);
  return next;
}

function prependQueuedSubmission(submission: ChatQueuedSubmission) {
  replaceQueuedSubmissions([
    submission,
    ...removeQueuedChatSubmission(queuedSubmissions.value, submission.id),
  ]);
}

function restoreSourceSubmission(
  sourceSubmission: ChatQueuedSubmission | undefined,
  queueGeneration: number,
) {
  if (!sourceSubmission || queueGeneration !== queueGenerationRef.value) {
    return;
  }
  prependQueuedSubmission(sourceSubmission);
}

watch(
  normalizedInitialSession,
  (nextSession) => {
    activeSessionCodeRef.value = nextSession?.sessionId ?? "";
    session.value = nextSession;
  },
  { immediate: true },
);

watch(
  session,
  (nextSession, previousSession) => {
    if (
      previousSession?.sessionId &&
      previousSession.sessionId !== nextSession?.sessionId
    ) {
      queueGenerationRef.value += 1;
      detachRunObserver("detach");
      stopAbortRef.value?.abort();
      stopping.value = false;
      terminalHandledRunCodesRef.clear();
      remoteActiveRun.value = null;
      pendingProtocolTerminalRun.value = null;
      activeRunStatusPending.value = false;
      activeRunCode.value = "";
      activeRunSupportsSteer.value = null;
      pendingAttachments.value = [];
  pendingAnnotations.value = [];
    }
    activeSessionCodeRef.value = nextSession?.sessionId ?? "";
    props.onSessionChange?.(nextSession);
    emit("session-change", nextSession);
  },
  { immediate: true },
);

watch(
  () => session.value?.sessionId,
  async (nextSessionCode, _, onCleanup) => {
    let active = true;
    const abortController = new AbortController();
    onCleanup(() => {
      active = false;
      abortController.abort();
    });

    if (!nextSessionCode) {
      messages.value = [];
      aguiEvents.value = [];
      protocolEvents.value = [];
      userInputRequest.value = null;
      userInputRequests.value = [];
      remoteActiveRun.value = null;
      pendingProtocolTerminalRun.value = null;
      activeRunStatusPending.value = false;
      return;
    }

    loading.value = true;
    messages.value = []; historySnapshot.value = null; historyCursor.value = null;
    const [dataResult, queriedActiveRunResult] = await Promise.all([
      readPresentation(nextSessionCode, abortController.signal).then(
        ([nextMessages, nextAguiEvents, nextProtocolEvents, nextUserInputRequests, nextHistory]) => ({
          nextHistory,
          kind: "success" as const,
          nextAguiEvents,
          nextMessages,
          nextProtocolEvents,
          nextUserInputRequests,
        }),
        (error: unknown) => ({ error, kind: "failure" as const }),
      ),
      queryActiveRunSnapshot(nextSessionCode, abortController.signal),
    ]);
    const activeRunResult = queriedActiveRunResult.kind !== "success" && dataResult.kind === "success" && dataResult.nextHistory
      ? { kind: "success" as const, activeRun: historyActiveRun(dataResult.nextHistory) }
      : queriedActiveRunResult;
    if (!active || abortController.signal.aborted) return;
    if (dataResult.kind === "success") {
      if (!sending.value) { messages.value = dataResult.nextMessages; acceptHistory(dataResult.nextHistory); }
      aguiEvents.value = dataResult.nextAguiEvents;
      protocolEvents.value = dataResult.nextProtocolEvents;
      userInputRequests.value = dataResult.nextUserInputRequests;
      userInputRequest.value = dataResult.nextUserInputRequests.find(
        (request) => request.status === "Pending",
      ) ?? null;
    } else {
      const message =
        dataResult.error instanceof Error
          ? dataResult.error.message
          : "Chat data could not be loaded";
      props.onError?.(message, "Chat load failed");
      emit("error", message, "Chat load failed");
    }
    if (activeRunResult.kind === "success") {
      acceptActiveRunSnapshot(
        activeRunResult.activeRun,
        nextSessionCode,
        dataResult.kind === "success"
          ? dataResult.nextProtocolEvents
          : protocolEvents.value,
        false,
      );
    } else if (activeRunResult.kind === "failure") {
      markActiveRunStatusPending(nextSessionCode);
    }
    loading.value = false;
  },
  { immediate: true },
);

async function readPresentation(sessionId: string, signal?: AbortSignal, adapter: ChatAdapter = activeAdapter.value) {
  if (adapter.loadHistory) {
    const page = await adapter.loadHistory(sessionId, { limit: 20, cursor: null }, signal);
    const notices = historyCompactionEvents(page);
    return [historyMessages(page, props.config.userInputLabels), [] as ChatAguiEvent[], notices, historyUserInputRequests(page, props.config.userInputLabels), page] as const;
  }
  const parts = await Promise.all([
    adapter.loadMessages(sessionId),
    aguiEnabled.value ? adapter.loadAguiEvents(sessionId) : Promise.resolve([]),
    protocolReplayEnabled.value && adapter.loadProtocolEvents ? adapter.loadProtocolEvents(sessionId) : Promise.resolve([]),
    adapter.capabilities.supportsUserInputRequests && adapter.loadUserInputRequests ? adapter.loadUserInputRequests(sessionId, signal) : Promise.resolve([]),
  ]);
  return [...parts, null] as const;
}
async function loadOlderHistory() {
  const sessionId = session.value?.sessionId;
  if (!sessionId || !historyCursor.value || !activeAdapter.value.loadHistory || historyLoadingOlder.value) return;
  historyLoadingOlder.value = true;
  try {
    const page = await activeAdapter.value.loadHistory(sessionId, { limit: 20, cursor: historyCursor.value });
    if (activeSessionCodeRef.value !== sessionId) return;
    messages.value = mergeChatMessagesChronologically(historyMessages(page, props.config.userInputLabels), messages.value);
    historyCursor.value = page.nextCursor;
  } catch (error) {
    if ((error as { status?: number })?.status === 409 && activeSessionCodeRef.value === sessionId) {
      try {
        const page = await activeAdapter.value.loadHistory(sessionId, { limit: 20, cursor: null });
        if (activeSessionCodeRef.value === sessionId) { messages.value = historyMessages(page, props.config.userInputLabels); acceptHistory(page); }
      } catch (reloadError) { reportError(reloadError instanceof Error ? reloadError.message : "Chat data could not be loaded", "Chat load failed"); }
    } else reportError(error instanceof Error ? error.message : "Chat data could not be loaded", "Chat load failed");
  }
  finally { if (activeSessionCodeRef.value === sessionId) historyLoadingOlder.value = false; }
}
function acceptHistory(page: SessionHistory | null) {
  if (!page) return;
  historySnapshot.value = page; historyCursor.value = page.nextCursor;
  userInputRequests.value = historyUserInputRequests(page, props.config.userInputLabels);
  userInputRequest.value = userInputRequests.value.find((r) => r.status === "Pending") ?? null;
  const committed = new Set(page.runs.filter((r) => ["Completed", "Failed", "Interrupted", "Waiting"].includes(r.status)).map((r) => r.id));
  liveAguiEvents.value = liveAguiEvents.value.filter((e) => !committed.has(historyEventRunId(e)));
}
function historyActiveRun(page: SessionHistory): ChatActiveRun | null {
  const run = page.activeRuns.find((r) => r.status === "Running" && r.parentRunId === null);
  return run ? { runId: run.id, runtimeAdapterKey: "framework", supportsSteer: activeAdapter.value.capabilities.supportsSteer ?? false, state: "RUNNING" } : null;
}

const shouldPollData = computed(() =>
  Boolean(
    session.value?.sessionId &&
      (isRecentPendingUserTurn(messages.value) ||
        Boolean(userInputRequest.value) ||
        (protocolReplayEnabled.value &&
          openAguiProtocolRunCodes(
            protocolEvents.value,
            session.value.sessionId,
          ).size > 0)),
  ),
);
const shouldPollRuntime = computed(() =>
  Boolean(
    session.value?.sessionId &&
      (runActive.value ||
        shouldPollData.value ||
        activeRunStatusPending.value ||
        pendingProtocolTerminalRun.value),
  ),
);

watch(
  [() => session.value?.sessionId, shouldPollRuntime],
  (_, __, onCleanup) => {
    const sessionId = session.value?.sessionId;
    if (!sessionId || !shouldPollRuntime.value) return;
    let refreshing = false;
    const intervalId = window.setInterval(async () => {
      if (refreshing || activeSessionCodeRef.value !== sessionId) return;
      refreshing = true;
      const [dataResult, queriedActiveRunResult] = await Promise.all([
        readPresentation(sessionId, undefined).then(
          ([nextMessages, nextAguiEvents, nextProtocolEvents, nextUserInputRequests, nextHistory]) => ({
          nextHistory,
            kind: "success" as const,
            nextAguiEvents,
            nextMessages,
            nextProtocolEvents,
            nextUserInputRequests,
          }),
          () => ({ kind: "failure" as const }),
        ),
        queryActiveRunSnapshot(sessionId),
      ]);
      const activeRunResult = dataResult.kind === "success" && dataResult.nextHistory
        ? { kind: "success" as const, activeRun: historyActiveRun(dataResult.nextHistory) }
        : queriedActiveRunResult;
      if (activeSessionCodeRef.value === sessionId) {
        let protocolSnapshot = protocolEvents.value;
        if (dataResult.kind === "success") {
          if (!sending.value) { messages.value = dataResult.nextMessages; acceptHistory(dataResult.nextHistory); }
          aguiEvents.value = dataResult.nextAguiEvents;
          protocolEvents.value = dataResult.nextProtocolEvents;
          userInputRequests.value = dataResult.nextUserInputRequests;
          userInputRequest.value = dataResult.nextUserInputRequests.find(
            (request) => request.status === "Pending",
          ) ?? null;
          protocolSnapshot = dataResult.nextProtocolEvents;
        }
        if (activeRunResult.kind === "success") {
          acceptActiveRunSnapshot(
            activeRunResult.activeRun,
            sessionId,
            protocolSnapshot,
          );
        } else if (activeRunResult.kind === "failure") {
          markActiveRunStatusPending(sessionId);
          releasePendingProtocolTerminal(sessionId, protocolSnapshot);
        } else {
          releasePendingProtocolTerminal(sessionId, protocolSnapshot);
        }
      }
      refreshing = false;
    }, 1000);

    onCleanup(() => {
      window.clearInterval(intervalId);
    });
  },
  { immediate: true },
);

const sendDisabled = computed(() => {
  if (compacting.value || loading.value || props.config.disabledInput || userInputRequest.value) return true;
  if (!draft.value.trim() && !pendingAttachments.value.length && !pendingAnnotations.value.length) return true;
  return false;
});
const queueDisabled = computed(
  () =>
    loading.value ||
    compacting.value || Boolean(props.config.disabledInput) ||
    Boolean(userInputRequest.value) ||
    (!draft.value.trim() && !pendingAttachments.value.length && !pendingAnnotations.value.length) ||
    !session.value,
);
const steerDisabled = computed(
  () => queueDisabled.value || steering.value || !canSteer.value,
);

function reportError(message: string, title?: string) {
  props.onError?.(message, title);
  emit("error", message, title);
}

function reportInfo(message: string, title?: string) {
  props.onInfo?.(message, title);
  emit("info", message, title);
}

async function ensureSession() {
  if (session.value) return session.value;
  const created = await activeAdapter.value.createSession({
    title: normalizeOptionalValue(props.config.title) ?? props.floatingTitle,
  });
  activeSessionCodeRef.value = created.sessionId;
  session.value = created;
  messages.value = [];
  aguiEvents.value = [];
  protocolEvents.value = [];
  return created;
}

async function handleAttachmentUpload(file: File) {
  const adapter = activeAdapter.value;
  if (attachmentUploadPending.value || !adapter.uploadAttachment) return;
  const activeSession = await ensureSession();
  if (!activeSession) return;
  attachmentUploadPending.value = true;
  try {
    const attachment = await adapter.uploadAttachment(activeSession, {
      file,
      kind: file.type.startsWith("image/") ? "image" : "file",
      summary: file.name,
    });
    if (activeSessionCodeRef.value === activeSession.sessionId) {
      pendingAttachments.value = [...pendingAttachments.value, attachment];
    }
  } catch (error) {
    reportError(
      error instanceof Error ? error.message : "Chat attachment upload failed",
      "Attachment upload failed",
    );
  } finally {
    attachmentUploadPending.value = false;
  }
}

async function runMessage(
  activeSession: ChatSession,
  sendInput: SendChatMessageInput,
  sourceSubmission?: ChatQueuedSubmission,
) {
  const queueGeneration = queueGenerationRef.value;
  const autoDrainEpoch = autoDrainEpochRef.value;
  if (
    sending.value ||
    remoteActiveRun.value ||
    pendingProtocolTerminalRun.value ||
    activeRunStatusPending.value
  ) {
    restoreSourceSubmission(sourceSubmission, queueGeneration);
    return false;
  }
  sendInput = {...sendInput, clientCapabilities: {...sendInput.clientCapabilities, a2ui: {version: "v0.9.1", catalogIds: [AGENT_CATALOG_ID]}}, a2uiMetadata: a2uiSession.value.metadata(sendInput.metadata?.agentId as string | undefined ?? "main-agent")};
  localCompactionSession.value = sendInput.content.trim().toLowerCase() === "/compact" ? activeSession.sessionId : "";
  const content = sendInput.content.trim();
  if (!content && !sendInput.attachments?.length && !sendInput.annotations?.length) {
    restoreSourceSubmission(sourceSubmission, queueGeneration);
    return false;
  }
  const adapter = activeAdapter.value;
  const isAguiEnabled = aguiEnabled.value;
  const abortController = new AbortController();
  const observer = {
    abortReason: "none" as RuntimeStreamAbortReason,
    controller: abortController,
    sessionId: activeSession.sessionId,
  };
  activeObserverRef.value = observer;
  activeRunCode.value = "";
  activeRunSupportsSteer.value = null;
  optimisticMessageSequenceRef.value += 1;
  const optimisticKey = `${Date.now()}-${optimisticMessageSequenceRef.value}`;
  const optimisticCreatedAt = new Date().toISOString();
  const optimisticUserCode = `LOCAL-${optimisticKey}-USER`;
  const optimisticAssistantCode = `LOCAL-${optimisticKey}-ASSISTANT`;
  const textStream = new AssistantMessageStream(activeSession);
  const flushTurnText = () => {
    for (const id of [optimisticAssistantCode, ...textStream.messageIds]) assistantReplyQueue.flush(id);
  };
  streamingAssistantMessageCode.value = optimisticAssistantCode;
  sending.value = true;
  liveAguiPending.value = isAguiEnabled;
  messages.value = [
    ...messages.value,
    {
      actor: props.currentSender?.displayName ?? props.currentUserDisplayName ?? "User",
      provenance: { sender: props.currentSender ?? { kind: "user", displayName: props.currentUserDisplayName || "User" } },
      channel: "conversation",
      annotations: sendInput.annotations ?? [],
      content,
      createdAt: optimisticCreatedAt,
      id: -Date.now() - optimisticMessageSequenceRef.value,
      messageId: optimisticUserCode,
      role: "USER",
      runId: null,
      sessionId: activeSession.sessionId,
    },
    {
      actor: activeSession.displayName ?? "Assistant",
      channel: "conversation",
      content: "",
      createdAt: optimisticCreatedAt,
      id: -Date.now() - optimisticMessageSequenceRef.value - 1,
      messageId: optimisticAssistantCode,
      role: "ASSISTANT",
      runId: null,
      sessionId: activeSession.sessionId,
    },
  ];

  let completed = false;
  let completedRunCode = "";
  let completedSession: ChatSession | null = null;
  let streamSucceeded = false;
  // Once a request crosses the transport boundary, automatic retry is unsafe:
  // the backend may already have persisted its USER message. The sole safe
  // restore path is RUN_ALREADY_ACTIVE, which rejects before admission.
  let shouldRestoreSourceSubmission = false;
  let drainConflictQueue = false;
  try {
    const result = await adapter.streamMessage(
      activeSession,
      sendInput,
      {
        onAguiEvent: (event) => {
          receiveA2ui(event);
            if (!belongsToNewChatTurn(event, activeSession.sessionId, optimisticCreatedAt)) return;
          if (
            !ownsRuntimeStreamObserver(
              activeObserverRef.value,
              observer,
              activeSessionCodeRef.value,
            )
          ) {
            return;
          }
          const runId = String(event.runId ?? event.runId ?? "");
          if (typeof event.supportsSteer === "boolean") {
            activeRunSupportsSteer.value = event.supportsSteer;
          }
          if (runId && !activeRunCode.value) activeRunCode.value = runId;
          receiveAssistantMessage(textStream, event, optimisticAssistantCode);
          if (!isAguiEnabled) return;
          liveAguiEvents.value = [...liveAguiEvents.value, event];
          if (!runId) return;
          liveAguiAnchorMessageCodes.value = liveAguiAnchorMessageCodes.value[
            runId
          ]
            ? liveAguiAnchorMessageCodes.value
            : {
                ...liveAguiAnchorMessageCodes.value,
                [runId]: optimisticUserCode,
              };
        },
        onDelta: (delta) => {
          if (
            !ownsRuntimeStreamObserver(
              activeObserverRef.value,
              observer,
              activeSessionCodeRef.value,
            )
          ) {
            return;
          }
          if (textStream.identified) return;
          liveAguiPending.value = false;
          assistantReplyQueue.enqueue(
            optimisticAssistantCode,
            delta,
            props.agentReplyEffect ?? "off",
          );
        },
      },
      abortController.signal,
    );
    const settlement = resolveRuntimeStreamSettlement({
      activeObserver: activeObserverRef.value,
      activeSessionCode: activeSessionCodeRef.value,
      observer,
    });
    userInputRequest.value =
      result.userInputRequest?.status === "Pending"
        ? result.userInputRequest
        : null;
    if (result.userInputRequest) {
      userInputRequests.value = [
        ...userInputRequests.value.filter(
          (request) => request.requestId !== result.userInputRequest?.requestId,
        ),
        result.userInputRequest,
      ];
    }
    streamSucceeded = settlement.streamSucceeded;
    shouldRestoreSourceSubmission = settlement.restoreSourceSubmission;

    if (
      settlement.canCommit &&
      result.session.sessionId === activeSession.sessionId
    ) {
      flushTurnText();
      const [nextMessages, nextAguiEvents, nextProtocolEvents, nextRequests, nextHistory] =
        await readPresentation(result.session.sessionId, undefined, adapter).catch(() => [null, null, null, [], null] as const);

      if (
        ownsRuntimeStreamObserver(
          activeObserverRef.value,
          observer,
          activeSessionCodeRef.value,
        )
      ) {
        acceptHistory(nextHistory);
        if (nextHistory) {
          userInputRequests.value = [...nextRequests];
          userInputRequest.value = nextRequests.find((r) => r.status === "Pending") ?? null;
        }
        completedRunCode = result.run.runId;
        terminalHandledRunCodesRef.add(result.run.runId);
        if (
          (remoteActiveRun.value as unknown as ChatActiveRun)?.runId ===
          result.run.runId
        ) {
          remoteActiveRun.value = null;
        }
        pendingProtocolTerminalRun.value = null;
        activeRunStatusPending.value = false;
        session.value = result.session;
        if (nextMessages) {
          messages.value = nextMessages;
        } else {
          messages.value = textStream.settle(
            messages.value,
            result.messages,
            [optimisticUserCode, optimisticAssistantCode],
          );
        }
        if (isAguiEnabled) {
          if (nextAguiEvents) aguiEvents.value = nextAguiEvents;
          if (nextProtocolEvents) protocolEvents.value = nextProtocolEvents;
        }
        // A failed/unsupported replay read must not erase the observed process.
        // acceptHistory prunes only executions covered by a durable snapshot.
        if (nextProtocolEvents?.some(event => event.runId === result.run.runId && ["RUN_FINISHED", "RUN_ERROR"].includes(event.type))) {
          liveAguiEvents.value = liveAguiEvents.value.filter(event => event.runId !== result.run.runId);
        }
        completedSession = result.session;
        completed = autoDrainEpochRef.value === autoDrainEpoch;
      }
    }
  } catch (error) {
    flushTurnText();
    const settlement = resolveRuntimeStreamSettlement({
      activeObserver: activeObserverRef.value,
      activeSessionCode: activeSessionCodeRef.value,
      observer,
    });
    const stillViewingSession =
      activeSessionCodeRef.value === activeSession.sessionId;
    if (!settlement.canCommit) {
      streamSucceeded = settlement.streamSucceeded;
      shouldRestoreSourceSubmission = settlement.restoreSourceSubmission;
      if (observer.abortReason === "stop" && stillViewingSession) {
        messages.value = messages.value.filter(
          (message) =>
            message.messageId !== optimisticAssistantCode ||
            Boolean(message.content.trim()),
        );
      }
    } else if (isRunAlreadyActiveError(error)) {
      messages.value = messages.value.filter(
        (message) =>
          message.messageId !== optimisticUserCode &&
          message.messageId !== optimisticAssistantCode,
      );
      if (sourceSubmission) {
        restoreSourceSubmission(sourceSubmission, queueGeneration);
      } else if (queueGeneration === queueGenerationRef.value) {
        enqueueSubmission(activeSession, sendInput, "front");
      }
      shouldRestoreSourceSubmission = false;
      markActiveRunStatusPending(activeSession.sessionId);
      try {
        const nextActiveRun = await loadActiveRunSnapshot(
          activeSession.sessionId,
        );
        drainConflictQueue = acceptActiveRunSnapshot(
          nextActiveRun,
          activeSession.sessionId,
          protocolEvents.value,
          false,
        );
      } catch {
        // Keep the queued message until authoritative status can be refreshed.
      }
      if (activeSessionCodeRef.value === activeSession.sessionId) {
        reportInfo(
          "The active run changed before send; the message was kept in the queue",
          "Message queued",
        );
      }
    } else {
      messages.value = messages.value.filter(
        (message) =>
          message.messageId !== optimisticAssistantCode ||
          Boolean(message.content.trim()),
      );
    }
    if (settlement.canCommit && error instanceof ChatAdapterError && error.rejectedBeforeAdmission) {
      shouldRestoreSourceSubmission = Boolean(sourceSubmission);
      messages.value = messages.value.filter(message => message.messageId !== optimisticUserCode && message.messageId !== optimisticAssistantCode);
      if (!sourceSubmission && !draft.value) {
        draftSkills.value = sendInput.requestedSkills ?? [];
        draft.value = content;
        pendingAttachments.value = [...(sendInput.attachments ?? []), ...pendingAttachments.value];
        pendingAnnotations.value = [...(sendInput.annotations ?? []), ...pendingAnnotations.value];
      }
    }
    if (settlement.canCommit && !isRunAlreadyActiveError(error)) {
      const message =
        error instanceof Error ? error.message : "Chat send failed";
      reportError(message, "Chat send failed");
    }
  } finally {
    flushTurnText();
    messages.value = messages.value.filter(message => !textStream.messageIds.includes(message.messageId) || Boolean(message.content.trim()) || Boolean(message.a2ui));
    if (streamingAssistantMessageCode.value === optimisticAssistantCode || textStream.messageIds.includes(streamingAssistantMessageCode.value ?? "")) {
      streamingAssistantMessageCode.value = null;
    }
    if (activeObserverRef.value === observer) {
      sending.value = false;
      liveAguiPending.value = false;
      activeObserverRef.value = null;
      activeRunCode.value = "";
      activeRunSupportsSteer.value = null;
    }
  }

  if (!streamSucceeded && shouldRestoreSourceSubmission) {
    restoreSourceSubmission(sourceSubmission, queueGeneration);
  }

  if (
    drainConflictQueue &&
    activeSessionCodeRef.value === activeSession.sessionId
  ) {
    drainNextQueuedSubmission(activeSession.sessionId);
  }

  if (
    completed &&
    completedSession &&
    activeSessionCodeRef.value === activeSession.sessionId
  ) {
    if (
      (remoteActiveRun.value as unknown as ChatActiveRun)?.runId ===
      completedRunCode
    ) {
      remoteActiveRun.value = null;
    }
    const nextSubmission = takeNextQueuedSubmission(activeSession.sessionId);
    if (nextSubmission) {
      void runMessage(completedSession, nextSubmission.input, nextSubmission);
    }
  }
  return completed;
}

async function handleSend() {
  if (sendDisabled.value || userInputRequest.value || userInputAnswerPending.value) return;
  const activeSession = await ensureSession();
  if (!activeSession) return;
  const content = draft.value.trim();
  const attachments = pendingAttachments.value;
  if (!content && !attachments.length && !pendingAnnotations.value.length) return;
  const sendInput = createSendInput(activeSession, content, attachments);
  if (!sendInput) return;
  draft.value = "";
  pendingAttachments.value = [];
  pendingAnnotations.value = [];
  if (runActive.value) {
    enqueueSubmission(activeSession, sendInput);
    return;
  }
  await runMessage(activeSession, sendInput);
}

async function handleQueue() {
  if (queueDisabled.value || userInputRequest.value || userInputAnswerPending.value) return;
  const activeSession = await ensureSession();
  if (!activeSession) return;
  const content = draft.value.trim();
  const attachments = pendingAttachments.value;
  if (!content && !attachments.length && !pendingAnnotations.value.length) return;
  const sendInput = createSendInput(activeSession, content, attachments);
  if (!sendInput) return;
  draft.value = "";
  pendingAttachments.value = [];
  pendingAnnotations.value = [];
  if (runActive.value) {
    enqueueSubmission(activeSession, sendInput);
    return;
  }
  await runMessage(activeSession, sendInput);
}

async function handleSteer(queuedId?: string) {
  if (steering.value || (!queuedId && steerDisabled.value) || !canSteer.value || userInputRequest.value || userInputAnswerPending.value) return;
  const activeSession = session.value;
  if (!activeSession) return;
  const queuedIndex = queuedId ? queuedSubmissions.value.findIndex(item => item.id === queuedId && item.sessionId === activeSession.sessionId) : -1;
  if (queuedId && queuedIndex < 0) return;
  const queuedSubmission = queuedIndex >= 0 ? queuedSubmissions.value[queuedIndex] : null;
  const content = queuedSubmission?.input.content ?? draft.value.trim();
  const attachments = pendingAttachments.value;
  if (!queuedSubmission && !content && !attachments.length && !pendingAnnotations.value.length) return;
  const sendInput = queuedSubmission?.input ?? createSendInput(activeSession, content, attachments);
  if (!sendInput) return;
  const expectedRunId = effectiveActiveRunCode.value;
  const adapter = activeAdapter.value;
  const queueGeneration = queueGenerationRef.value;
  if (queuedSubmission) replaceQueuedSubmissions(removeQueuedChatSubmission(queuedSubmissions.value, queuedSubmission.id));
  else {
    draft.value = "";
    pendingAttachments.value = [];
    pendingAnnotations.value = [];
  }
  if (
    !runActive.value ||
    !expectedRunId ||
    !adapter.capabilities.supportsSteer ||
    !adapter.steerMessage
  ) {
    if (queuedSubmission) {
      const next = [...queuedSubmissions.value];
      next.splice(Math.min(queuedIndex, next.length), 0, queuedSubmission);
      replaceQueuedSubmissions(next);
    } else enqueueSubmission(activeSession, sendInput);
    return;
  }

  const abortController = new AbortController();
  steerAbortRef.value = abortController;
  steering.value = true;
  try {
    const result = await adapter.steerMessage(
      activeSession,
      sendInput,
      { expectedRunId: expectedRunId },
      abortController.signal,
    );
    if (steerAbortRef.value !== abortController) {
      // A resolved ACK means the backend accepted and persisted the steer.
      // Ignore a stale observer result without sending the same input again.
      return;
    }
    if (activeSessionCodeRef.value === result.sessionId) {
      messages.value = mergeChatMessagesChronologically(messages.value, [
        result.message,
      ]);
    }
  } catch (error) {
    const observerDetached = steerAbortRef.value !== abortController;
    const queueIsCurrent = queueGeneration === queueGenerationRef.value;
    const safeQueueFallback =
      error instanceof ChatAdapterError &&
      isSteerQueueFallbackCode(error.code);
    if (safeQueueFallback && queueIsCurrent) {
      if (queuedSubmission) {
        const next = [...queuedSubmissions.value];
        next.splice(Math.min(queuedIndex, next.length), 0, queuedSubmission);
        replaceQueuedSubmissions(next);
      } else enqueueSubmission(activeSession, sendInput, "front");
      try {
        await refreshActiveRun(activeSession.sessionId, undefined, true);
      } catch {
        markActiveRunStatusPending(activeSession.sessionId);
        // Keep the queued fallback until the next authoritative refresh.
      }
    }
    const stopped = error instanceof Error && error.name === "AbortError";
    if (safeQueueFallback) {
      if (queueIsCurrent) {
        reportInfo(
          "The active run rejected steer; the message was queued",
          "Message queued",
        );
      }
    } else if (observerDetached || stopped) {
      if (queueIsCurrent) {
        reportInfo(
          "Steer delivery was not confirmed and was not retried",
          "Steer not retried",
        );
      }
    } else {
      if (queuedSubmission && error instanceof ChatAdapterError && error.rejectedBeforeAdmission && queueIsCurrent) {
        const next = [...queuedSubmissions.value];
        next.splice(Math.min(queuedIndex, next.length), 0, queuedSubmission);
        replaceQueuedSubmissions(next);
      }
      if (!queuedSubmission && error instanceof ChatAdapterError && error.rejectedBeforeAdmission &&
          activeSessionCodeRef.value === activeSession.sessionId && !draft.value) {
        draftSkills.value = sendInput.requestedSkills ?? [];
        draft.value = content;
        pendingAttachments.value = attachments;
        pendingAnnotations.value = sendInput.annotations ?? [];
      }
      const message =
        error instanceof Error ? error.message : "Chat steer failed";
      reportError(message, "Chat steer failed");
    }
  } finally {
    if (steerAbortRef.value === abortController) {
      steerAbortRef.value = null;
      steering.value = false;
    }
  }
}

async function handleSubmit(mode: ChatSubmitMode = "send") {
  if (mode === "queue") {
    await handleQueue();
    return;
  }
  if (mode === "steer") {
    await handleSteer();
    return;
  }
  await handleSend();
}

const handleA2uiAction: ChatA2uiActionHandler = (message, metadata, context) => {
  if (!context) {props.onA2UIAction?.(message,metadata);return;}
  const current = session.value; const adapter = activeAdapter.value;
  if (!current || !context || !adapter.sendA2uiActionStream || runActive.value || userInputRequest.value || current.status === "ARCHIVED") return;
  const controller = new AbortController(); const observer = {controller, sessionId: current.sessionId, abortReason: "none" as RuntimeStreamAbortReason};
  activeObserverRef.value = observer; sending.value = true;
  const input = a2uiSession.value.prepareAction(message,metadata,context.surface);
  const textStream = new AssistantMessageStream(current);
  void adapter.sendA2uiActionStream(current, input, {
    onAguiEvent: event => { if (session.value?.sessionId !== current.sessionId || activeObserverRef.value !== observer) return; receiveA2ui(event); receiveAssistantMessage(textStream, event); if(event.runId) activeRunCode.value = event.runId; liveAguiEvents.value.push(event); }
  }, controller.signal).then(async result => {
    if (session.value?.sessionId !== current.sessionId || activeObserverRef.value !== observer) return;
    a2uiSession.value.completeAction(input.actionId);
    assistantReplyQueue.flush();
    messages.value = textStream.settle(messages.value, result.messages); session.value = result.session;
    userInputRequest.value = result.userInputRequest?.status === "Pending" ? result.userInputRequest : null;
    props.onA2UIAction?.(message, metadata, context);
    const [nextMessages, nextAudits, nextProtocol, nextRequests, nextHistory] = await readPresentation(current.sessionId); if (session.value?.sessionId !== current.sessionId || activeObserverRef.value !== observer) return; messages.value = nextMessages; aguiEvents.value=nextAudits; protocolEvents.value=nextProtocol; userInputRequests.value=nextRequests; userInputRequest.value=nextRequests.find(r=>r.status === "Pending") ?? null; acceptHistory(nextHistory); await reloadA2ui();
  }).catch(e => props.onError?.(String(e), "A2UI action failed")).finally(() => { if(activeObserverRef.value === observer) {assistantReplyQueue.flush(); streamingAssistantMessageCode.value = null; activeObserverRef.value = null; sending.value = false; activeRunCode.value = "";} });
};
async function handleAnswerUserInput(answers: ChatUserInputAnswer[]) {
  if (compacting.value) return;
  const activeSession = session.value;
  const request = userInputRequest.value;
  const textStream = activeSession ? new AssistantMessageStream(activeSession) : null;
  const adapter = activeAdapter.value;
  if (
    !activeSession ||
    !request ||
    userInputAnswerPending.value ||
    !adapter.answerUserInputRequestStream
  ) {
    return;
  }
  const continuationAnchorMessageCode = [...messages.value]
    .reverse()
    .find((message) => message.role === "ASSISTANT")?.messageId ?? messages.value.at(-1)?.messageId ?? "";
  const markAnswered = () => {
    if (activeSessionCodeRef.value !== activeSession.sessionId) return;
    if (!acceptedUserInputRequests.value.some(item => item.requestId === request.requestId)) {
      acceptedUserInputRequests.value = [...acceptedUserInputRequests.value, { ...request, answers, answeredAt: Date.now(), assistantMessageId: request.assistantMessageId ?? continuationAnchorMessageCode, status: "Answered" }];
    }
  };
  userInputAnswerPending.value = true;
  sending.value = true;
  liveAguiPending.value = aguiEnabled.value;
  liveAguiPendingAnchorMessageCode.value = continuationAnchorMessageCode;
  protocolEvents.value = mergeTranscriptAguiEvents(protocolEvents.value, liveAguiEvents.value) as ChatAguiStreamEvent[];
  liveAguiEvents.value = [];
  liveAguiAnchorMessageCodes.value = {};
  try {
    const result = await adapter.answerUserInputRequestStream(
      activeSession,
      request.requestId,
      {...nativeUserInputAnswer(request, answers), ...(adapter.loadA2uiState ? {clientCapabilities: {userInputRequests:true,a2ui:{version:"v0.9.1" as const,catalogIds:[AGENT_CATALOG_ID]}}, a2uiMetadata:a2uiSession.value.metadata(activeSession.metadata?.agentId as string | undefined ?? "main-agent")} : {})},
      {
        onAguiEvent: (event) => {
          if (activeSessionCodeRef.value !== activeSession.sessionId) return;
          if (event.type === "RUN_STARTED") {
            markAnswered();
            userInputAnswerPending.value = false;
            if (userInputRequest.value?.requestId === request.requestId) userInputRequest.value = null;
            userInputRequests.value = userInputRequests.value.map(item => item.requestId === request.requestId
              ? { ...item, answers, answeredAt: item.answeredAt ?? Date.now(), assistantMessageId: item.assistantMessageId ?? continuationAnchorMessageCode, status: "Answered" as const } : item);
            if (event.runId) activeRunCode.value = event.runId;
          }
          receiveA2ui(event);
          if (textStream) receiveAssistantMessage(textStream, event);
          if (!aguiEnabled.value) return;
          liveAguiEvents.value = [...liveAguiEvents.value, event];
          const runId = String(event.runId ?? event.runId ?? "");
          if (runId && continuationAnchorMessageCode && !liveAguiAnchorMessageCodes.value[runId]) {
            liveAguiAnchorMessageCodes.value = {
              ...liveAguiAnchorMessageCodes.value,
              [runId]: `interaction:${request.requestId}`,
            };
          }
        },
      },
    );
    if (activeSessionCodeRef.value !== activeSession.sessionId) return;
    markAnswered();
    const [nextMessages, durableAudits, durableProtocol, durableRequests, durableHistory] = await readPresentation(activeSession.sessionId, undefined, adapter).catch(() => [null, [], [], [], null] as const);
    assistantReplyQueue.flush();
    acceptHistory(durableHistory);
    messages.value = nextMessages
      ? nextMessages
      : textStream!.settle(messages.value, result.messages);
    const nextUserInputRequests = !adapter.loadHistory && adapter.loadUserInputRequests
      ? await adapter.loadUserInputRequests(activeSession.sessionId).catch(() => null)
      : null;
    if (nextUserInputRequests) {
      userInputRequests.value = nextUserInputRequests;
      userInputRequest.value = nextUserInputRequests.find(
        (item) => item.status === "Pending",
      ) ?? null;
    } else {
      userInputRequest.value =
        result.userInputRequest?.status === "Pending"
          ? result.userInputRequest
          : null;
      userInputRequests.value = userInputRequests.value.map((item) => (
        item.requestId === request.requestId
          ? { ...item, answers, answeredAt: item.answeredAt ?? Date.now(), assistantMessageId: item.assistantMessageId ?? continuationAnchorMessageCode, status: "Answered" as const }
          : item
      ));
    }
    session.value = result.session;
    if (aguiEnabled.value) {
      aguiEvents.value = [...durableAudits];
      protocolEvents.value = [...durableProtocol];
    }
    if (durableHistory) {
      userInputRequests.value = durableRequests;
      userInputRequest.value = durableRequests.find((r) => r.status === "Pending") ?? null;
    }
    if (durableProtocol.some(event => event.runId === result.run.runId && ["RUN_FINISHED", "RUN_ERROR"].includes(event.type))) {
      liveAguiEvents.value = liveAguiEvents.value.filter(event => event.runId !== result.run.runId);
    }
    liveAguiPending.value = false;
    liveAguiPendingAnchorMessageCode.value = "";
    await refreshActiveRun(activeSession.sessionId, undefined, false).catch(() => undefined);
  } catch (error) {
    reportError(
      error instanceof Error ? error.message : "Answer submission failed",
      "Answer submission failed",
    );
  } finally {
    if (activeSessionCodeRef.value !== activeSession.sessionId) return;
    activeRunCode.value = "";
    userInputAnswerPending.value = false;
    assistantReplyQueue.flush(); streamingAssistantMessageCode.value = null;
    sending.value = false;
    liveAguiPending.value = false;
    liveAguiPendingAnchorMessageCode.value = "";
  }
}

function handleEditQueuedMessage(id: string, content: string) {
  const input = queuedSubmissions.value.find(item => item.id === id)?.input;
  draftSkills.value = input?.requestedSkills ?? [];
  pendingAttachments.value = input?.attachments ?? [];
  pendingAnnotations.value = input?.annotations ?? [];
  replaceQueuedSubmissions(
    removeQueuedChatSubmission(queuedSubmissions.value, id),
  );
  draft.value = content;
}

function handleRemoveQueuedMessage(id: string) {
  replaceQueuedSubmissions(
    removeQueuedChatSubmission(queuedSubmissions.value, id),
  );
}

function handleReorderQueuedMessage(sourceId: string, targetId: string) {
  replaceQueuedSubmissions(reorderQueuedChatSubmission(queuedSubmissions.value, sourceId, targetId));
}

async function handleStop() {
  if (compacting.value) return;
  if (stopping.value) return;
  const activeSession = session.value;
  if (!activeSession) return;

  const adapter = activeAdapter.value;
  let expectedRunId = effectiveActiveRunCode.value;
  if (
    !expectedRunId &&
    adapter.capabilities.supportsStop &&
    adapter.stopRun
  ) {
    try {
      expectedRunId =
        (await refreshActiveRun(activeSession.sessionId, undefined, false))
          ?.runId ?? "";
    } catch {
      markActiveRunStatusPending(activeSession.sessionId);
      // Fall back only when this adapter explicitly supports local abort.
    }
  }
  if (expectedRunId && adapter.capabilities.supportsStop && adapter.stopRun) {
    const abortController = new AbortController();
    stopAbortRef.value = abortController;
    stopping.value = true;
    autoDrainEpochRef.value += 1;
    terminalHandledRunCodesRef.add(expectedRunId);
    try {
      await adapter.stopRun(
        activeSession,
        { expectedRunId: expectedRunId },
        abortController.signal,
      );
      if (activeSessionCodeRef.value !== activeSession.sessionId) return;
      remoteActiveRun.value = {
        runId: expectedRunId,
        runtimeAdapterKey: remoteActiveRun.value?.runtimeAdapterKey ?? "",
        state: "FINISHING",
        supportsSteer: false,
      };
      pendingProtocolTerminalRun.value = null;
      activeRunStatusPending.value = false;
      detachRunObserver("stop");
      reportInfo("Current response has been stopped", "Chat stopped");
    } catch (error) {
      terminalHandledRunCodesRef.delete(expectedRunId);
      if (abortController.signal.aborted) return;
      const message =
        error instanceof Error ? error.message : "Chat stop failed";
      reportError(message, "Chat stop failed");
      try {
        await refreshActiveRun(activeSession.sessionId, undefined, true);
      } catch {
        markActiveRunStatusPending(activeSession.sessionId);
        // Keep the queue paused until the next successful status refresh.
      }
    } finally {
      if (stopAbortRef.value === abortController) {
        stopAbortRef.value = null;
        stopping.value = false;
      }
    }
    return;
  }

  if (
    sending.value &&
    adapter.capabilities.supportsAbort &&
    !(adapter.capabilities.supportsStop && adapter.stopRun)
  ) {
    autoDrainEpochRef.value += 1;
    if (expectedRunId) terminalHandledRunCodesRef.add(expectedRunId);
    detachRunObserver("stop");
    reportInfo("Current response has been stopped", "Chat stopped");
  }
}

function handleNewSession() {
  if (props.config.showNewSession === false) return;
  queueGenerationRef.value += 1;
  detachRunObserver("detach");
  stopAbortRef.value?.abort();
  session.value = null;
  messages.value = [];
    userInputRequest.value = null;
    userInputRequests.value = [];
  aguiEvents.value = [];
  protocolEvents.value = [];
  liveAguiEvents.value = [];
  liveAguiAnchorMessageCodes.value = {};
  liveAguiPendingAnchorMessageCode.value = "";
  pendingAttachments.value = [];
  pendingAnnotations.value = [];
  activeSessionCodeRef.value = "";
  activeRunCode.value = "";
  activeRunSupportsSteer.value = null;
  remoteActiveRun.value = null;
  pendingProtocolTerminalRun.value = null;
  activeRunStatusPending.value = false;
  stopping.value = false;
  replaceQueuedSubmissions([]);
}

onBeforeUnmount(() => {
  queueGenerationRef.value += 1;
  detachRunObserver("detach");
  stopAbortRef.value?.abort();
});

const presentationDebugEvents = computed(
  () =>
    buildTranscriptPresentation({
      debugOptions: props.debugOptions,
      liveAguiAnchorMessageCodes: liveAguiAnchorMessageCodes.value,
      liveAguiEvents: liveAguiEvents.value,
      liveAguiPendingAnchorMessageCode: liveAguiPendingAnchorMessageCode.value,
      liveAguiPending: liveAguiPending.value,
      messages: messages.value,
      protocolEvents: protocolEvents.value,
      sessionId: session.value?.sessionId ?? "",
    }).debugEventsByRunCode,
);

const resolvedDebugOptions = computed(() => ({
  ...props.debugOptions,
  debugEventTypes: props.debugOptions?.debugEventTypes?.length
    ? Array.from(
        new Set([
          ...props.debugOptions.debugEventTypes,
          ...Array.from(presentationDebugEvents.value.keys()).flatMap(
            (runId) =>
              mergeTranscriptAguiEvents(
                protocolEvents.value,
                liveAguiEvents.value,
              )
                .filter(
                  (event) => (event.runId ?? event.runId ?? "") === runId,
                )
                .map((event) => String(event.type).toUpperCase()),
          ),
        ]),
      )
    : props.debugOptions?.debugEventTypes,
}));

const attachmentDownloader = computed<
  ((attachment: ChatMessageAttachment) => Promise<Blob>) | undefined
>(() => {
  const activeSession = session.value;
  const downloadAttachment = activeAdapter.value.downloadAttachment;
  if (!activeSession || !downloadAttachment) return undefined;
  return (attachment) => downloadAttachment(activeSession, attachment);
});

function handleDraftChange(value: string) {
  draft.value = value;
}

function handleEditMessage(content: string, message?: ChatMessage) {
  draftSkills.value = message?.requestedSkills ?? [];
  pendingAnnotations.value = message?.annotations ?? [];
  draft.value = content;
}

function handleCreateSession() {
  if (props.onCreateSession) {
    props.onCreateSession();
    return;
  }
  void ensureSession();
}

function handleRuntimeSend(mode?: ChatSubmitMode) {
  void handleSubmit(mode);
}

const panelCommonProps = computed(() => ({
  onA2UIAction: handleA2uiAction,
  a2uiSession: a2uiSession.value,
  a2uiDisabled: runActive.value || session.value?.status === "ARCHIVED",
  historyLoading: loading.value,
  historyLoadingOlder: historyLoadingOlder.value,
  historyLabels: props.config.historyLabels,
  onLoadOlderHistory: historyCursor.value ? () => { void loadOlderHistory(); } : undefined,
  attachmentDownloader: attachmentDownloader.value,
  attachmentLabels: props.attachmentLabels,
  autoFocusComposer: props.autoFocusComposer,
  composerHeader: props.composerHeader,
  pendingAttachments: pendingAttachments.value,
  pendingAnnotations: pendingAnnotations.value,
  onPendingAnnotationsChange: (value: ChatAnnotation[]) => { pendingAnnotations.value = value; },
  onRemoveAttachment: (id: string) => { pendingAttachments.value = pendingAttachments.value.filter(item => item.id !== id); },
  onAttachFile: handleAttachmentUpload,
  showAttachmentControl: props.showAttachmentControl && Boolean(activeAdapter.value.uploadAttachment),
  attachmentUploadPending: attachmentUploadPending.value,
  createSessionLabel: "Start chat",
  currentUserDisplayName: props.currentUserDisplayName,
  debugOptions: resolvedDebugOptions.value,
  disabledInput: compacting.value || Boolean(props.config.disabledInput) || Boolean(userInputRequest.value),
  draft: draft.value,
  emptyDescription: props.emptyDescription ?? "Create a session to start chatting.",
  emptyTitle: props.emptyTitle,
  formatAnnotationCount: props.formatAnnotationCount,
  annotationLabels: props.config.annotationLabels,
  inputPlaceholder: props.config.inputPlaceholder,
  inputSuggestions: props.config.inputSuggestions,
  skillSuggestionTriggers: props.config.skillSuggestionTriggers,
  inputSuggestionLabels: props.config.inputSuggestionLabels,
  queuedInputPlaceholder: props.config.queuedInputPlaceholder,
  steeringInputPlaceholder: props.config.steeringInputPlaceholder,
  liveAguiAnchorMessageCodes: liveAguiAnchorMessageCodes.value,
  liveAguiEvents: liveAguiEvents.value,
  liveAguiPendingAnchorMessageCode: liveAguiPendingAnchorMessageCode.value,
  liveAguiPending: liveAguiPending.value,
  messages: presentedMessages.value,
  streamingAssistantMessageCode: streamingAssistantMessageCode.value,
  onCreateSession: props.onCreateSession ?? (() => {
    void ensureSession();
  }),
  onNewSession: handleNewSession,
  onDraftChange: handleDraftChange,
  onPasteAttachment: handleAttachmentUpload,
  onEditMessage: compacting.value ? undefined : handleEditMessage,
  onEditQueuedMessage: handleEditQueuedMessage,
  onRemoveQueuedMessage: handleRemoveQueuedMessage,
  onSteerQueuedMessage: (id: string) => { void handleSteer(id); },
  onReorderQueuedMessage: handleReorderQueuedMessage,
  onAnswerUserInput: (answers: ChatUserInputAnswer[]) => {
    void handleAnswerUserInput(answers);
  },
  onSend: (mode?: ChatSubmitMode) => {
    void handleSubmit(mode);
  },
  onStop: () => {
    void handleStop();
  },
  protocolEvents: protocolEvents.value,
  queueDisabled: queueDisabled.value,
  queuedMessages: visibleQueuedSubmissions.value,
  runningSubmitModes: runningSubmitModes.value,
  runningEnterSubmitMode: props.config.runningEnterSubmitMode,
  sendDisabled: sendDisabled.value || Boolean(userInputRequest.value),
      sending: runActive.value,
      session: session.value,
  showAgui: aguiEnabled.value,
  showReasoningCards: props.config.showReasoningCards,
  showHeader: props.showHeader ?? props.config.floating !== false,
  showStop: canStop.value,
  steerDisabled: steerDisabled.value || Boolean(userInputRequest.value),
  queuedSteerDisabled: steering.value || !canSteer.value || Boolean(userInputRequest.value) || userInputAnswerPending.value,
  stopLabel: "Stop",
  title: props.config.title || props.floatingTitle,
  userInputLabels: props.config.userInputLabels,
  userInputRequests: presentedUserInputRequests.value,
  locale: props.locale ?? props.config.locale,
  workRailLabels: props.config.workRailLabels,
  userInputAnswerPending: userInputAnswerPending.value,
  userInputRequest: userInputRequest.value,
}));

function handleWindowStateChange(state: ChatFloatingState) {
  props.onWindowStateChange?.(state);
  emit("window-state-change", state);
}
</script>

<template>
  <ChatWindow
    v-if="config.floating !== false"
    v-bind="panelCommonProps"
    :show-new-session="config.showNewSession"
    :state="windowState"
    :storage-key="config.storageKey || 'agent-ui.chat.runtime.window'"
    :title="floatingTitle"
    :title-subtitle="floatingSubtitle"
    @state-change="handleWindowStateChange"
  >
    <template #footerAddon><fieldset :disabled="compacting" style="display: contents"><slot name="footerAddon" /></fieldset></template>
    <template v-for="name in forwardedSlotNames" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps || {}" />
    </template>
  </ChatWindow>
  <ChatPanel
    v-else
    v-bind="panelCommonProps"
    :show-header="props.showHeader ?? true"
  >
    <template #footerAddon><fieldset :disabled="compacting" style="display: contents"><slot name="footerAddon" /></fieldset></template>
    <template v-for="name in forwardedSlotNames" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps || {}" />
    </template>
  </ChatPanel>
</template>
