import type { ChatGoalIndicatorProps } from "./ChatGoalIndicator";
import { contextCompactionInProgress, historyCompactionEvents } from "@eliteforge/agent-ui-chat-core";
import type { ChatAnnotation } from "@eliteforge/agent-ui-chat-core";
import { ChatA2uiSession, AGENT_CATALOG_ID, type ChatA2uiActionHandler as ActionHandler } from "@eliteforge/agent-ui-chat-core";
import {
  chatErrorPresentation,
  requestedSkillsFromDraft,
  applyMessageProvenance,
  createSteerWorkSegmentEvents,
  aguiEventMillis,
  messageSenderIsHuman,
  type MessageSender,
  AssistantReplyQueue,
  AssistantMessageStream,
  buildTranscriptPresentation,
  belongsToNewChatTurn,
  createMockChatAdapter,
  enqueueChatSubmission,
  ChatAdapterError,
  isSteerQueueFallbackCode,
  mergeChatMessagesChronologically,
  mergeTranscriptAguiEvents,
  normalizeChatSession,
  isAguiPresentationFailureEvent,
  isAguiExecutionTerminalEvent,
  isAguiRequestProgressEvent,
  nativeUserInputRequests,
  activeNativeUserInputRequests,
  nativeUserInputBatchAnswer,
  pendingApprovalRequests,
  historyMessages,
  historyEventRunId,
  historyUserInputRequests,
  type SessionHistory,
  type HistoryCursor,
  removeQueuedChatSubmission,
  reorderQueuedChatSubmission,
  takeNextQueuedChatSubmission,
  type ChatFloatingState,
  type ChatAdapter,
  type AssistantReplyEffect,
  type ChatActiveRun,
  type ChatAguiEvent,
  type ChatAguiStreamEvent,
  type ChatAttachmentLabels,
  type ChatMessageAttachment,
  type ChatClientConfig,
  type ChatDebugOptions,
  type ChatMessage,
  type ChatQueuedSubmission,
  type ChatRunningSubmitMode,
  type ChatRuntimeRunState,
  type ChatSession,
  type ChatSendResult,
  type ChatSubmitMode,
  type ChatUserInputAnswer,
  type ChatUserInputRequest,
  type SendChatMessageInput,
} from "@eliteforge/agent-ui-chat-core";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
  type ReactNode,
  type SetStateAction,
} from "react";
import { ChatPanel, type ChatMarkdownLinkRenderer } from "./ChatPanel";
import { ChatWindow } from "./ChatWindow";

interface ToastLikeCallback {
  (message: string, title?: string): void;
}

export interface ChatRuntimeSubmitter {
  /** Submit host-generated content through the same admission and queue as the composer. */
  submit(input: Pick<SendChatMessageInput, "content" | "attachments">): Promise<boolean>;
}

export interface ChatRuntimeWindowProps {
  /** Forward A2UI actions to the host transport. */
  onA2UIAction?: ActionHandler;
  /** Open a local composer and create its session on the first submission. */
  allowDraftSession?: boolean;
  agentReplyEffect?: AssistantReplyEffect;
  agentReplySpeed?: number;
  adapter?: ChatAdapter;
  /** Load host-staged attachments before a session exists; also used for history. */
  attachmentDownloader?: (attachment: ChatMessageAttachment) => Promise<Blob>;
  attachmentLabels?: ChatAttachmentLabels;
  autoFocusComposer?: boolean;
  config: ChatClientConfig;
  composerRef?: Ref<HTMLTextAreaElement>;
  submitterRef?: Ref<ChatRuntimeSubmitter>;
  composerHeader?: ReactNode;
  createSessionLabel?: string;
  currentUserDisplayName?: string;
  currentSender?: MessageSender;
  draft?: string;
  debugOptions?: ChatDebugOptions;
  emptyDescription?: string;
  emptyTitle?: string;
  /** Use external feedback when the host reports admission errors through onError. */
  errorDisplay?: "inline" | "external";
  floatingTitle?: string;
  floatingSubtitle?: string;
  formatAnnotationCount?: (count: number) => string;
  footerAddon?: ReactNode;
  goal?: ChatGoalIndicatorProps | null;
  headerContent?: ReactNode;
  initialSession?: ChatSession | null;
  onCreateSession?: () => void;
  onDraftChange?: (draft: string) => void;
  onError?: ToastLikeCallback;
  onInfo?: ToastLikeCallback;
  onPendingAttachmentsChange?: (attachments: ChatMessageAttachment[]) => void;
  /** Hosts can stage pasted files locally until the first submission. */
  onPasteAttachment?: (file: File) => void | Promise<void>;
  onRunStateChange?: (state: ChatRuntimeRunState) => void;
  onSessionChange?: (session: ChatSession | null) => void;
  pendingAnnotations?: ChatAnnotation[];
  onPendingAnnotationsChange?: (annotations: ChatAnnotation[]) => void;
  pendingAttachments?: ChatMessageAttachment[];
  createSendInput?: (
    session: ChatSession,
    content: string,
    attachments: ChatMessageAttachment[],
  ) => SendChatMessageInput | null;
  showAttachmentControl?: boolean;
  showHeader?: boolean;
  showHistoryRail?: boolean;
  sidebarContent?: ReactNode;
  windowState?: ChatFloatingState;
  onWindowStateChange?: (state: ChatFloatingState) => void;
  renderMarkdownLink?: ChatMarkdownLinkRenderer;
}

function presentationReadHealthId(sessionId: string, runId: string) {
  return `presentation-read-health:${sessionId}:${runId}`;
}

function removeRecoveredReadHealth(
  current: ChatAguiStreamEvent[],
  sessionId: string,
  protocol: ChatAguiStreamEvent[],
) {
  const terminalRuns = new Set(protocol
    .filter((event) => event.threadId === sessionId && isAguiExecutionTerminalEvent(event))
    .map((event) => event.runId));
  // Only retire our temporary read notice. Native failures and live frames stay intact.
  return current.filter((event) => !(
    event.type === "CUSTOM" && event.name === "agent.presentation.incomplete"
    && event.threadId === sessionId && typeof event.runId === "string"
    && terminalRuns.has(event.runId)
    && event.id === presentationReadHealthId(sessionId, event.runId)
  ));
}

function defaultErrorReporter(message: string) {
  console.error(message);
}

function normalizeOptionalValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function ChatRuntimeWindow({
  allowDraftSession = false,
  agentReplyEffect = "off",
  agentReplySpeed = 120,
  adapter,
  attachmentDownloader: hostAttachmentDownloader,
  attachmentLabels,
  autoFocusComposer = false,
  composerHeader,
  config,
  composerRef,
  submitterRef,
  createSessionLabel = "Start chat",
  currentUserDisplayName,
  currentSender,
  draft: controlledDraft,
  debugOptions,
  emptyDescription,
  emptyTitle,
  errorDisplay = "inline",
  floatingSubtitle = "AI assistant",
  floatingTitle = "Assistant",
  formatAnnotationCount,
  footerAddon,
  goal,
  headerContent,
  initialSession = null,
  onCreateSession,
  onDraftChange,
  onError = defaultErrorReporter,
  onInfo,
  onPendingAttachmentsChange,
  onPasteAttachment,
  onRunStateChange,
  onSessionChange,
  pendingAnnotations: controlledPendingAnnotations,
  onPendingAnnotationsChange,
  pendingAttachments: controlledPendingAttachments,
  createSendInput: createSendInputOverride,
  showAttachmentControl = true,
  showHeader,
  showHistoryRail,
  sidebarContent,
  windowState,
  onWindowStateChange,
  onA2UIAction,
  renderMarkdownLink,
}: ChatRuntimeWindowProps) {
  const activeAdapter = useMemo(
    () => adapter ?? createMockChatAdapter(),
    [adapter],
  );
  const normalizedInitialSession = useMemo(
    () => (initialSession ? normalizeChatSession(initialSession) : null),
    [initialSession],
  );
  const [session, setSession] = useState<ChatSession | null>(normalizedInitialSession);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const a2uiSessionRef = useRef<ChatA2uiSession | null>(null);
  const a2uiSessionId = session?.sessionId ?? "";
  if (!a2uiSessionRef.current || a2uiSessionRef.current.sessionId !== a2uiSessionId) {
    a2uiSessionRef.current = new ChatA2uiSession(a2uiSessionId);
  }
  const a2uiSession = a2uiSessionRef.current;
  const [a2uiEpoch, setA2uiEpoch] = useState(0);
  useEffect(() => a2uiSession.client.subscribe(() => setA2uiEpoch(value => value + 1)), [a2uiSession]);
  const reloadA2ui = useCallback(async (runtime = a2uiSession) => {
    if (!runtime.sessionId || !activeAdapter.loadA2uiState) return;
    const state = await activeAdapter.loadA2uiState(runtime.sessionId);
    runtime.hydrate(state);
  }, [a2uiSession, activeAdapter]);
  useEffect(() => { void reloadA2ui().catch(error => onError(String(error), "A2UI state failed")); }, [reloadA2ui]);
  const receiveA2ui = (event: ChatAguiStreamEvent) => {
    const runtime = a2uiSessionRef.current!;
    try {
      if (!runtime.applyEvent(event)) void reloadA2ui(runtime).catch(error => onError(String(error), "A2UI recovery failed"));
      else if (event.type === "CUSTOM" && event.name === "agent.a2ui" && (!event.threadId || event.threadId === runtime.sessionId)) setA2uiEpoch(value => value + 1);
    }
    catch (error) { onError(String(error), "A2UI presentation failed"); void reloadA2ui(runtime).catch(() => {}); }
  };
  const presentedMessages = useMemo(() => mergeChatMessagesChronologically(messages, a2uiSession.messages()), [messages, a2uiSession, a2uiEpoch]);

  const [historySnapshot, setHistorySnapshot] = useState<SessionHistory | null>(null);
  const [historyCursor, setHistoryCursor] = useState<HistoryCursor | null>(null);
  const [historyLoadingOlder, setHistoryLoadingOlder] = useState(false);
  const [userInputRequest, setUserInputRequest] = useState<ChatUserInputRequest | null>(null);
  const [userInputRequests, setUserInputRequests] = useState<ChatUserInputRequest[]>([]);
  // Accepted replies are transcript data, not part of the refreshable pending queue.
  const [acceptedUserInputRequests, setAcceptedUserInputRequests] = useState<ChatUserInputRequest[]>([]);
  const presentedUserInputRequests = useMemo(() => [...new Map(
    [...userInputRequests, ...acceptedUserInputRequests]
      .filter(request => request.sessionId === session?.sessionId)
      .map(request => [request.requestId, request]),
  ).values()], [userInputRequests, acceptedUserInputRequests, session?.sessionId]);
  const answeredNativeInteractionsRef = useRef(new Set<string>());
  const [userInputAnswerPending, setUserInputAnswerPending] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [aguiEvents, setAguiEvents] = useState<ChatAguiEvent[]>([]);
  const [protocolEvents, setProtocolEvents] = useState<ChatAguiStreamEvent[]>([]);
  const [liveAguiEvents, setLiveAguiEvents] = useState<ChatAguiStreamEvent[]>([]);
  const [liveAguiAnchorMessageCodes, setLiveAguiAnchorMessageCodes] = useState<Record<string, string>>({});
  const [liveAguiPendingAnchorMessageCode, setLiveAguiPendingAnchorMessageCode] = useState("");
  const [internalDraft, setInternalDraft] = useState("");
  const [internalPendingAttachments, setInternalPendingAttachments] = useState<ChatMessageAttachment[]>([]);
  const [attachmentUploadPending, setAttachmentUploadPending] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamingAssistantMessageCode, setStreamingAssistantMessageCode] = useState<string | null>(null);
  const [steering, setSteering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const sessionCreationRef = useRef<Promise<ChatSession> | null>(null);
  const initialSubmitPendingRef = useRef<symbol | null>(null);
  const [liveAguiPending, setLiveAguiPending] = useState(false);
  const [activeRunCode, setActiveRunCode] = useState("");
  const [activeRunSupportsSteer, setActiveRunSupportsSteer] = useState<boolean | null>(null);
  const [remoteActiveRun, setRemoteActiveRun] = useState<ChatActiveRun | null>(null);
  const [activeRunStatusPending, setActiveRunStatusPending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [queuedSubmissions, setQueuedSubmissions] = useState<ChatQueuedSubmission[]>([]);
  const activeSessionCodeRef = useRef("");
  const lastReadErrorRef = useRef("");
  const activeRunCodeRef = useRef("");
  const remoteActiveRunRef = useRef<ChatActiveRun | null>(null);
  const completedRunKeysRef = useRef(new Set<string>());
  const presentationRefreshEpochRef = useRef(0);
  const activeRunStatusPendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const steerAbortRef = useRef<AbortController | null>(null);
  const steeringRef = useRef(false);
  const autoDrainEpochRef = useRef(0);
  const streamAbortReasonsRef = useRef(
    new WeakMap<AbortController, "detach" | "none" | "stop">(),
  );
  const sendingRef = useRef(false);
  const queuedSubmissionsRef = useRef<ChatQueuedSubmission[]>([]);
  const queueGenerationRef = useRef(0);
  const queuedSubmissionSequenceRef = useRef(0);
  const optimisticMessageSequenceRef = useRef(0);
  const currentLiveAguiFailedRunCodesRef = useRef<Set<string>>(new Set());
  const observedRemoteRunRef = useRef<{ runId: string; sessionId: string } | null>(null);
  const drainedRemoteRunKeysRef = useRef<Set<string>>(new Set());
  const suppressedAutoDrainRunKeysRef = useRef<Set<string>>(new Set());
  const draftRef = useRef(controlledDraft ?? "");
  const draftSkillsRef = useRef<string[]>([]);
  const pendingAttachmentsRef = useRef<ChatMessageAttachment[]>(controlledPendingAttachments ?? []);
  const draft = controlledDraft ?? internalDraft;
  const pendingAttachments = controlledPendingAttachments ?? internalPendingAttachments;
  const [internalPendingAnnotations, setInternalPendingAnnotations] = useState<ChatAnnotation[]>([]);
  const pendingAnnotations = controlledPendingAnnotations ?? internalPendingAnnotations;
  const pendingAnnotationsRef = useRef(pendingAnnotations);
  pendingAnnotationsRef.current = pendingAnnotations;
  function setPendingAnnotations(nextValue: SetStateAction<ChatAnnotation[]>) {
    const next = typeof nextValue === "function" ? nextValue(pendingAnnotationsRef.current) : nextValue;
    pendingAnnotationsRef.current = next;
    if (controlledPendingAnnotations === undefined) setInternalPendingAnnotations(next);
    onPendingAnnotationsChange?.(next);
  }


  const agentReplyEffectRef = useRef(agentReplyEffect);
  const agentReplySpeedRef = useRef(agentReplySpeed);
  agentReplyEffectRef.current = agentReplyEffect;
  agentReplySpeedRef.current = agentReplySpeed;
  const appendAssistantText = useCallback((messageCode: string, text: string) => {
    setMessages((current) => current.map((message) => (
      message.messageId === messageCode
        ? { ...message, content: `${message.content}${text}` }
        : message
    )));
  }, []);
  const assistantReplyQueueRef = useRef<AssistantReplyQueue | null>(null);
  if (!assistantReplyQueueRef.current) {
    assistantReplyQueueRef.current = new AssistantReplyQueue(
      appendAssistantText,
      () => agentReplySpeedRef.current,
    );
  }

  function receiveAssistantMessage(stream: AssistantMessageStream, event: ChatAguiStreamEvent, fallbackId?: string) {
    const update = stream.receive(event);
    if (!update) return;
    const { message, delta, ended } = update;
    if (ended) assistantReplyQueueRef.current?.flush(message.messageId);
    setMessages(current => {
      const next = fallbackId ? current.filter(item => item.messageId !== fallbackId) : current;
      if (ended && !message.content.trim()) return next.filter(item => item.messageId !== message.messageId);
      return next.some(item => item.messageId === message.messageId) ? next.map(item => item.messageId === message.messageId ? { ...item, phase: message.phase } : item)
        : [...next, { ...message, content: "" }];
    });
    setStreamingAssistantMessageCode(stream.activeMessageId);
    if (delta) {
      setLiveAguiPending(false);
      assistantReplyQueueRef.current?.enqueue(message.messageId, delta, agentReplyEffectRef.current);
    }
  }

  useEffect(() => () => assistantReplyQueueRef.current?.dispose(), []);
  useEffect(() => {
    if (agentReplyEffect === "off") assistantReplyQueueRef.current?.flush();
  }, [agentReplyEffect]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  function setDraft(nextValue: SetStateAction<string>) {
    const next = typeof nextValue === "function" ? nextValue(draftRef.current) : nextValue;
    draftSkillsRef.current = requestedSkillsFromDraft(next, config.inputSuggestions ?? [], draftSkillsRef.current);
    draftRef.current = next;
    if (controlledDraft === undefined) setInternalDraft(next);
    onDraftChange?.(next);
  }

  function setPendingAttachments(nextValue: SetStateAction<ChatMessageAttachment[]>) {
    const next = typeof nextValue === "function"
      ? nextValue(pendingAttachmentsRef.current)
      : nextValue;
    pendingAttachmentsRef.current = next;
    if (controlledPendingAttachments === undefined) setInternalPendingAttachments(next);
    onPendingAttachmentsChange?.(next);
  }
  const aguiEnabled = config.showAgui !== false && activeAdapter.capabilities.supportsAgui;
  const protocolReplayEnabled = aguiEnabled
    && !activeAdapter.loadHistory
    && activeAdapter.capabilities.supportsProtocolReplay
    && Boolean(activeAdapter.loadProtocolEvents);
  const effectiveActiveRunCode = activeRunCode || remoteActiveRun?.runId || "";
  const runActive = sending || Boolean(remoteActiveRun);
  const [localCompactionSession, setLocalCompactionSession] = useState("");
  const operationKind = runActive ? remoteActiveRun?.operationKind ?? (localCompactionSession === session?.sessionId || contextCompactionInProgress(protocolEvents, effectiveActiveRunCode) ? "ContextCompaction" : undefined) : undefined;
  const compacting = operationKind === "ContextCompaction";
  useEffect(() => { if (!runActive) setLocalCompactionSession(""); }, [runActive]);
  const effectiveRunState = remoteActiveRun?.runId === effectiveActiveRunCode
    ? remoteActiveRun.state
    : "RUNNING";
  const effectiveSupportsSteer = remoteActiveRun?.runId === effectiveActiveRunCode
    ? remoteActiveRun.supportsSteer
    : activeRunSupportsSteer;
  const canSteer = Boolean(
    !compacting && activeAdapter.capabilities.supportsSteer
      && activeAdapter.steerMessage
      && effectiveActiveRunCode
      && effectiveRunState === "RUNNING"
      && effectiveSupportsSteer !== false,
  );
  const runningSubmitModes = useMemo<ChatRunningSubmitMode[]>(
    () => (canSteer ? ["steer", "queue"] : ["queue"]),
    [canSteer],
  );
  const canStop = Boolean(
    !compacting && session
      && !stopping
      && (
        (
          effectiveActiveRunCode
          && effectiveRunState === "RUNNING"
          && activeAdapter.capabilities.supportsStop
          && activeAdapter.stopRun
        )
        || (
          sending
          && activeAdapter.capabilities.supportsAbort
          && !(
            activeAdapter.capabilities.supportsStop
            && activeAdapter.stopRun
          )
        )
      ),
  );

  useEffect(() => {
    onRunStateChange?.({
      loading: loading || activeRunStatusPending,
      active: runActive,
      runId: effectiveActiveRunCode,
      sessionId: session?.sessionId ?? "",
      supportsSteer: canSteer,
      operationKind,
    });
  }, [
    operationKind,
    canSteer,
    effectiveActiveRunCode,
    onRunStateChange,
    loading,
    activeRunStatusPending,
    runActive,
    session?.sessionId,
  ]);
  const visibleQueuedSubmissions = useMemo(
    () => queuedSubmissions.filter((submission) => (
      submission.sessionId === session?.sessionId
    )),
    [queuedSubmissions, session?.sessionId],
  );
  // Effects run after a session-change render. Keep messages from the prior
  // session out of the transcript during that render so their attachments
  // cannot be downloaded through the new session's adapter.
  const visibleMessages = useMemo(
    () => applyMessageProvenance(presentedMessages.filter((message) => message.sessionId === session?.sessionId), [...protocolEvents, ...liveAguiEvents]),
    [presentedMessages, session?.sessionId, protocolEvents, liveAguiEvents],
  );

  function setSendingState(value: boolean) {
    sendingRef.current = value;
    setSending(value);
  }

  function replaceActiveRunStatusPending(value: boolean) {
    activeRunStatusPendingRef.current = value;
    setActiveRunStatusPending(value);
  }

  function currentStreamAbortReason(
    controller: AbortController,
  ): "detach" | "none" | "stop" {
    return streamAbortReasonsRef.current.get(controller) ?? "none";
  }

  function detachRunObserver(
    reason: "detach" | "stop",
    releaseState = true,
  ) {
    const controller = abortRef.current;
    if (!controller) return false;
    streamAbortReasonsRef.current.set(controller, reason);
    abortRef.current = null;
    if (releaseState) {
      setSendingState(false);
      setLiveAguiPending(false);
      activeRunCodeRef.current = "";
      setActiveRunCode("");
      setActiveRunSupportsSteer(null);
    }
    controller.abort();
    return true;
  }

  function detachSteerObserver(releaseState = true) {
    const controller = steerAbortRef.current;
    if (!controller) return false;
    steerAbortRef.current = null;
    if (releaseState) {
      steeringRef.current = false;
      setSteering(false);
    }
    controller.abort();
    return true;
  }

  function replaceRemoteActiveRun(next: ChatActiveRun | null) {
    if (next && completedRunKeysRef.current.has(`${activeSessionCodeRef.current}:${next.runId}`)) next = null;
    remoteActiveRunRef.current = next;
    setRemoteActiveRun(next);
  }

  function acknowledgeCompletedTurn(sessionId: string, runId: string) {
    const observedRunId = activeRunCodeRef.current;
    for (const id of [observedRunId, runId]) {
      if (id) completedRunKeysRef.current.add(`${sessionId}:${id}`);
    }
    replaceRemoteActiveRun(remoteActiveRunRef.current);
    replaceActiveRunStatusPending(false);
    return ++presentationRefreshEpochRef.current;
  }

  const loadActiveRunSnapshot = useCallback(async (
    sessionId: string,
    signal?: AbortSignal,
  ) => {
    // Hosts distinguish foreground execution from internal work such as
    // session summarization. History's active runs include both.
    if (activeAdapter.capabilities.supportsActiveRun && activeAdapter.getActiveRun) {
      return (await activeAdapter.getActiveRun(sessionId, signal)).activeRun;
    }
    if (activeAdapter.loadHistory) {
      const page = await activeAdapter.loadHistory(sessionId, { limit: 20, cursor: null }, signal);
      const run = page.activeRuns.find((r) => r.status === "Running" && r.parentRunId === null);
      return run ? { runId: run.id, runtimeAdapterKey: "framework", supportsSteer: activeAdapter.capabilities.supportsSteer ?? false, state: "RUNNING" as const } : null;
    }
    if (
      !activeAdapter.capabilities.supportsActiveRun
      || !activeAdapter.getActiveRun
    ) {
      return null;
    }
    const result = await activeAdapter.getActiveRun(sessionId, signal);
    return result.activeRun;
  }, [activeAdapter]);

  async function refreshPresentationAfterTurn(sessionId: string, runId: string, canApply = () => true): Promise<boolean> {
    if (activeAdapter.loadHistory) return true;
    if (!aguiEnabled) return true;
    const [audits, protocol] = await Promise.allSettled([
      activeAdapter.loadAguiEvents(sessionId),
      protocolReplayEnabled && activeAdapter.loadProtocolEvents ? activeAdapter.loadProtocolEvents(sessionId) : Promise.resolve([]),
    ]);
    if (activeSessionCodeRef.current !== sessionId || !canApply()) return false;
    const errors = [audits, protocol].flatMap((part) => part.status === "rejected" ? [part.reason] : []);
    reportReadErrors(sessionId, errors);
    const incomplete = errors.length > 0 || (audits.status === "fulfilled" && audits.value.some((event) => event.metadata?.replayIncomplete === "true"));
    const health: ChatAguiStreamEvent = { type: "CUSTOM", name: "agent.presentation.incomplete", id: presentationReadHealthId(sessionId, runId), runId, threadId: sessionId, timestamp: Date.now(), value: { code: "AGENT_AGUI_REPLAY_INCOMPLETE" } };
    if (audits.status === "fulfilled") setAguiEvents(audits.value);
    if (protocol.status === "fulfilled" && protocolReplayEnabled) {
      setProtocolEvents(incomplete ? [...protocol.value, health] : protocol.value);
      if (!incomplete) {
        setLiveAguiEvents((current) => removeRecoveredReadHealth(current, sessionId, protocol.value));
      }
      // Release the live source only after a durable terminal is actually replayed.
      return protocol.value.some((event) => event.runId === runId && ["RUN_FINISHED", "RUN_ERROR"].includes(event.type));
    }
    if (incomplete) setLiveAguiEvents((current) => [...current, health]);
    return false;
  }

  async function refreshCompletedTurn(sessionId: string, runId: string, epoch: number) {
    const canApply = () => activeSessionCodeRef.current === sessionId
      && presentationRefreshEpochRef.current === epoch && !sendingRef.current;
    if (activeAdapter.loadHistory) {
      try {
        const page = await activeAdapter.loadHistory(sessionId, { limit: 20, cursor: null });
        if (!canApply()) return;
        setMessages(historyMessages(page, config.userInputLabels)); setHistorySnapshot(page); setHistoryCursor(page.nextCursor);
        const pending = historyUserInputRequests(page, config.userInputLabels);
        setUserInputRequests(pending); setUserInputRequest(pending[0] ?? null);
        setProtocolEvents(historyCompactionEvents(page)); setAguiEvents([]);
        const committed = new Set(page.runs.filter((r) => ["Completed", "Failed", "Interrupted", "Waiting"].includes(r.status)).map((r) => r.id));
        setLiveAguiEvents((events) => events.filter((e) => !committed.has(historyEventRunId(e))));
        setLiveAguiAnchorMessageCodes({});
      } catch (error) { reportReadErrors(sessionId, [error]); }
      return;
    }
    const [snapshot, presentation] = await Promise.allSettled([
      activeAdapter.loadMessages(sessionId),
      refreshPresentationAfterTurn(sessionId, runId, canApply),
    ]);
    if (!canApply()) return;
    if (snapshot.status === "fulfilled") setMessages(snapshot.value);
    if (presentation.status === "fulfilled" && presentation.value) {
      setLiveAguiEvents([]);
      setLiveAguiAnchorMessageCodes({});
    }
  }

  async function refreshActiveRun(sessionId: string) {
    try {
      const next = await loadActiveRunSnapshot(sessionId);
      if (activeSessionCodeRef.current === sessionId) {
        replaceRemoteActiveRun(next);
        if (next) {
          replaceActiveRunStatusPending(false);
        } else if (
          activeRunStatusPendingRef.current
          && !sendingRef.current
        ) {
          replaceActiveRunStatusPending(false);
          const nextSubmission = takeNextQueuedSubmission(sessionId);
          if (nextSubmission && session?.sessionId === sessionId) {
            void runMessage(session, nextSubmission.input, nextSubmission);
          }
        }
      }
      return next;
    } catch {
      return undefined;
    }
  }

  function replaceQueuedSubmissions(next: ChatQueuedSubmission[]) {
    queuedSubmissionsRef.current = next;
    setQueuedSubmissions(next);
  }

  function createSendInput(
    activeSession: ChatSession,
    content: string,
    attachments: ChatMessageAttachment[] = [],
    requestedSkills = requestedSkillsFromDraft(content, config.inputSuggestions ?? [], draftSkillsRef.current),
    annotations = pendingAnnotations,
  ): SendChatMessageInput | null {
    if (createSendInputOverride) {
      const input = createSendInputOverride(activeSession, content, attachments);
      return input ? { ...input, requestedSkills, annotations } : null;
    }
    const input: SendChatMessageInput = {
      clientCapabilities: { userInputRequests: true },
      content,
      annotations,
      requestedSkills,
    };
    if (attachments.length) input.attachments = attachments;
    return input;
  }

  function enqueueSubmission(
    activeSession: ChatSession,
    input: SendChatMessageInput,
    position: "front" | "back" = "back",
  ) {
    queuedSubmissionSequenceRef.current += 1;
    const submission: ChatQueuedSubmission = {
      id: `QUEUED-${Date.now()}-${queuedSubmissionSequenceRef.current}`,
      input,
      sessionId: activeSession.sessionId,
    };
    replaceQueuedSubmissions(
      position === "front"
        ? [submission, ...queuedSubmissionsRef.current]
        : enqueueChatSubmission(queuedSubmissionsRef.current, submission),
    );
    return submission;
  }

  function takeNextQueuedSubmission(sessionId: string) {
    const result = takeNextQueuedChatSubmission(
      queuedSubmissionsRef.current,
      sessionId,
    );
    replaceQueuedSubmissions(result.remaining);
    return result.submission;
  }

  useEffect(() => {
    setSession((current) => {
      if (!normalizedInitialSession) {
        return current ? null : current;
      }

      if (
        current
        && current.sessionId === normalizedInitialSession.sessionId
        && current.updatedAt === normalizedInitialSession.updatedAt
        && current.lastRunId === normalizedInitialSession.lastRunId
        && current.lastRunStatus === normalizedInitialSession.lastRunStatus
        && current.title === normalizedInitialSession.title
      ) {
        return current;
      }

      return normalizedInitialSession;
    });
  }, [normalizedInitialSession]);

  useEffect(() => {
    const nextSessionCode = session?.sessionId ?? "";
    const previousSessionCode = activeSessionCodeRef.current;
    if (
      previousSessionCode
      && previousSessionCode !== nextSessionCode
    ) {
      detachRunObserver("detach");
      detachSteerObserver();
    }
    if (previousSessionCode !== nextSessionCode) {
      presentationRefreshEpochRef.current += 1;
      replaceRemoteActiveRun(null);
      replaceActiveRunStatusPending(false);
      observedRemoteRunRef.current = null;
      activeRunCodeRef.current = "";
      setActiveRunCode("");
      setActiveRunSupportsSteer(null);
      setSendingState(false);
      setSteering(false);
      steeringRef.current = false;
      setMessages([]);
      setAguiEvents([]);
      setProtocolEvents([]);
      setUserInputRequests([]);
      setUserInputRequest(null);
      setSubmissionError(null);
      setLiveAguiEvents([]);
      setLiveAguiPending(false);
      setLiveAguiAnchorMessageCodes({});
      setLiveAguiPendingAnchorMessageCode("");
      setPendingAttachments([]);
      setPendingAnnotations([]);
    }
    activeSessionCodeRef.current = nextSessionCode;
    onSessionChange?.(session);
  }, [onSessionChange, session]);

  useEffect(() => () => {
    presentationRefreshEpochRef.current += 1;
    detachRunObserver("detach", false);
    detachSteerObserver(false);
  }, []);

  const liveNativePendingRequests = useMemo(() => nativeUserInputRequests(
    mergeTranscriptAguiEvents(protocolEvents, liveAguiEvents) as ChatAguiStreamEvent[],
    session?.sessionId ?? "", config.userInputLabels,
  ), [protocolEvents, liveAguiEvents, session?.sessionId, config.userInputLabels]);
  const nativePendingRequests = useMemo(() => {
    const durable = historySnapshot ? historyUserInputRequests(historySnapshot, config.userInputLabels).filter((r) => r.nativeInteraction) : [];
    const pending = new Map(durable.map((r) => [r.requestId, r]));
    liveNativePendingRequests.forEach((r) => pending.set(r.requestId, r));
    return activeNativeUserInputRequests([...pending.values()],
      mergeTranscriptAguiEvents(protocolEvents, liveAguiEvents) as ChatAguiStreamEvent[], session?.sessionId ?? "", historySnapshot);
  }, [historySnapshot, liveNativePendingRequests, config.userInputLabels, protocolEvents, liveAguiEvents, session?.sessionId]);
  useEffect(() => { answeredNativeInteractionsRef.current.clear(); setAcceptedUserInputRequests([]); }, [session?.sessionId]);
  useEffect(() => {
    const pending = nativePendingRequests.filter((request) => !answeredNativeInteractionsRef.current.has(request.requestId));
    setUserInputRequests((current) => {
      const legacy = current.filter((request) => !request.nativeInteraction);
      const legacyPendingIds = new Set(legacy.filter((request) => request.status === "Pending").map((request) => request.requestId));
      return [...legacy, ...pending.filter((request) => !legacyPendingIds.has(request.requestId))];
    });
    setUserInputRequest((current) => current && !current.nativeInteraction ? current : pending[0] ?? null);
  }, [nativePendingRequests]);

  const readSessionStateParts = useCallback(async (sessionId: string, signal?: AbortSignal) => {
    if (activeAdapter.loadHistory) {
      const page = await activeAdapter.loadHistory(sessionId, { limit: 20, cursor: null }, signal);
      const running = page.activeRuns.find((r) => r.status === "Running" && r.parentRunId === null);
      const errors: unknown[] = [];
      let foreground: ChatActiveRun | null | undefined;
      if (activeAdapter.capabilities.supportsActiveRun && activeAdapter.getActiveRun) {
        try { foreground = await loadActiveRunSnapshot(sessionId, signal); }
        catch (error) { errors.push(error); }
      } else {
        foreground = running ? { runId: running.id, runtimeAdapterKey: "framework", supportsSteer: activeAdapter.capabilities.supportsSteer ?? false, state: "RUNNING" } : null;
      }
      const notices = historyCompactionEvents(page);
      return { nextHistory: page, nextMessages: historyMessages(page, config.userInputLabels), nextAguiEvents: [] as ChatAguiEvent[], nextProtocolEvents: notices,
        healthyProtocolEvents: notices, healthNotice: undefined,
        nextActiveRun: foreground,
        nextUserInputRequests: historyUserInputRequests(page, config.userInputLabels), errors };
    }
    const parts = await Promise.allSettled([
      activeAdapter.loadMessages(sessionId),
      aguiEnabled ? activeAdapter.loadAguiEvents(sessionId) : Promise.resolve([]),
      protocolReplayEnabled && activeAdapter.loadProtocolEvents
        ? activeAdapter.loadProtocolEvents(sessionId) : Promise.resolve([]),
      loadActiveRunSnapshot(sessionId, signal).catch(() => undefined),
      activeAdapter.capabilities.supportsUserInputRequests && activeAdapter.loadUserInputRequests
        ? activeAdapter.loadUserInputRequests(sessionId, signal) : Promise.resolve([]),
    ] as const);
    const value = <T,>(part: PromiseSettledResult<T>): T | undefined =>
      part.status === "fulfilled" ? part.value : undefined;
    const audits = value(parts[1]);
    const presentationIncomplete = parts[1].status === "rejected" || parts[2].status === "rejected"
      || Boolean(audits?.some((event) => event.metadata?.replayIncomplete === "true"));
    const knownAudit = audits?.slice().reverse().find((event) => Boolean(event.runId));
    const knownMessage = value(parts[0])?.slice().reverse().find((message) => Boolean(message.runId));
    const healthRunId = knownAudit?.runId || knownMessage?.runId || value(parts[3])?.runId;
    const healthNotice: ChatAguiStreamEvent | undefined = presentationIncomplete && healthRunId ? {
      type: "CUSTOM", name: "agent.presentation.incomplete", runId: healthRunId, threadId: sessionId,
      id: presentationReadHealthId(sessionId, healthRunId),
      timestamp: Date.parse(knownAudit?.occurredAt || knownMessage?.createdAt || "") || Date.now(),
      value: { code: "AGENT_AGUI_REPLAY_INCOMPLETE" },
    } : undefined;
    const protocol = value(parts[2]);
    return {
      nextHistory: undefined,
      nextMessages: value(parts[0]),
      nextAguiEvents: parts[2].status === "rejected"
        ? audits?.map((event) => ({ ...event, metadata: { ...event.metadata, replayIncomplete: "true" } }))
        : audits,
      nextProtocolEvents: protocol && healthNotice ? [...protocol, healthNotice] : protocol,
      healthyProtocolEvents: !presentationIncomplete ? protocol : undefined,
      healthNotice,
      nextActiveRun: value(parts[3]),
      nextUserInputRequests: value(parts[4]),
      errors: parts.flatMap((part) => part.status === "rejected" ? [part.reason] : []),
    };
  }, [activeAdapter, aguiEnabled, protocolReplayEnabled, loadActiveRunSnapshot, config.userInputLabels]);

  async function loadOlderHistory() {
    const sessionId = session?.sessionId;
    const cursor = historyCursor;
    if (!sessionId || !cursor || !activeAdapter.loadHistory || historyLoadingOlder) return;
    setHistoryLoadingOlder(true);
    try {
      const page = await activeAdapter.loadHistory(sessionId, { limit: 20, cursor });
      if (activeSessionCodeRef.current !== sessionId) return;
      setMessages((current) => mergeChatMessagesChronologically(historyMessages(page, config.userInputLabels), current));
      setProtocolEvents((current) => mergeTranscriptAguiEvents(historyCompactionEvents(page), current) as ChatAguiStreamEvent[]);
      setHistoryCursor(page.nextCursor);
    } catch (error) {
      if ((error as { status?: number })?.status === 409 && activeSessionCodeRef.current === sessionId) {
        try {
          const page = await activeAdapter.loadHistory(sessionId, { limit: 20, cursor: null });
          if (activeSessionCodeRef.current === sessionId) {
            setMessages(historyMessages(page, config.userInputLabels)); setHistorySnapshot(page); setHistoryCursor(page.nextCursor);
            setProtocolEvents(historyCompactionEvents(page));
            const pending = historyUserInputRequests(page, config.userInputLabels);
            setUserInputRequests(pending); setUserInputRequest(pending[0] ?? null);
          }
        } catch (reloadError) { reportReadErrors(sessionId, [reloadError]); }
      } else reportReadErrors(sessionId, [error]);
    }
    finally { if (activeSessionCodeRef.current === sessionId) setHistoryLoadingOlder(false); }
  }

  const reportReadErrors = useCallback((sessionId: string, errors: unknown[]) => {
    if (!errors.length) { lastReadErrorRef.current = ""; return; }
    const messages = errors.map((error) => error instanceof Error ? error.message : "Chat data could not be loaded");
    const signature = JSON.stringify([sessionId, messages]);
    if (lastReadErrorRef.current === signature) return;
    lastReadErrorRef.current = signature;
    onError(messages.join("; "), "Chat load failed");
  }, [onError]);

  useEffect(() => {
    let active = true;
    const abortController = new AbortController();
    async function loadSessionState() {
      const readEpoch = presentationRefreshEpochRef.current;
      if (!session?.sessionId) {
        setMessages([]);
        setAguiEvents([]);
        setProtocolEvents([]);
        setUserInputRequests([]);
        replaceRemoteActiveRun(null);
        return;
      }
      setLoading(true);
      setMessages([]); setHistorySnapshot(null); setHistoryCursor(null);
      try {
        const { nextMessages, nextAguiEvents, nextProtocolEvents, nextActiveRun, nextUserInputRequests, nextHistory, errors, healthNotice, healthyProtocolEvents } =
          await readSessionStateParts(session.sessionId, abortController.signal);
        if (!active || readEpoch !== presentationRefreshEpochRef.current) return;
        reportReadErrors(session.sessionId, errors);
        if (!sendingRef.current && nextMessages !== undefined) {
          setMessages(nextMessages);
          if (nextHistory) { setHistorySnapshot(nextHistory); setHistoryCursor(nextHistory.nextCursor); }
        }
        if (healthyProtocolEvents !== undefined) {
          setLiveAguiEvents((current) => removeRecoveredReadHealth(current, session.sessionId, healthyProtocolEvents));
        }
        if (nextAguiEvents !== undefined) setAguiEvents(nextAguiEvents);
        if (nextProtocolEvents !== undefined) setProtocolEvents(nextProtocolEvents);
        else if (healthNotice) setProtocolEvents((current) => [
          ...current.filter((event) => !(event.type === "CUSTOM" && event.name === "agent.presentation.incomplete")),
          healthNotice,
        ]);
        if (nextUserInputRequests !== undefined) {
          setUserInputRequests(nextUserInputRequests);
          setUserInputRequest(nextUserInputRequests.find((request) => request.status === "Pending") ?? null);
        }
        if (nextActiveRun !== undefined) {
          replaceRemoteActiveRun(nextActiveRun);
          if (nextActiveRun) {
            replaceActiveRunStatusPending(false);
          } else if (
            activeRunStatusPendingRef.current
            && !sendingRef.current
          ) {
            replaceActiveRunStatusPending(false);
            const nextSubmission = takeNextQueuedSubmission(
              session.sessionId,
            );
            if (nextSubmission) {
              void runMessage(
                session,
                nextSubmission.input,
                nextSubmission,
              );
            }
          }
        }
      } catch (error) {
        if (!active || abortController.signal.aborted) return;
        onError(error instanceof Error ? error.message : "Chat data could not be loaded", "Chat load failed");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadSessionState();
    return () => {
      active = false;
      abortController.abort();
    };
  }, [activeAdapter, aguiEnabled, onError, protocolReplayEnabled, readSessionStateParts, reportReadErrors, session?.sessionId]);

  const shouldPollData = Boolean(
    session?.sessionId
    && (
      runActive
      || activeRunStatusPending
      || Boolean(userInputRequest)
      || visibleQueuedSubmissions.length > 0
    ),
  );

  useEffect(() => {
    if (!session?.sessionId || !shouldPollData) return;
    const intervalId = window.setInterval(async () => {
      if (!session?.sessionId) return;
      const readEpoch = presentationRefreshEpochRef.current;
      try {
        const { nextMessages, nextAguiEvents, nextProtocolEvents, nextActiveRun, nextUserInputRequests, nextHistory, errors, healthNotice, healthyProtocolEvents } =
          await readSessionStateParts(session.sessionId);
        if (activeSessionCodeRef.current !== session.sessionId || readEpoch !== presentationRefreshEpochRef.current) return;
        reportReadErrors(session.sessionId, errors);
        if (!sendingRef.current && nextMessages !== undefined) {
          setMessages(nextMessages);
          if (nextHistory) { setHistorySnapshot(nextHistory); setHistoryCursor(nextHistory.nextCursor); }
        }
        if (healthyProtocolEvents !== undefined) {
          setLiveAguiEvents((current) => removeRecoveredReadHealth(current, session.sessionId, healthyProtocolEvents));
        }
        if (nextAguiEvents !== undefined) setAguiEvents(nextAguiEvents);
        if (nextProtocolEvents !== undefined) setProtocolEvents(nextProtocolEvents);
        else if (healthNotice) setProtocolEvents((current) => [
          ...current.filter((event) => !(event.type === "CUSTOM" && event.name === "agent.presentation.incomplete")),
          healthNotice,
        ]);
        if (nextUserInputRequests !== undefined) {
          setUserInputRequests(nextUserInputRequests);
          setUserInputRequest(nextUserInputRequests.find((request) => request.status === "Pending") ?? null);
        }
        if (nextActiveRun !== undefined) {
          replaceRemoteActiveRun(nextActiveRun);
          if (nextActiveRun) {
            replaceActiveRunStatusPending(false);
          } else if (
            activeRunStatusPendingRef.current
            && !sendingRef.current
          ) {
            replaceActiveRunStatusPending(false);
            const nextSubmission = takeNextQueuedSubmission(
              session.sessionId,
            );
            if (nextSubmission) {
              void runMessage(
                session,
                nextSubmission.input,
                nextSubmission,
              );
            }
          }
        }
      } catch {
        // Keep last successful snapshot until the next poll.
      }
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [activeAdapter, aguiEnabled, protocolReplayEnabled, readSessionStateParts, reportReadErrors, session?.sessionId, shouldPollData, userInputRequest]);

  useEffect(() => {
    const sessionId = session?.sessionId;
    if (!sessionId) {
      observedRemoteRunRef.current = null;
      return;
    }
    if (remoteActiveRun) {
      observedRemoteRunRef.current = {
        runId: remoteActiveRun.runId,
        sessionId,
      };
      return;
    }

    const observed = observedRemoteRunRef.current;
    if (!observed || observed.sessionId !== sessionId) return;
    if (
      protocolReplayEnabled
      && !protocolEvents.some((event) => (
        String(event.runId ?? event.runId ?? "") === observed.runId
        && ["RUN_ERROR", "RUN_FINISHED"].includes(
          String(event.type).toUpperCase(),
        )
      ))
    ) {
      return;
    }
    observedRemoteRunRef.current = null;
    const runKey = `${sessionId}:${observed.runId}`;
    const autoDrainSuppressed = suppressedAutoDrainRunKeysRef.current.delete(runKey);
    if (
      sendingRef.current
      || drainedRemoteRunKeysRef.current.has(runKey)
      || autoDrainSuppressed
    ) {
      drainedRemoteRunKeysRef.current.add(runKey);
      return;
    }
    drainedRemoteRunKeysRef.current.add(runKey);
    const nextSubmission = takeNextQueuedSubmission(sessionId);
    if (nextSubmission && session.sessionId === activeSessionCodeRef.current) {
      void runMessage(session, nextSubmission.input, nextSubmission);
    }
  }, [protocolEvents, protocolReplayEnabled, remoteActiveRun, session]);

  const sendDisabled = useMemo(() => {
    if (compacting || loading || creatingSession || config.disabledInput || userInputRequest || userInputAnswerPending) return true;
    if (!draft.trim() && !pendingAttachments.length && !pendingAnnotations.length) return true;
    return false;
  }, [compacting, config.disabledInput, creatingSession, draft, loading, pendingAttachments.length, pendingAnnotations.length, session, userInputAnswerPending, userInputRequest]);
  const queueDisabled = useMemo(
    () => compacting || loading || Boolean(config.disabledInput) || Boolean(userInputRequest) || userInputAnswerPending || (!draft.trim() && !pendingAttachments.length && !pendingAnnotations.length) || !session,
    [compacting, config.disabledInput, draft, loading, pendingAttachments.length, pendingAnnotations.length, session, userInputAnswerPending, userInputRequest],
  );
  const steerDisabled = queueDisabled || steering || !canSteer;

  async function ensureSession() {
    if (session) return session;
    if (!sessionCreationRef.current) {
      setCreatingSession(true);
      sessionCreationRef.current = activeAdapter.createSession({
        title: normalizeOptionalValue(config.title) ?? floatingTitle,
      }).then((created) => {
        activeSessionCodeRef.current = created.sessionId;
        a2uiSessionRef.current = new ChatA2uiSession(created.sessionId);
        setSession(created);
        setMessages([]);
        setAguiEvents([]);
        setProtocolEvents([]);
        return created;
      }).finally(() => {
        sessionCreationRef.current = null;
        setCreatingSession(false);
      });
    }
    return sessionCreationRef.current;
  }

  function requestSessionCreation() {
    void ensureSession().catch((error) => {
      onError(error instanceof Error ? error.message : "Chat session creation failed", "Chat send failed");
    });
  }

  async function handleAttachmentUpload(file: File) {
    if (!file || !activeAdapter.uploadAttachment || attachmentUploadPending) return;
    try {
      const activeSession = await ensureSession();
      setAttachmentUploadPending(true);
      const attachment = await activeAdapter.uploadAttachment(activeSession, {
        file,
        kind: file.type.startsWith("image/") ? "image" : "file",
        summary: file.name,
      });
      if (activeSessionCodeRef.current === activeSession.sessionId) {
        setPendingAttachments((current) => [...current, attachment]);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "Chat attachment upload failed", "Attachment upload failed");
    } finally {
      setAttachmentUploadPending(false);
    }
  }

  async function runMessage(
    activeSession: ChatSession,
    sendInput: SendChatMessageInput,
    sourceSubmission: ChatQueuedSubmission | null = null,
  ) {
    const queueGeneration = queueGenerationRef.current;
    const restoreSourceSubmission = () => {
      if (!sourceSubmission || queueGeneration !== queueGenerationRef.current) return;
      const remaining = removeQueuedChatSubmission(
        queuedSubmissionsRef.current,
        sourceSubmission.id,
      );
      replaceQueuedSubmissions([sourceSubmission, ...remaining]);
    };
    if (sendingRef.current || remoteActiveRunRef.current) {
      restoreSourceSubmission();
      return false;
    }
    sendInput = { ...sendInput, clientCapabilities: { ...sendInput.clientCapabilities, a2ui: { version: "v0.9.1", catalogIds: [AGENT_CATALOG_ID] } }, a2uiMetadata: a2uiSessionRef.current!.metadata(sendInput.metadata?.agentId as string | undefined ?? "main-agent") };
    const content = sendInput.content.trim();
    if (!content && !(sendInput.attachments?.length) && !(sendInput.annotations?.length)) {
      restoreSourceSubmission();
      return false;
    }
    const submittedAttachments = sendInput.attachments ?? [];
    const autoDrainEpoch = autoDrainEpochRef.current;
    const abortController = new AbortController();
    let presentationEpoch = ++presentationRefreshEpochRef.current;
    abortRef.current = abortController;
    streamAbortReasonsRef.current.set(abortController, "none");
    currentLiveAguiFailedRunCodesRef.current.clear();
    setSubmissionError(null);
    activeRunCodeRef.current = "";
    setActiveRunCode("");
    setActiveRunSupportsSteer(null);
    optimisticMessageSequenceRef.current += 1;
    const optimisticKey = `${Date.now()}-${optimisticMessageSequenceRef.current}`;
    const optimisticCreatedAt = new Date().toISOString();
    const optimisticUserCode = `LOCAL-${optimisticKey}-USER`;
    const optimisticAssistantCode = `LOCAL-${optimisticKey}-ASSISTANT`;
    const textStream = new AssistantMessageStream(activeSession);
    const flushTurnText = () => {
      for (const id of [optimisticAssistantCode, ...textStream.messageIds]) assistantReplyQueueRef.current?.flush(id);
    };
    setStreamingAssistantMessageCode(optimisticAssistantCode);
    setLocalCompactionSession(sendInput.content.trim().toLowerCase() === "/compact" ? activeSession.sessionId : "");
    setSendingState(true);
    setLiveAguiPending(aguiEnabled);
    setMessages((current) => [
      ...current,
      {
        actor: currentSender?.displayName ?? currentUserDisplayName ?? "User",
        provenance: { sender: currentSender ?? { kind: "user", displayName: currentUserDisplayName || "User" } },
        channel: "conversation",
        content,
        annotations: sendInput.annotations ?? [],
        attachments: submittedAttachments,
        requestedSkills: sendInput.requestedSkills ?? [],
        createdAt: optimisticCreatedAt,
        id: -Date.now() - optimisticMessageSequenceRef.current,
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
        id: -Date.now() - optimisticMessageSequenceRef.current - 1,
        messageId: optimisticAssistantCode,
        role: "ASSISTANT",
        runId: null,
        sessionId: activeSession.sessionId,
      },
    ]);

    let completed = false;
    let streamSucceeded = false;
    let runConflictDetected = false;
    // Once a request crosses the transport boundary, automatic retry is unsafe:
    // the backend may already have persisted its USER message. The sole safe
    // restore path is RUN_ALREADY_ACTIVE, which rejects before admission.
    let shouldRestoreSourceSubmission = false;
    let completedSession: ChatSession | null = null;
    let completedRunId = "";
    try {
      const result = await activeAdapter.streamMessage(
        activeSession,
        sendInput,
        {
          onAguiEvent: (event) => {
            if (!belongsToNewChatTurn(event, activeSession.sessionId, optimisticCreatedAt)) return;
            if (abortRef.current !== abortController) return;
            if (isAguiRequestProgressEvent(event)) {
              setLiveAguiPending(false);
              setLiveAguiPendingAnchorMessageCode("");
            }
            receiveA2ui(event);
            const runId = String(event.runId ?? event.runId ?? "");
            if (typeof event.supportsSteer === "boolean") {
              setActiveRunSupportsSteer(event.supportsSteer);
            }
            if (runId && !activeRunCodeRef.current) {
              activeRunCodeRef.current = runId;
              setActiveRunCode(runId);
            }
            receiveAssistantMessage(textStream, event, optimisticAssistantCode);
            if (!aguiEnabled) return;
            setLiveAguiEvents((current) => [...current, event]);
            if (runId) {
              const eventType = String(event.type ?? "").toUpperCase();
              if ((eventType === "RUN_ERROR" || eventType === "AGENT.RUN.FAILED") && !isAguiPresentationFailureEvent(event)) {
                currentLiveAguiFailedRunCodesRef.current.add(runId);
              }
              setLiveAguiAnchorMessageCodes((current) => (
                current[runId]
                  ? current
                  : { ...current, [runId]: optimisticUserCode }
              ));
            }
          },
          onDelta: (delta) => {
            if (abortRef.current !== abortController) return;
            if (textStream.identified) return;
            setLiveAguiPending(false);
            assistantReplyQueueRef.current?.enqueue(
              optimisticAssistantCode,
              delta,
              agentReplyEffectRef.current,
            );
          },
        },
        abortController.signal,
      );
      const resolvedAbortReason = currentStreamAbortReason(abortController);
      if (resolvedAbortReason !== "none") {
        streamSucceeded = true;
        shouldRestoreSourceSubmission = false;
        // A transport is allowed to settle normally while its observer is being
        // aborted. Route that race through regular abort handling without
        // committing stale UI state or re-sending an already accepted input.
        throw new Error("Chat stream observer closed");
      }
      if (activeSessionCodeRef.current !== activeSession.sessionId) {
        streamSucceeded = true;
        shouldRestoreSourceSubmission = false;
        return false;
      }
      // The product result acknowledges execution and persistence. Animation
      // and replay reads must not keep the completed executor in the composer.
      flushTurnText();
      presentationEpoch = acknowledgeCompletedTurn(result.session.sessionId, result.run.runId);
      if (result.run.status === "COMPLETED") {
        setLiveAguiEvents((current) => current.some((event) => (
          isAguiExecutionTerminalEvent(event) && historyEventRunId(event) === result.run.runId
        )) ? current : [...current, {
          type: "RUN_FINISHED",
          threadId: activeSession.sessionId,
          runId: result.run.runId,
          timestamp: Date.now(),
          outcome: { type: "success" },
        }]);
      }
      streamSucceeded = true;
      shouldRestoreSourceSubmission = false;
      setSession(result.session);
      setUserInputRequest(result.userInputRequest?.status === "Pending" ? result.userInputRequest : null);
      const pendingUserInputRequest = result.userInputRequest;
      if (pendingUserInputRequest?.status === "Pending") {
        setUserInputRequests((current) => [
          ...current.filter((request) => request.requestId !== pendingUserInputRequest.requestId),
          pendingUserInputRequest,
        ]);
      }
      setMessages((current) => textStream.settle(
        current, result.messages, [optimisticUserCode, optimisticAssistantCode], result.run,
      ));
      completedSession = result.session;
      completedRunId = result.run.runId;
      completed = currentStreamAbortReason(abortController) === "none"
        && autoDrainEpochRef.current === autoDrainEpoch;
    } catch (error) {
      flushTurnText();
      const abortReason = currentStreamAbortReason(abortController);
      const runConflict = error instanceof ChatAdapterError
        && error.code === "RUN_ALREADY_ACTIVE";
      runConflictDetected = runConflict;
      const admissionRejected = error instanceof ChatAdapterError && error.rejectedBeforeAdmission === true;
      const stillViewingSession = activeSessionCodeRef.current === activeSession.sessionId;
      if (admissionRejected && stillViewingSession) {
        shouldRestoreSourceSubmission = Boolean(sourceSubmission);
        if (!sourceSubmission && !draftRef.current) {
          draftSkillsRef.current = sendInput.requestedSkills ?? [];
          setDraft(content);
        }
      }
      if (stillViewingSession) {
        setMessages((current) => current.filter((message) => (
          runConflict || admissionRejected
            ? message.messageId !== optimisticUserCode
              && message.messageId !== optimisticAssistantCode
            : message.messageId !== optimisticAssistantCode
              || Boolean(message.content.trim())
        )));
      }
      if (runConflict) {
        if (sourceSubmission) {
          restoreSourceSubmission();
        } else {
          enqueueSubmission(activeSession, sendInput, "front");
        }
        shouldRestoreSourceSubmission = false;
        replaceActiveRunStatusPending(true);
        await refreshActiveRun(activeSession.sessionId);
        onInfo?.("Another response is already running; your message was queued.", "Message queued");
      } else if (abortReason === "stop") {
        streamSucceeded = true;
        shouldRestoreSourceSubmission = false;
        onInfo?.("Current response has been stopped", "Chat stopped");
      } else if (abortReason === "detach") {
        shouldRestoreSourceSubmission = false;
      } else {
        if (!sourceSubmission && sendInput.annotations?.length) setPendingAnnotations(current => [...sendInput.annotations!, ...current]);
        if (!sourceSubmission && submittedAttachments.length) {
          setPendingAttachments((current) => [...submittedAttachments, ...current]);
        }
        const errorMessage = chatErrorPresentation(error instanceof Error ? error.message : "Chat send failed", config.workRailLabels?.failed).summary;
        const runId = activeRunCodeRef.current;
        const knownNativeFailure = Boolean(runId && currentLiveAguiFailedRunCodesRef.current.has(runId));
        if (aguiEnabled && runId && !knownNativeFailure) {
          setLiveAguiEvents((current) => [...current, {
            type: "CUSTOM", name: "agent.presentation.incomplete", runId,
            threadId: activeSession.sessionId, timestamp: Date.now(),
            value: { code: "AGENT_AGUI_REPLAY_INCOMPLETE" },
          }]);
          setLiveAguiAnchorMessageCodes((current) => ({ ...current, [runId]: optimisticUserCode }));
        }
        if (!aguiEnabled || !knownNativeFailure) {
          setSubmissionError(errorMessage);
          onError(errorMessage, "Chat send failed");
        }
      }
    } finally {
      flushTurnText();
      setMessages(current => current.filter(message => !textStream.messageIds.includes(message.messageId) || Boolean(message.content.trim()) || Boolean(message.a2ui)));
      const ownsObserver = abortRef.current === abortController;
      setStreamingAssistantMessageCode((current) => (
        current === optimisticAssistantCode || textStream.messageIds.includes(current ?? "") ? null : current
      ));
      if (ownsObserver) {
        setSendingState(false);
        setLiveAguiPending(false);
        abortRef.current = null;
        activeRunCodeRef.current = "";
        setActiveRunCode("");
        setActiveRunSupportsSteer(null);
      }
    }

    if (streamSucceeded && completedSession) {
      void refreshCompletedTurn(completedSession.sessionId, completedRunId, presentationEpoch);
    }

    if (!streamSucceeded && shouldRestoreSourceSubmission) {
      restoreSourceSubmission();
    }
    if (
      runConflictDetected
      && activeRunStatusPendingRef.current
      && activeSessionCodeRef.current === activeSession.sessionId
    ) {
      void refreshActiveRun(activeSession.sessionId);
    }

    if (
      completed
      && completedSession
      && activeSessionCodeRef.current === activeSession.sessionId
    ) {
      const nextSubmission = takeNextQueuedSubmission(activeSession.sessionId);
      if (nextSubmission) {
        void runMessage(completedSession, nextSubmission.input, nextSubmission);
      }
    }
    return completed;
  }

  const handleA2uiAction: ActionHandler = (message, metadata, context) => {
    if (!context) { onA2UIAction?.(message, metadata); return; }
    if (!session || !activeAdapter.sendA2uiActionStream || sendingRef.current || userInputRequest || session.status === "ARCHIVED") return;
    const activeSession = session;
    const controller = new AbortController();
    abortRef.current = controller;
    setSendingState(true);
    setSubmissionError(null);
    const input = a2uiSession.prepareAction(message, metadata, context.surface);
    const textStream = new AssistantMessageStream(activeSession);
    void activeAdapter.sendA2uiActionStream(activeSession, input, {
      onAguiEvent: event => { if (abortRef.current !== controller || activeSessionCodeRef.current !== activeSession.sessionId) return; receiveA2ui(event); receiveAssistantMessage(textStream, event); if (event.runId) { activeRunCodeRef.current = event.runId; setActiveRunCode(event.runId); } setLiveAguiEvents(current => [...current, event]); },
    }, controller.signal).then(result => {
      a2uiSession.completeAction(input.actionId);
      if (activeSessionCodeRef.current !== activeSession.sessionId) return;
      const epoch = acknowledgeCompletedTurn(result.session.sessionId, result.run.runId);
      assistantReplyQueueRef.current?.flush();
      setMessages(current => textStream.settle(current, result.messages, [], result.run));
      setSession(result.session);
      setUserInputRequest(result.userInputRequest?.status === "Pending" ? result.userInputRequest : null);
      onA2UIAction?.(message, metadata, context);
      void refreshCompletedTurn(result.session.sessionId, result.run.runId, epoch);
      void reloadA2ui().catch(error => onError(String(error), "A2UI recovery failed"));
    }).catch(error => {
      if (abortRef.current !== controller || activeSessionCodeRef.current !== activeSession.sessionId) return;
      setSubmissionError(String(error)); onError(String(error), "A2UI action failed");
    }).finally(() => {
      if (abortRef.current !== controller || activeSessionCodeRef.current !== activeSession.sessionId) return;
      assistantReplyQueueRef.current?.flush(); setStreamingAssistantMessageCode(null);
      abortRef.current = null; activeRunCodeRef.current = ""; setSendingState(false); setActiveRunCode("");
    });
  };

  async function handleAnswerUserInput(answers: ChatUserInputAnswer[]) {
    if (compacting || userInputAnswerPending) return;
    if (!session || !userInputRequest || !activeAdapter.answerUserInputRequestStream) return;
    const submittedRequest = userInputRequest;
    const submittedRequests = pendingApprovalRequests(submittedRequest, userInputRequests);
    const submittedIds = new Set(submittedRequests.map(request => request.requestId));
    const itemAnswers = (request: ChatUserInputRequest) => submittedRequests.length === 1 ? answers : answers.filter(answer => answer.questionId === request.requestId);
    const submittedSessionId = session.sessionId;
    const textStream = new AssistantMessageStream(session);
    const markAnswered = () => {
      if (activeSessionCodeRef.current !== submittedSessionId) return;
      for (const request of submittedRequests) if (request.nativeInteraction) answeredNativeInteractionsRef.current.add(request.requestId);
      setAcceptedUserInputRequests(current => [...current.filter(request => !submittedIds.has(request.requestId)), ...submittedRequests.map(request => ({ ...request, answers:itemAnswers(request), answeredAt:Date.now(), assistantMessageId:request.assistantMessageId ?? continuationAnchorMessageCode, status:"Answered" as const }))]);
      setUserInputAnswerPending(false);
      setUserInputRequest(current => current?.requestId === submittedRequest.requestId ? null : current);
      setUserInputRequests(current => current.map(request => submittedIds.has(request.requestId)
        ? { ...request, answers:itemAnswers(request), answeredAt: request.answeredAt ?? Date.now(), assistantMessageId: request.assistantMessageId ?? continuationAnchorMessageCode, status: "Answered" as const } : request));
    };
    const continuationAnchorMessageCode = [...messages]
      .reverse()
      .find((message) => message.role === "ASSISTANT")?.messageId ?? messages.at(-1)?.messageId ?? "";
    setUserInputAnswerPending(true);
    let presentationEpoch = ++presentationRefreshEpochRef.current;
    setSendingState(true);
    setLiveAguiPending(aguiEnabled);
    setLiveAguiPendingAnchorMessageCode(continuationAnchorMessageCode);
    setProtocolEvents(current => mergeTranscriptAguiEvents(current, liveAguiEvents) as ChatAguiStreamEvent[]);
    setLiveAguiEvents([]);
    setLiveAguiAnchorMessageCodes({});
    try {
      const result = await activeAdapter.answerUserInputRequestStream(
        session,
        userInputRequest.requestId,
        {...nativeUserInputBatchAnswer(submittedRequests, answers), ...(activeAdapter.loadA2uiState ? {clientCapabilities: {userInputRequests:true,a2ui:{version:"v0.9.1" as const,catalogIds:[AGENT_CATALOG_ID]}}, a2uiMetadata:a2uiSession.metadata(session.metadata?.agentId as string | undefined ?? "main-agent")} : {})},
        {
          onAguiEvent: (event) => {
            if (activeSessionCodeRef.current !== submittedSessionId) return;
            if (isAguiRequestProgressEvent(event)) {
              setLiveAguiPending(false);
              setLiveAguiPendingAnchorMessageCode("");
            }
            // A resumed run starts only after the backend accepts the answer.
            if (event.type === "RUN_STARTED") {
              markAnswered();
              if (event.runId) { activeRunCodeRef.current = event.runId; setActiveRunCode(event.runId); }
            }
            receiveA2ui(event);
            receiveAssistantMessage(textStream, event);
            if (!aguiEnabled) return;
            setLiveAguiEvents((current) => [...current, event]);
            const runId = String(event.runId ?? event.runId ?? "");
            if (runId && continuationAnchorMessageCode) {
              setLiveAguiAnchorMessageCodes((current) => current[runId]
                ? current
                : { ...current, [runId]: `interaction:${submittedRequest.requestId}` });
            }
          },
        },
      );
      if (activeSessionCodeRef.current !== submittedSessionId) return;
      markAnswered();
      presentationEpoch = acknowledgeCompletedTurn(result.session.sessionId, result.run.runId);
      assistantReplyQueueRef.current?.flush();
      setMessages((current) => textStream.settle(current, result.messages, [], result.run));
      setSession(result.session);
      setUserInputRequest(result.userInputRequest?.status === "Pending" ? result.userInputRequest : null);
      setUserInputRequests((current) => current.map((request) => (
        submittedIds.has(request.requestId)
          ? { ...request, answers:itemAnswers(request), answeredAt: request.answeredAt ?? Date.now(), assistantMessageId: request.assistantMessageId ?? continuationAnchorMessageCode, status: "Answered" as const }
          : request
      )));
      setLiveAguiPending(false);
      setLiveAguiPendingAnchorMessageCode("");
      setLiveAguiAnchorMessageCodes({});
      void refreshCompletedTurn(result.session.sessionId, result.run.runId, presentationEpoch);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Chat answer failed", "Chat answer failed");
    } finally {
        if (activeSessionCodeRef.current !== submittedSessionId) return;
        assistantReplyQueueRef.current?.flush(); setStreamingAssistantMessageCode(null);
        activeRunCodeRef.current = "";
        setActiveRunCode("");
        setSendingState(false);
        setUserInputAnswerPending(false);
        setLiveAguiPending(false);
        setLiveAguiPendingAnchorMessageCode("");
    }
  }

  async function handleSend(submitted?: Pick<SendChatMessageInput, "content" | "attachments">): Promise<boolean> {
    if (compacting || initialSubmitPendingRef.current || sendingRef.current || config.disabledInput || creatingSession || (!submitted && sendDisabled) || userInputRequest || userInputAnswerPending) return false;
    // Capture the submitted draft before awaiting session creation. Subsequent
    // input changes must not alter the message being admitted.
    const content = (submitted?.content ?? draft).trim();
    const attachments = submitted ? submitted.attachments ?? [] : pendingAttachments;
    const annotations = submitted ? [] : pendingAnnotations;
    const requestedSkills = requestedSkillsFromDraft(content, config.inputSuggestions ?? [], draftSkillsRef.current);
    if (!content && !attachments.length && !annotations.length) return false;
    const submission = Symbol("initial-submission");
    initialSubmitPendingRef.current = submission;
    try {
      const activeSession = await ensureSession();
      const sendInput = createSendInput(activeSession, content, attachments, requestedSkills, annotations);
      if (!sendInput) return false;
      if (!submitted) {
        setDraft("");
        setPendingAttachments([]);
        setPendingAnnotations([]);
      }
      if (remoteActiveRunRef.current) {
        enqueueSubmission(activeSession, sendInput);
        return true;
      }
      if (initialSubmitPendingRef.current === submission) initialSubmitPendingRef.current = null;
      await runMessage(activeSession, sendInput);
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : "Chat send failed", "Chat send failed");
      return false;
    } finally {
      if (initialSubmitPendingRef.current === submission) initialSubmitPendingRef.current = null;
    }
  }

  useImperativeHandle(submitterRef, () => ({ submit: handleSend }));

  async function handleQueue() {
    if (queueDisabled || userInputRequest || userInputAnswerPending) return;
    const activeSession = await ensureSession();
    if (!activeSession) return;
    const content = draft.trim();
    if (!content && !pendingAttachments.length && !pendingAnnotations.length) return;
    const sendInput = createSendInput(activeSession, content, pendingAttachments);
    if (!sendInput) return;
    setDraft("");
    setPendingAttachments([]);
    setPendingAnnotations([]);
    if (sendingRef.current || remoteActiveRunRef.current) {
      enqueueSubmission(activeSession, sendInput);
      return;
    }
    await runMessage(activeSession, sendInput);
  }

  async function handleSteer(queuedId?: string) {
    if (steeringRef.current || (!queuedId && steerDisabled) || !canSteer || userInputRequest || userInputAnswerPending) return;
    const activeSession = session;
    if (!activeSession) return;
    const queuedIndex = queuedId ? queuedSubmissionsRef.current.findIndex(item => item.id === queuedId && item.sessionId === activeSession.sessionId) : -1;
    if (queuedId && queuedIndex < 0) return;
    const queuedSubmission = queuedIndex >= 0 ? queuedSubmissionsRef.current[queuedIndex] : null;
    const content = queuedSubmission?.input.content ?? draft.trim();
    if (!queuedSubmission && !content && !pendingAttachments.length && !pendingAnnotations.length) return;
    const sendInput = queuedSubmission?.input ?? createSendInput(activeSession, content, pendingAttachments);
    if (!sendInput) return;
    const expectedRunId = activeRunCodeRef.current
      || remoteActiveRunRef.current?.runId
      || "";
    const queueGeneration = queueGenerationRef.current;
    const autoDrainEpoch = autoDrainEpochRef.current;
    if (queuedSubmission) {
      replaceQueuedSubmissions(removeQueuedChatSubmission(queuedSubmissionsRef.current, queuedSubmission.id));
    } else {
      setDraft("");
      setPendingAttachments([]);
      setPendingAnnotations([]);
    }
    if (
      !expectedRunId
      || !activeAdapter.capabilities.supportsSteer
      || !activeAdapter.steerMessage
    ) {
      if (queuedSubmission) replaceQueuedSubmissions([ ...queuedSubmissionsRef.current.slice(0, queuedIndex), queuedSubmission, ...queuedSubmissionsRef.current.slice(queuedIndex) ]);
      else enqueueSubmission(activeSession, sendInput);
      return;
    }

    const previousUser = [...messages].reverse().find((message) =>
      message.role === "USER" && messageSenderIsHuman(message));
    optimisticMessageSequenceRef.current += 1;
    const optimisticAt = Math.max(
      Date.now(),
      ...liveAguiEvents.map(aguiEventMillis).filter((value): value is number => value !== null).map((value) => value + 1),
    );
    const optimisticMessageId = `LOCAL-${Date.now()}-${optimisticMessageSequenceRef.current}-STEER`;
    const optimisticMessage: ChatMessage = {
      actor: currentSender?.displayName ?? currentUserDisplayName ?? "User",
      provenance: { sender: currentSender ?? { kind: "user", displayName: currentUserDisplayName || "User" } },
      channel: "conversation",
      content,
      annotations: sendInput.annotations ?? [],
      attachments: sendInput.attachments ?? [],
      requestedSkills: sendInput.requestedSkills ?? [],
      createdAt: new Date(optimisticAt).toISOString(),
      id: -Date.now() - optimisticMessageSequenceRef.current,
      messageId: optimisticMessageId,
      role: "USER",
      runId: expectedRunId,
      sessionId: activeSession.sessionId,
    };
    const matchingRunEvent = [...liveAguiEvents].reverse().find((event) =>
      event.runId === expectedRunId || historyEventRunId(event) === expectedRunId);
    const nativeRunId = matchingRunEvent ? historyEventRunId(matchingRunEvent) : expectedRunId;
    const optimisticBoundaryEvents = aguiEnabled && previousUser
      ? createSteerWorkSegmentEvents({
          at: optimisticAt,
          fromMessageId: previousUser.messageId,
          nativeRunId,
          runId: expectedRunId,
          threadId: activeSession.sessionId,
          toMessageId: optimisticMessageId,
        })
      : [];
    setMessages((current) => mergeChatMessagesChronologically(current, [optimisticMessage]));
    if (optimisticBoundaryEvents.length) {
      setLiveAguiEvents((current) => [...current, ...optimisticBoundaryEvents]);
    }
    const removeOptimisticSteer = () => {
      if (activeSessionCodeRef.current !== activeSession.sessionId) return;
      setMessages((current) => current.filter((message) => message.messageId !== optimisticMessageId));
      if (optimisticBoundaryEvents.length) {
        setLiveAguiEvents((current) => current.filter((event) => !(
          (event.type === "CLIENT_WORK_SEGMENT_START" || event.type === "CLIENT_WORK_SEGMENT_END")
          && event.fromMessageId === previousUser?.messageId
          && event.toMessageId === optimisticMessageId
        )));
      }
    };

    const abortController = new AbortController();
    steerAbortRef.current = abortController;
    steeringRef.current = true;
    setSteering(true);
    try {
      const result = await activeAdapter.steerMessage(
        activeSession,
        sendInput,
        { expectedRunId: expectedRunId },
        abortController.signal,
      );
      if (activeSessionCodeRef.current === result.sessionId) {
        setMessages((current) => mergeChatMessagesChronologically(
          current.filter((message) => message.messageId !== optimisticMessageId),
          [result.message],
        ));
        if (optimisticBoundaryEvents.length && previousUser) {
          const confirmedBoundaryEvents = createSteerWorkSegmentEvents({
            at: optimisticAt,
            fromMessageId: previousUser.messageId,
            nativeRunId,
            runId: expectedRunId,
            threadId: activeSession.sessionId,
            toMessageId: result.message.messageId,
          });
          setLiveAguiEvents((current) => [
            ...current.filter((event) => !(
              (event.type === "CLIENT_WORK_SEGMENT_START" || event.type === "CLIENT_WORK_SEGMENT_END")
              && event.fromMessageId === previousUser.messageId
              && event.toMessageId === optimisticMessageId
            )),
            ...confirmedBoundaryEvents,
          ]);
        }
      }
      // A resolved ACK means the backend accepted and persisted the steer.
      // Commit the visible message even if this observer was detached, but
      // never retry or resubmit the accepted input.
      if (steerAbortRef.current !== abortController) return;
    } catch (error) {
      removeOptimisticSteer();
      const observerDetached = steerAbortRef.current !== abortController;
      const safeQueueFallback = error instanceof ChatAdapterError
        && isSteerQueueFallbackCode(error.code);
      if (safeQueueFallback && queueGenerationRef.current === queueGeneration) {
        if (queuedSubmission) {
          const next = [...queuedSubmissionsRef.current];
          next.splice(Math.min(queuedIndex, next.length), 0, queuedSubmission);
          replaceQueuedSubmissions(next);
        } else enqueueSubmission(activeSession, sendInput, "front");
        const nextActiveRun = await refreshActiveRun(activeSession.sessionId);
        if (
          !sendingRef.current
          && nextActiveRun === null
          && autoDrainEpochRef.current === autoDrainEpoch
          && activeSessionCodeRef.current === activeSession.sessionId
        ) {
          const nextSubmission = takeNextQueuedSubmission(
            activeSession.sessionId,
          );
          if (nextSubmission) {
            void runMessage(activeSession, nextSubmission.input, nextSubmission);
          }
        }
      }
      const stopped = error instanceof Error && error.name === "AbortError";
      if (safeQueueFallback) {
        onInfo?.("The active run rejected steer; the message was queued", "Message queued");
      } else if (observerDetached || stopped) {
        onInfo?.("Steer delivery was not confirmed and was not retried", "Steer not retried");
      } else {
        if (queuedSubmission && error instanceof ChatAdapterError && error.rejectedBeforeAdmission
          && queueGenerationRef.current === queueGeneration) {
          const next = [...queuedSubmissionsRef.current];
          next.splice(Math.min(queuedIndex, next.length), 0, queuedSubmission);
          replaceQueuedSubmissions(next);
        }
        if (!queuedSubmission && error instanceof ChatAdapterError && error.rejectedBeforeAdmission
          && activeSessionCodeRef.current === activeSession.sessionId && !draftRef.current) {
          draftSkillsRef.current = sendInput.requestedSkills ?? [];
          setDraft(content);
          setPendingAttachments(current => [...(sendInput.attachments ?? []), ...current]);
          setPendingAnnotations(current => [...(sendInput.annotations ?? []), ...current]);
        }
        onError(
          error instanceof Error ? error.message : "Chat steer failed",
          "Chat steer failed",
        );
      }
    } finally {
      if (steerAbortRef.current === abortController) {
        steerAbortRef.current = null;
        steeringRef.current = false;
        setSteering(false);
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

  function handleEditMessage(content: string, message?: ChatMessage) {
    draftSkillsRef.current = message?.requestedSkills ?? [];
    setPendingAnnotations(message?.annotations ?? []);
    setDraft(content);
  }

  function handleEditQueuedMessage(id: string, content: string) {
    const submission = queuedSubmissionsRef.current.find((item) => item.id === id);
    replaceQueuedSubmissions(
      removeQueuedChatSubmission(queuedSubmissionsRef.current, id),
    );
    draftSkillsRef.current = submission?.input.requestedSkills ?? [];
    setDraft(content);
    setPendingAttachments(submission?.input.attachments ?? []);
    setPendingAnnotations(submission?.input.annotations ?? []);
  }

  function handleRemoveQueuedMessage(id: string) {
    replaceQueuedSubmissions(
      removeQueuedChatSubmission(queuedSubmissionsRef.current, id),
    );
  }

  function handleReorderQueuedMessage(sourceId: string, targetId: string) {
    replaceQueuedSubmissions(reorderQueuedChatSubmission(queuedSubmissionsRef.current, sourceId, targetId));
  }

  async function handleStop() {
    if (compacting || !session || stopping) return;
    let stoppedRunCode = effectiveActiveRunCode;
    if (
      !stoppedRunCode
      && activeAdapter.capabilities.supportsStop
      && activeAdapter.stopRun
    ) {
      stoppedRunCode = (await refreshActiveRun(session.sessionId))?.runId ?? "";
    }
    const runKey = stoppedRunCode
      ? `${session.sessionId}:${stoppedRunCode}`
      : "";
    if (runKey) suppressedAutoDrainRunKeysRef.current.add(runKey);
    autoDrainEpochRef.current += 1;
    detachSteerObserver();
    const observedLocally = Boolean(abortRef.current);
    if (
      activeAdapter.capabilities.supportsStop
      && activeAdapter.stopRun
      && stoppedRunCode
    ) {
      setStopping(true);
      if (remoteActiveRunRef.current?.runId === stoppedRunCode) {
        replaceRemoteActiveRun({
          ...remoteActiveRunRef.current,
          state: "FINISHING",
        });
      }
      try {
        await activeAdapter.stopRun(
          session,
          { expectedRunId: stoppedRunCode },
        );
        detachRunObserver("stop");
        if (!observedLocally) {
          onInfo?.("Current response has been stopped", "Chat stopped");
        }
        await refreshActiveRun(session.sessionId);
      } catch (error) {
        if (runKey) suppressedAutoDrainRunKeysRef.current.delete(runKey);
        onError(
          error instanceof Error ? error.message : "Chat stop failed",
          "Chat stop failed",
        );
        await refreshActiveRun(session.sessionId);
      } finally {
        setStopping(false);
      }
      return;
    }
    detachRunObserver("stop");
  }

  function handleNewSession() {
    if (config.showNewSession === false) return;
    queueGenerationRef.current += 1;
    detachRunObserver("detach");
    detachSteerObserver();
    setSession(null);
    setMessages([]);
    setUserInputRequest(null);
    setAguiEvents([]);
    setProtocolEvents([]);
    setLiveAguiEvents([]);
    setLiveAguiPendingAnchorMessageCode("");
    setLiveAguiAnchorMessageCodes({});
    setPendingAttachments([]);
    setPendingAnnotations([]);
    activeRunCodeRef.current = "";
    setActiveRunCode("");
    setActiveRunSupportsSteer(null);
    replaceRemoteActiveRun(null);
    replaceQueuedSubmissions([]);
  }

  const presentationDebugEvents = useMemo(
    () => buildTranscriptPresentation({
      debugOptions,
      liveAguiAnchorMessageCodes,
      liveAguiEvents,
      liveAguiPendingAnchorMessageCode,
      liveAguiPending,
      messages: visibleMessages,
      protocolEvents,
      sessionId: session?.sessionId ?? "",
    }).debugEventsByRunCode,
    [debugOptions, liveAguiAnchorMessageCodes, liveAguiEvents, liveAguiPendingAnchorMessageCode, liveAguiPending, protocolEvents, session?.sessionId, visibleMessages],
  );

  const resolvedDebugOptions = useMemo(() => ({
    ...debugOptions,
    debugEventTypes: debugOptions?.debugEventTypes?.length
      ? Array.from(new Set([
        ...debugOptions.debugEventTypes,
        ...Array.from(presentationDebugEvents.keys()).flatMap((runId) => (
          mergeTranscriptAguiEvents(protocolEvents, liveAguiEvents)
            .filter((event) => (event.runId ?? event.runId ?? "") === runId)
            .map((event) => String(event.type).toUpperCase())
        )),
      ]))
      : debugOptions?.debugEventTypes,
  }), [debugOptions, liveAguiEvents, presentationDebugEvents, protocolEvents]);

  const attachmentDownloader = useMemo<
    ((attachment: ChatMessageAttachment) => Promise<Blob>) | undefined
  >(() => {
    if (hostAttachmentDownloader) return hostAttachmentDownloader;
    if (!session || !activeAdapter.downloadAttachment) return undefined;
    return (attachment: ChatMessageAttachment) =>
      activeAdapter.downloadAttachment!(session, attachment);
  }, [activeAdapter, hostAttachmentDownloader, session]);
  const composerFeedback = <>
    {composerHeader}
    {errorDisplay === "inline" && submissionError ? <div className="ef-chat__run-notice ef-chat__run-notice--error" role="alert">
      <div className="ef-chat__run-notice-content"><div className="ef-chat__run-notice-detail">{submissionError}</div></div>
    </div> : null}
  </>;

  const panel = (
    <ChatPanel
      allowDraftSession={allowDraftSession}
      attachmentLabels={attachmentLabels}
      attachmentDownloader={attachmentDownloader}
      autoFocusComposer={autoFocusComposer}
      composerRef={composerRef}
      composerHeader={composerFeedback}
      createSessionLabel={createSessionLabel}
      currentUserDisplayName={currentUserDisplayName}
      debugOptions={resolvedDebugOptions}
      disabledInput={compacting || creatingSession || Boolean(config.disabledInput) || userInputRequest?.status === "Pending"}
      draft={draft}
      emptyDescription={emptyDescription ?? "Create a session to start chatting."}
      emptyTitle={emptyTitle}
      goal={goal}
      footerAddon={compacting ? <fieldset disabled style={{ display: "contents" }}>{footerAddon}</fieldset> : footerAddon}
      pendingAttachments={pendingAttachments}
      pendingAnnotations={pendingAnnotations}
      onPendingAnnotationsChange={setPendingAnnotations}
      onRemoveAttachment={(id) => setPendingAttachments(current => current.filter(item => item.id !== id))}
      onAttachFile={handleAttachmentUpload}
      showAttachmentControl={showAttachmentControl && Boolean(activeAdapter.uploadAttachment)}
      attachmentUploadPending={attachmentUploadPending}
      formatAnnotationCount={formatAnnotationCount}
      annotationLabels={config.annotationLabels}
      headerContent={headerContent}
      inputPlaceholder={config.inputPlaceholder}
      inputSuggestions={config.inputSuggestions}
      skillSuggestionTriggers={config.skillSuggestionTriggers}
      inputSuggestionLabels={config.inputSuggestionLabels}
      queuedInputPlaceholder={config.queuedInputPlaceholder}
      steeringInputPlaceholder={config.steeringInputPlaceholder}
      liveAguiAnchorMessageCodes={liveAguiAnchorMessageCodes}
      liveAguiEvents={liveAguiEvents}
      liveAguiPendingAnchorMessageCode={liveAguiPendingAnchorMessageCode}
      liveAguiPending={liveAguiPending}
      messages={visibleMessages}
      historyLoading={loading}
      historyLoadingOlder={historyLoadingOlder}
      historyLabels={config.historyLabels}
      onLoadOlderHistory={historyCursor ? () => { void loadOlderHistory(); } : undefined}
      onCreateSession={onCreateSession ?? requestSessionCreation}
      onNewSession={handleNewSession}
      onDraftChange={setDraft}
      onPasteAttachment={onPasteAttachment ?? handleAttachmentUpload}
      onEditMessage={compacting ? undefined : handleEditMessage}
      onEditQueuedMessage={handleEditQueuedMessage}
      onRemoveQueuedMessage={handleRemoveQueuedMessage}
      onSteerQueuedMessage={(id) => { void handleSteer(id); }}
      onReorderQueuedMessage={handleReorderQueuedMessage}
      onSend={(mode) => { void handleSubmit(mode); }}
      onStop={() => { void handleStop(); }}
      protocolEvents={protocolEvents}
      queueDisabled={queueDisabled || Boolean(userInputRequest)}
      queuedMessages={visibleQueuedSubmissions}
      runningSubmitModes={runningSubmitModes}
      runningEnterSubmitMode={config.runningEnterSubmitMode}
      sendDisabled={sendDisabled || Boolean(userInputRequest)}
      sending={runActive}
      streamingAssistantMessageCode={streamingAssistantMessageCode}
      session={session}
      showHistoryRail={showHistoryRail}
      showAgui={aguiEnabled}
      showReasoningCards={config.showReasoningCards}
      showHeader={showHeader ?? !config.floating}
      showStop={canStop}
      sidebarContent={sidebarContent}
      steerDisabled={steerDisabled || Boolean(userInputRequest)}
      queuedSteerDisabled={steering || !canSteer || Boolean(userInputRequest) || userInputAnswerPending}
      title={config.title || floatingTitle}
      userInputLabels={config.userInputLabels}
      userInputRequests={presentedUserInputRequests}
      locale={config.locale}
      workRailLabels={config.workRailLabels}
      userInputAnswerPending={userInputAnswerPending}
      userInputRequest={userInputRequest}
      onAnswerUserInput={compacting ? undefined : (answers) => { void handleAnswerUserInput(answers); }}
      a2uiSession={a2uiSession}
      a2uiDisabled={sending || session?.status === "ARCHIVED"}
      onA2UIAction={handleA2uiAction}
      renderMarkdownLink={renderMarkdownLink}
    />
  );

  if (config.floating !== false) {
    return (
      <ChatWindow
        resizeHint={config.resizeHint}
        showNewSession={config.showNewSession}
        allowDraftSession={allowDraftSession}
        attachmentLabels={attachmentLabels}
        attachmentDownloader={attachmentDownloader}
        autoFocusComposer={autoFocusComposer}
        composerRef={composerRef}
        composerHeader={composerFeedback}
        currentUserDisplayName={currentUserDisplayName}
        debugOptions={resolvedDebugOptions}
        disabledInput={compacting || creatingSession || Boolean(config.disabledInput) || userInputRequest?.status === "Pending"}
        draft={draft}
        emptyDescription={emptyDescription ?? "Create a session to start chatting."}
        emptyTitle={emptyTitle}
        goal={goal}
        footerAddon={compacting ? <fieldset disabled style={{ display: "contents" }}>{footerAddon}</fieldset> : footerAddon}
        pendingAttachments={pendingAttachments}
      pendingAnnotations={pendingAnnotations}
      onPendingAnnotationsChange={setPendingAnnotations}
        onRemoveAttachment={(id) => setPendingAttachments(current => current.filter(item => item.id !== id))}
        onAttachFile={handleAttachmentUpload}
        showAttachmentControl={showAttachmentControl && Boolean(activeAdapter.uploadAttachment)}
        attachmentUploadPending={attachmentUploadPending}
        formatAnnotationCount={formatAnnotationCount}
      annotationLabels={config.annotationLabels}
        inputPlaceholder={config.inputPlaceholder}
        inputSuggestions={config.inputSuggestions}
      skillSuggestionTriggers={config.skillSuggestionTriggers}
        inputSuggestionLabels={config.inputSuggestionLabels}
      queuedInputPlaceholder={config.queuedInputPlaceholder}
      steeringInputPlaceholder={config.steeringInputPlaceholder}
      liveAguiAnchorMessageCodes={liveAguiAnchorMessageCodes}
      liveAguiEvents={liveAguiEvents}
      liveAguiPendingAnchorMessageCode={liveAguiPendingAnchorMessageCode}
      liveAguiPending={liveAguiPending}
        messages={visibleMessages}
        historyLoading={loading}
        historyLoadingOlder={historyLoadingOlder}
        historyLabels={config.historyLabels}
        onLoadOlderHistory={historyCursor ? () => { void loadOlderHistory(); } : undefined}
        onCreateSession={onCreateSession ?? requestSessionCreation}
        onNewSession={handleNewSession}
        onDraftChange={setDraft}
        onPasteAttachment={onPasteAttachment ?? handleAttachmentUpload}
        onEditMessage={compacting ? undefined : handleEditMessage}
        onEditQueuedMessage={handleEditQueuedMessage}
        onRemoveQueuedMessage={handleRemoveQueuedMessage}
        onSteerQueuedMessage={(id) => { void handleSteer(id); }}
        onReorderQueuedMessage={handleReorderQueuedMessage}
        onSend={(mode) => { void handleSubmit(mode); }}
        onStop={() => { void handleStop(); }}
        protocolEvents={protocolEvents}
        queueDisabled={queueDisabled || Boolean(userInputRequest)}
        queuedMessages={visibleQueuedSubmissions}
        runningSubmitModes={runningSubmitModes}
        runningEnterSubmitMode={config.runningEnterSubmitMode}
        sendDisabled={sendDisabled || Boolean(userInputRequest)}
        sending={runActive}
        streamingAssistantMessageCode={streamingAssistantMessageCode}
        session={session}
        showHistoryRail={showHistoryRail}
      showAgui={aguiEnabled}
      showReasoningCards={config.showReasoningCards}
        showStop={canStop}
        sidebarContent={sidebarContent}
        steerDisabled={steerDisabled || Boolean(userInputRequest)}
        queuedSteerDisabled={steering || !canSteer || Boolean(userInputRequest) || userInputAnswerPending}
        state={windowState}
        storageKey={config.storageKey || "agent-ui.chat.runtime.window"}
        title={floatingTitle}
        titleSubtitle={floatingSubtitle}
        userInputLabels={config.userInputLabels}
        userInputRequests={presentedUserInputRequests}
        locale={config.locale}
        workRailLabels={config.workRailLabels}
        userInputAnswerPending={userInputAnswerPending}
        userInputRequest={userInputRequest}
        onAnswerUserInput={compacting ? undefined : (answers) => { void handleAnswerUserInput(answers); }}
        onStateChange={onWindowStateChange}
        a2uiSession={a2uiSession}
      a2uiDisabled={sending || session?.status === "ARCHIVED"}
      onA2UIAction={handleA2uiAction}
      renderMarkdownLink={renderMarkdownLink}
      />
    );
  }

  return panel;
}
