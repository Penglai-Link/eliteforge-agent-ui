import { ChatA2uiSession, AGENT_CATALOG_ID, type ChatA2uiActionHandler as ActionHandler } from "@eliteforge/agent-ui-chat-core";
import {
  chatErrorPresentation,
  applyMessageProvenance,
  type MessageSender,
  AssistantReplyQueue,
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
  nativeUserInputRequests,
  nativeUserInputAnswer,
  historyMessages,
  historyEventRunId,
  historyUserInputRequests,
  type SessionHistory,
  type HistoryCursor,
  removeQueuedChatSubmission,
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
import { FileText, Paperclip, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Ref,
  type ReactNode,
  type SetStateAction,
} from "react";
import { ChatPanel, type ChatMarkdownLinkRenderer } from "./ChatPanel";
import { ChatWindow } from "./ChatWindow";
import { isImageAttachment, useAttachmentImageSource } from "./chatAttachments";

interface ToastLikeCallback {
  (message: string, title?: string): void;
}

export interface ChatRuntimeWindowProps {
  /** Forward A2UI actions to the host transport. */
  onA2UIAction?: ActionHandler;
  /** Open a local composer and create its session on the first submission. */
  allowDraftSession?: boolean;
  agentReplyEffect?: AssistantReplyEffect;
  agentReplySpeed?: number;
  adapter?: ChatAdapter;
  attachmentLabels?: ChatAttachmentLabels;
  autoFocusComposer?: boolean;
  config: ChatClientConfig;
  composerRef?: Ref<HTMLTextAreaElement>;
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
  pendingAttachments?: ChatMessageAttachment[];
  createSendInput?: (
    session: ChatSession,
    content: string,
    attachments: ChatMessageAttachment[],
  ) => SendChatMessageInput | null;
  showAttachmentControl?: boolean;
  showHeader?: boolean;
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

function attachmentLabel(attachment: ChatMessageAttachment) {
  return attachment.fileName || attachment.title || attachment.summary || attachment.id;
}

function attachmentTypeLabel(attachment: ChatMessageAttachment) {
  const name = attachment.fileName || attachment.title || "";
  const extension = name.includes(".") ? name.split(".").pop() : undefined;
  return (extension || attachment.contentType?.split("/").pop() || "FILE").toUpperCase();
}

function PendingAttachmentCard({
  attachment,
  downloadAttachment,
  onRemove,
}: {
  attachment: ChatMessageAttachment;
  downloadAttachment?: (attachment: ChatMessageAttachment) => Promise<Blob>;
  onRemove: (attachmentId: string) => void;
}) {
  const label = attachmentLabel(attachment);
  const imageSource = useAttachmentImageSource(attachment, downloadAttachment);

  if (isImageAttachment(attachment)) {
    return (
      <div className="ef-chat__runtime-attachment-image">
        {imageSource ? <img alt={label} src={imageSource} /> : null}
        <button
          aria-label={`Remove ${label}`}
          className="ef-chat__runtime-attachment-remove ef-chat__runtime-attachment-remove--floating"
          type="button"
          onClick={() => onRemove(attachment.id)}
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="ef-chat__runtime-attachment-file">
      <span className="ef-chat__runtime-attachment-file-icon" aria-hidden="true">
        <FileText size={22} />
      </span>
      <span className="ef-chat__runtime-attachment-file-info">
        <span className="ef-chat__runtime-attachment-file-name" title={label}>{label}</span>
        <span className="ef-chat__runtime-attachment-file-type">{attachmentTypeLabel(attachment)}</span>
      </span>
      <button
        aria-label={`Remove ${label}`}
        className="ef-chat__runtime-attachment-remove ef-chat__runtime-attachment-remove--floating"
        type="button"
        onClick={() => onRemove(attachment.id)}
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function ChatRuntimeWindow({
  allowDraftSession = false,
  agentReplyEffect = "off",
  agentReplySpeed = 120,
  adapter,
  attachmentLabels,
  autoFocusComposer = false,
  composerHeader,
  config,
  composerRef,
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
  pendingAttachments: controlledPendingAttachments,
  createSendInput: createSendInputOverride,
  showAttachmentControl = true,
  showHeader,
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
  const a2uiSession = useMemo(() => new ChatA2uiSession(session?.sessionId ?? ""), [session?.sessionId]);
  const [a2uiEpoch, setA2uiEpoch] = useState(0);
  useEffect(() => a2uiSession.client.subscribe(() => setA2uiEpoch(value => value + 1)), [a2uiSession]);
  const reloadA2ui = useCallback(async () => {
    if (!a2uiSession.sessionId || !activeAdapter.loadA2uiState) return;
    const state = await activeAdapter.loadA2uiState(a2uiSession.sessionId);
    a2uiSession.hydrate(state);
  }, [a2uiSession, activeAdapter]);
  useEffect(() => { void reloadA2ui().catch(error => onError(String(error), "A2UI state failed")); }, [reloadA2ui]);
  const receiveA2ui = (event: ChatAguiStreamEvent) => {
    try { if (!a2uiSession.applyEvent(event)) void reloadA2ui().catch(error => onError(String(error), "A2UI recovery failed")); }
    catch (error) { onError(String(error), "A2UI presentation failed"); void reloadA2ui().catch(() => {}); }
  };
  const presentedMessages = useMemo(() => mergeChatMessagesChronologically(messages, a2uiSession.messages()), [messages, a2uiSession, a2uiEpoch]);

  const [historySnapshot, setHistorySnapshot] = useState<SessionHistory | null>(null);
  const [historyCursor, setHistoryCursor] = useState<HistoryCursor | null>(null);
  const [historyLoadingOlder, setHistoryLoadingOlder] = useState(false);
  const [userInputRequest, setUserInputRequest] = useState<ChatUserInputRequest | null>(null);
  const [userInputRequests, setUserInputRequests] = useState<ChatUserInputRequest[]>([]);
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
  const attachmentFileInputRef = useRef<HTMLInputElement | null>(null);
  const optimisticMessageSequenceRef = useRef(0);
  const currentLiveAguiFailedRunCodesRef = useRef<Set<string>>(new Set());
  const observedRemoteRunRef = useRef<{ runId: string; sessionId: string } | null>(null);
  const drainedRemoteRunKeysRef = useRef<Set<string>>(new Set());
  const suppressedAutoDrainRunKeysRef = useRef<Set<string>>(new Set());
  const draftRef = useRef(controlledDraft ?? "");
  const pendingAttachmentsRef = useRef<ChatMessageAttachment[]>(controlledPendingAttachments ?? []);
  const draft = controlledDraft ?? internalDraft;
  const pendingAttachments = controlledPendingAttachments ?? internalPendingAttachments;

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
    && activeAdapter.capabilities.supportsProtocolReplay
    && Boolean(activeAdapter.loadProtocolEvents);
  const effectiveActiveRunCode = activeRunCode || remoteActiveRun?.runId || "";
  const runActive = sending || Boolean(remoteActiveRun);
  const effectiveRunState = remoteActiveRun?.runId === effectiveActiveRunCode
    ? remoteActiveRun.state
    : "RUNNING";
  const effectiveSupportsSteer = remoteActiveRun?.runId === effectiveActiveRunCode
    ? remoteActiveRun.supportsSteer
    : activeRunSupportsSteer;
  const canSteer = Boolean(
    activeAdapter.capabilities.supportsSteer
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
    session
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
      active: runActive,
      runId: effectiveActiveRunCode,
      sessionId: session?.sessionId ?? "",
      supportsSteer: canSteer,
    });
  }, [
    canSteer,
    effectiveActiveRunCode,
    onRunStateChange,
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
        setProtocolEvents([]); setAguiEvents([]);
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
  ): SendChatMessageInput | null {
    if (createSendInputOverride) {
      return createSendInputOverride(activeSession, content, attachments);
    }
    const input: SendChatMessageInput = {
      clientCapabilities: { userInputRequests: true },
      content,
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
    return [...pending.values()];
  }, [historySnapshot, liveNativePendingRequests, config.userInputLabels]);
  useEffect(() => { answeredNativeInteractionsRef.current.clear(); }, [session?.sessionId]);
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
      return { nextHistory: page, nextMessages: historyMessages(page, config.userInputLabels), nextAguiEvents: [] as ChatAguiEvent[], nextProtocolEvents: [] as ChatAguiStreamEvent[],
        healthyProtocolEvents: [] as ChatAguiStreamEvent[], healthNotice: undefined,
        nextActiveRun: running ? { runId: running.id, runtimeAdapterKey: "framework", supportsSteer: activeAdapter.capabilities.supportsSteer ?? false, state: "RUNNING" as const } : null,
        nextUserInputRequests: historyUserInputRequests(page, config.userInputLabels), errors: [] as unknown[] };
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
      setHistoryCursor(page.nextCursor);
    } catch (error) {
      if ((error as { status?: number })?.status === 409 && activeSessionCodeRef.current === sessionId) {
        try {
          const page = await activeAdapter.loadHistory(sessionId, { limit: 20, cursor: null });
          if (activeSessionCodeRef.current === sessionId) {
            setMessages(historyMessages(page, config.userInputLabels)); setHistorySnapshot(page); setHistoryCursor(page.nextCursor);
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
    if (loading || creatingSession || config.disabledInput || userInputRequest || userInputAnswerPending) return true;
    if (!draft.trim() && !pendingAttachments.length) return true;
    return false;
  }, [config.disabledInput, creatingSession, draft, loading, pendingAttachments.length, session, userInputAnswerPending, userInputRequest]);
  const queueDisabled = useMemo(
    () => loading || Boolean(config.disabledInput) || Boolean(userInputRequest) || userInputAnswerPending || (!draft.trim() && !pendingAttachments.length) || !session,
    [config.disabledInput, draft, loading, pendingAttachments.length, session, userInputAnswerPending, userInputRequest],
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

  async function handleAttachmentFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.item(0);
    event.currentTarget.value = "";
    if (!file) return;
    await handleAttachmentUpload(file);
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
    sendInput = { ...sendInput, clientCapabilities: { ...sendInput.clientCapabilities, a2ui: { version: "v0.9.1", catalogIds: [AGENT_CATALOG_ID] } }, a2uiMetadata: a2uiSession.metadata(sendInput.metadata?.agentId as string | undefined ?? "main-agent") };
    const content = sendInput.content.trim();
    if (!content && !(sendInput.attachments?.length)) {
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
    setStreamingAssistantMessageCode(optimisticAssistantCode);
    setSendingState(true);
    setLiveAguiPending(aguiEnabled);
    setMessages((current) => [
      ...current,
      {
        actor: currentSender?.displayName ?? currentUserDisplayName ?? "User",
        provenance: { sender: currentSender ?? { kind: "user", displayName: currentUserDisplayName || "User" } },
        channel: "conversation",
        content,
        attachments: submittedAttachments,
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
            receiveA2ui(event);
            if (!belongsToNewChatTurn(event, activeSession.sessionId, optimisticCreatedAt)) return;
            if (abortRef.current !== abortController) return;
            const runId = String(event.runId ?? event.runId ?? "");
            if (typeof event.supportsSteer === "boolean") {
              setActiveRunSupportsSteer(event.supportsSteer);
            }
            if (runId && !activeRunCodeRef.current) {
              activeRunCodeRef.current = runId;
              setActiveRunCode(runId);
            }
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
      assistantReplyQueueRef.current?.flush(optimisticAssistantCode);
      presentationEpoch = acknowledgeCompletedTurn(result.session.sessionId, result.run.runId);
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
      setMessages((current) => mergeChatMessagesChronologically(
        current, result.messages, [optimisticUserCode, optimisticAssistantCode],
      ));
      completedSession = result.session;
      completedRunId = result.run.runId;
      completed = currentStreamAbortReason(abortController) === "none"
        && autoDrainEpochRef.current === autoDrainEpoch;
    } catch (error) {
      assistantReplyQueueRef.current?.flush(optimisticAssistantCode);
      const abortReason = currentStreamAbortReason(abortController);
      const runConflict = error instanceof ChatAdapterError
        && error.code === "RUN_ALREADY_ACTIVE";
      runConflictDetected = runConflict;
      const stillViewingSession = activeSessionCodeRef.current === activeSession.sessionId;
      if (stillViewingSession) {
        setMessages((current) => current.filter((message) => (
          runConflict
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
      assistantReplyQueueRef.current?.flush(optimisticAssistantCode);
      const ownsObserver = abortRef.current === abortController;
      setStreamingAssistantMessageCode((current) => (
        current === optimisticAssistantCode ? null : current
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
    void activeAdapter.sendA2uiActionStream(activeSession, input, {
      onAguiEvent: event => { if (abortRef.current !== controller || activeSessionCodeRef.current !== activeSession.sessionId) return; receiveA2ui(event); if (event.runId) { activeRunCodeRef.current = event.runId; setActiveRunCode(event.runId); } setLiveAguiEvents(current => [...current, event]); },
    }, controller.signal).then(result => {
      a2uiSession.completeAction(input.actionId);
      if (activeSessionCodeRef.current !== activeSession.sessionId) return;
      const epoch = acknowledgeCompletedTurn(result.session.sessionId, result.run.runId);
      setMessages(current => mergeChatMessagesChronologically(current, result.messages));
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
      abortRef.current = null; activeRunCodeRef.current = ""; setSendingState(false); setActiveRunCode("");
    });
  };

  async function handleAnswerUserInput(answers: ChatUserInputAnswer[]) {
    if (!session || !userInputRequest || !activeAdapter.answerUserInputRequestStream) return;
    const submittedRequest = userInputRequest;
    const submittedSessionId = session.sessionId;
    const markAnswered = () => {
      if (activeSessionCodeRef.current !== submittedSessionId) return;
      if (submittedRequest.nativeInteraction) answeredNativeInteractionsRef.current.add(submittedRequest.requestId);
      setUserInputAnswerPending(false);
      setUserInputRequest(current => current?.requestId === submittedRequest.requestId ? null : current);
      setUserInputRequests(current => current.map(request => request.requestId === submittedRequest.requestId
        ? { ...request, answers, answeredAt: request.answeredAt ?? Date.now(), assistantMessageId: request.assistantMessageId ?? continuationAnchorMessageCode, status: "Answered" as const } : request));
    };
    const continuationAnchorMessageCode = [...messages]
      .reverse()
      .find((message) => message.role === "ASSISTANT")?.messageId ?? messages.at(-1)?.messageId ?? "";
    setUserInputAnswerPending(true);
    let presentationEpoch = ++presentationRefreshEpochRef.current;
    setSendingState(true);
    setLiveAguiPending(aguiEnabled);
    setLiveAguiPendingAnchorMessageCode(continuationAnchorMessageCode);
    setLiveAguiEvents([]);
    setLiveAguiAnchorMessageCodes({});
    try {
      const result = await activeAdapter.answerUserInputRequestStream(
        session,
        userInputRequest.requestId,
        {...nativeUserInputAnswer(userInputRequest, answers), ...(activeAdapter.loadA2uiState ? {clientCapabilities: {userInputRequests:true,a2ui:{version:"v0.9.1" as const,catalogIds:[AGENT_CATALOG_ID]}}, a2uiMetadata:a2uiSession.metadata(session.metadata?.agentId as string | undefined ?? "main-agent")} : {})},
        {
          onAguiEvent: (event) => {
            if (activeSessionCodeRef.current !== submittedSessionId) return;
            // A resumed run starts only after the backend accepts the answer.
            if (event.type === "RUN_STARTED") {
              markAnswered();
              if (event.runId) { activeRunCodeRef.current = event.runId; setActiveRunCode(event.runId); }
            }
            receiveA2ui(event);
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
      setMessages((current) => mergeChatMessagesChronologically(current, result.messages));
      setSession(result.session);
      setUserInputRequest(result.userInputRequest?.status === "Pending" ? result.userInputRequest : null);
      setUserInputRequests((current) => current.map((request) => (
        request.requestId === userInputRequest.requestId
          ? { ...request, answers, answeredAt: request.answeredAt ?? Date.now(), assistantMessageId: request.assistantMessageId ?? continuationAnchorMessageCode, status: "Answered" as const }
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
        activeRunCodeRef.current = "";
        setActiveRunCode("");
        setSendingState(false);
        setUserInputAnswerPending(false);
        setLiveAguiPending(false);
        setLiveAguiPendingAnchorMessageCode("");
    }
  }

  async function handleSend() {
    if (initialSubmitPendingRef.current || sendingRef.current || sendDisabled || userInputRequest || userInputAnswerPending) return;
    // Capture the submitted draft before awaiting session creation. Subsequent
    // input changes must not alter the message being admitted.
    const content = draft.trim();
    const attachments = pendingAttachments;
    if (!content && !attachments.length) return;
    const submission = Symbol("initial-submission");
    initialSubmitPendingRef.current = submission;
    try {
      const activeSession = await ensureSession();
      const sendInput = createSendInput(activeSession, content, attachments);
      if (!sendInput) return;
      setDraft("");
      setPendingAttachments([]);
      if (remoteActiveRunRef.current) {
        enqueueSubmission(activeSession, sendInput);
        return;
      }
      if (initialSubmitPendingRef.current === submission) initialSubmitPendingRef.current = null;
      await runMessage(activeSession, sendInput);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Chat send failed", "Chat send failed");
    } finally {
      if (initialSubmitPendingRef.current === submission) initialSubmitPendingRef.current = null;
    }
  }

  async function handleQueue() {
    if (queueDisabled || userInputRequest || userInputAnswerPending) return;
    const activeSession = await ensureSession();
    if (!activeSession) return;
    const content = draft.trim();
    if (!content && !pendingAttachments.length) return;
    const sendInput = createSendInput(activeSession, content, pendingAttachments);
    if (!sendInput) return;
    setDraft("");
    setPendingAttachments([]);
    if (sendingRef.current || remoteActiveRunRef.current) {
      enqueueSubmission(activeSession, sendInput);
      return;
    }
    await runMessage(activeSession, sendInput);
  }

  async function handleSteer() {
    if (steeringRef.current || steerDisabled || userInputRequest || userInputAnswerPending) return;
    const activeSession = session;
    if (!activeSession) return;
    const content = draft.trim();
    if (!content && !pendingAttachments.length) return;
    const sendInput = createSendInput(activeSession, content, pendingAttachments);
    if (!sendInput) return;
    const expectedRunId = activeRunCodeRef.current
      || remoteActiveRunRef.current?.runId
      || "";
    const queueGeneration = queueGenerationRef.current;
    const autoDrainEpoch = autoDrainEpochRef.current;
    setDraft("");
    setPendingAttachments([]);
    if (
      !expectedRunId
      || !activeAdapter.capabilities.supportsSteer
      || !activeAdapter.steerMessage
    ) {
      enqueueSubmission(activeSession, sendInput);
      return;
    }

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
      if (steerAbortRef.current !== abortController) {
        // A resolved ACK means the backend accepted and persisted the steer.
        // Ignore a stale observer result without sending the same input again.
        return;
      }
      if (activeSessionCodeRef.current === result.sessionId) {
        setMessages((current) => mergeChatMessagesChronologically(
          current,
          [result.message],
        ));
      }
    } catch (error) {
      const observerDetached = steerAbortRef.current !== abortController;
      const safeQueueFallback = error instanceof ChatAdapterError
        && isSteerQueueFallbackCode(error.code);
      if (safeQueueFallback && queueGenerationRef.current === queueGeneration) {
        enqueueSubmission(activeSession, sendInput, "front");
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

  function handleEditQueuedMessage(id: string, content: string) {
    const submission = queuedSubmissionsRef.current.find((item) => item.id === id);
    replaceQueuedSubmissions(
      removeQueuedChatSubmission(queuedSubmissionsRef.current, id),
    );
    setDraft(content);
    setPendingAttachments(submission?.input.attachments ?? []);
  }

  function handleRemoveQueuedMessage(id: string) {
    replaceQueuedSubmissions(
      removeQueuedChatSubmission(queuedSubmissionsRef.current, id),
    );
  }

  async function handleStop() {
    if (!session || stopping) return;
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
    if (!session || !activeAdapter.downloadAttachment) return undefined;
    return (attachment: ChatMessageAttachment) =>
      activeAdapter.downloadAttachment!(session, attachment);
  }, [activeAdapter, session]);
  const pendingAttachmentHeader = pendingAttachments.length ? (
    <div className="ef-chat__runtime-attachments ef-chat__runtime-attachments--pending">
      {pendingAttachments.map((attachment) => (
        <PendingAttachmentCard
          attachment={attachment}
          downloadAttachment={attachmentDownloader}
          key={attachment.id}
          onRemove={(attachmentId) => setPendingAttachments((current) => (
            current.filter((item) => item.id !== attachmentId)
          ))}
        />
      ))}
    </div>
  ) : null;
  const runtimeFooterAddon = (
    <div className="ef-chat__runtime-footer-addon">
      {showAttachmentControl && activeAdapter.uploadAttachment ? (
        <div className="ef-chat__runtime-attachments">
          <input
            className="ef-chat__runtime-attachment-input"
            ref={attachmentFileInputRef}
            type="file"
            onChange={(event) => { void handleAttachmentFileInputChange(event); }}
          />
          <button
            aria-label="Attach file"
            className="ef-chat__icon-button"
            disabled={Boolean(config.disabledInput) || attachmentUploadPending}
            title={attachmentUploadPending ? "Uploading attachment" : "Attach file"}
            type="button"
            onClick={() => attachmentFileInputRef.current?.click()}
          >
            <Paperclip size={16} />
          </button>
        </div>
      ) : null}
      {footerAddon}
    </div>
  );

  const composerFeedback = <>
    {composerHeader ?? pendingAttachmentHeader}
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
      disabledInput={creatingSession || Boolean(config.disabledInput) || userInputRequest?.status === "Pending"}
      draft={draft}
      emptyDescription={emptyDescription ?? "Create a session to start chatting."}
      emptyTitle={emptyTitle}
      footerAddon={runtimeFooterAddon}
      formatAnnotationCount={formatAnnotationCount}
      headerContent={headerContent}
      inputPlaceholder={config.inputPlaceholder}
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
      onEditMessage={setDraft}
      onEditQueuedMessage={handleEditQueuedMessage}
      onRemoveQueuedMessage={handleRemoveQueuedMessage}
      onSend={(mode) => { void handleSubmit(mode); }}
      onStop={() => { void handleStop(); }}
      protocolEvents={protocolEvents}
      queueDisabled={queueDisabled || Boolean(userInputRequest)}
      queuedMessages={visibleQueuedSubmissions}
      runningSubmitModes={runningSubmitModes}
      sendDisabled={sendDisabled || Boolean(userInputRequest)}
      sending={runActive}
      streamingAssistantMessageCode={streamingAssistantMessageCode}
      session={session}
      showAgui={aguiEnabled}
      showHeader={showHeader ?? !config.floating}
      showStop={canStop}
      sidebarContent={sidebarContent}
      steerDisabled={steerDisabled || Boolean(userInputRequest)}
      title={config.title || floatingTitle}
      userInputLabels={config.userInputLabels}
      userInputRequests={userInputRequests}
      workRailLabels={config.workRailLabels}
      userInputAnswerPending={userInputAnswerPending}
      userInputRequest={userInputRequest}
      onAnswerUserInput={(answers) => { void handleAnswerUserInput(answers); }}
      a2uiSession={a2uiSession}
      a2uiDisabled={sending || session?.status === "ARCHIVED"}
      onA2UIAction={handleA2uiAction}
      renderMarkdownLink={renderMarkdownLink}
    />
  );

  if (config.floating !== false) {
    return (
      <ChatWindow
        showNewSession={config.showNewSession}
        allowDraftSession={allowDraftSession}
        attachmentLabels={attachmentLabels}
        attachmentDownloader={attachmentDownloader}
        autoFocusComposer={autoFocusComposer}
        composerRef={composerRef}
        composerHeader={composerFeedback}
        currentUserDisplayName={currentUserDisplayName}
        debugOptions={resolvedDebugOptions}
        disabledInput={creatingSession || Boolean(config.disabledInput) || userInputRequest?.status === "Pending"}
        draft={draft}
        emptyDescription={emptyDescription ?? "Create a session to start chatting."}
        emptyTitle={emptyTitle}
        footerAddon={runtimeFooterAddon}
        formatAnnotationCount={formatAnnotationCount}
        inputPlaceholder={config.inputPlaceholder}
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
        onEditMessage={setDraft}
        onEditQueuedMessage={handleEditQueuedMessage}
        onRemoveQueuedMessage={handleRemoveQueuedMessage}
        onSend={(mode) => { void handleSubmit(mode); }}
        onStop={() => { void handleStop(); }}
        protocolEvents={protocolEvents}
        queueDisabled={queueDisabled || Boolean(userInputRequest)}
        queuedMessages={visibleQueuedSubmissions}
        runningSubmitModes={runningSubmitModes}
        sendDisabled={sendDisabled || Boolean(userInputRequest)}
        sending={runActive}
        streamingAssistantMessageCode={streamingAssistantMessageCode}
        session={session}
        showAgui={aguiEnabled}
        showStop={canStop}
        sidebarContent={sidebarContent}
        steerDisabled={steerDisabled || Boolean(userInputRequest)}
        state={windowState}
        storageKey={config.storageKey || "agent-ui.chat.runtime.window"}
        title={floatingTitle}
        titleSubtitle={floatingSubtitle}
        userInputLabels={config.userInputLabels}
        userInputRequests={userInputRequests}
        workRailLabels={config.workRailLabels}
        userInputAnswerPending={userInputAnswerPending}
        userInputRequest={userInputRequest}
        onAnswerUserInput={(answers) => { void handleAnswerUserInput(answers); }}
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
