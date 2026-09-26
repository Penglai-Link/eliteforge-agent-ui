import {
  AssistantReplyQueue,
  buildTranscriptPresentation,
  createMockChatAdapter,
  enqueueChatSubmission,
  ChatAdapterError,
  isSteerQueueFallbackCode,
  mergeChatMessagesChronologically,
  mergeTranscriptAguiEvents,
  normalizeChatSession,
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
  draft?: string;
  debugOptions?: ChatDebugOptions;
  emptyDescription?: string;
  emptyTitle?: string;
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
  draft: controlledDraft,
  debugOptions,
  emptyDescription,
  emptyTitle,
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
  onRunStateChange,
  onSessionChange,
  pendingAttachments: controlledPendingAttachments,
  createSendInput: createSendInputOverride,
  showAttachmentControl = true,
  showHeader,
  sidebarContent,
  windowState,
  onWindowStateChange,
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
  const [userInputRequest, setUserInputRequest] = useState<ChatUserInputRequest | null>(null);
  const [userInputRequests, setUserInputRequests] = useState<ChatUserInputRequest[]>([]);
  const [userInputAnswerPending, setUserInputAnswerPending] = useState(false);
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
  const [liveAguiPending, setLiveAguiPending] = useState(false);
  const [activeRunCode, setActiveRunCode] = useState("");
  const [activeRunSupportsSteer, setActiveRunSupportsSteer] = useState<boolean | null>(null);
  const [remoteActiveRun, setRemoteActiveRun] = useState<ChatActiveRun | null>(null);
  const [activeRunStatusPending, setActiveRunStatusPending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [queuedSubmissions, setQueuedSubmissions] = useState<ChatQueuedSubmission[]>([]);
  const activeSessionCodeRef = useRef("");
  const activeRunCodeRef = useRef("");
  const remoteActiveRunRef = useRef<ChatActiveRun | null>(null);
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
  const currentLiveAguiRunCodesRef = useRef<Set<string>>(new Set());
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
    () => messages.filter((message) => message.sessionId === session?.sessionId),
    [messages, session?.sessionId],
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
    remoteActiveRunRef.current = next;
    setRemoteActiveRun(next);
  }

  async function loadActiveRunSnapshot(
    sessionId: string,
    signal?: AbortSignal,
  ) {
    if (
      !activeAdapter.capabilities.supportsActiveRun
      || !activeAdapter.getActiveRun
    ) {
      return null;
    }
    const result = await activeAdapter.getActiveRun(sessionId, signal);
    return result.activeRun;
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
    detachRunObserver("detach", false);
    detachSteerObserver(false);
  }, []);

  useEffect(() => {
    let active = true;
    const abortController = new AbortController();
    async function loadSessionState() {
      if (!session?.sessionId) {
        setMessages([]);
        setAguiEvents([]);
        setProtocolEvents([]);
        setUserInputRequests([]);
        replaceRemoteActiveRun(null);
        return;
      }
      setLoading(true);
      try {
        const [nextMessages, nextAguiEvents, nextProtocolEvents, nextActiveRun, nextUserInputRequests] = await Promise.all([
          activeAdapter.loadMessages(session.sessionId),
          aguiEnabled ? activeAdapter.loadAguiEvents(session.sessionId) : Promise.resolve([]),
          protocolReplayEnabled && activeAdapter.loadProtocolEvents
            ? activeAdapter.loadProtocolEvents(session.sessionId)
            : Promise.resolve([]),
          loadActiveRunSnapshot(session.sessionId, abortController.signal)
            .catch(() => undefined),
          activeAdapter.capabilities.supportsUserInputRequests && activeAdapter.loadUserInputRequests
            ? activeAdapter.loadUserInputRequests(session.sessionId, abortController.signal)
            : Promise.resolve([]),
        ]);
        if (!active) return;
        if (!sendingRef.current) setMessages(nextMessages);
        setAguiEvents(nextAguiEvents);
        setProtocolEvents(nextProtocolEvents);
        setUserInputRequests(nextUserInputRequests);
        setUserInputRequest(nextUserInputRequests.find((request) => request.status === "Pending") ?? null);
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
  }, [activeAdapter, aguiEnabled, onError, protocolReplayEnabled, session?.sessionId]);

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
      try {
        const [nextMessages, nextAguiEvents, nextProtocolEvents, nextActiveRun, nextUserInputRequests] = await Promise.all([
          activeAdapter.loadMessages(session.sessionId),
          aguiEnabled ? activeAdapter.loadAguiEvents(session.sessionId) : Promise.resolve([]),
          protocolReplayEnabled && activeAdapter.loadProtocolEvents
            ? activeAdapter.loadProtocolEvents(session.sessionId)
            : Promise.resolve([]),
          loadActiveRunSnapshot(session.sessionId).catch(() => undefined),
          activeAdapter.capabilities.supportsUserInputRequests && activeAdapter.loadUserInputRequests
            ? activeAdapter.loadUserInputRequests(session.sessionId)
            : Promise.resolve([]),
        ]);
        if (activeSessionCodeRef.current !== session.sessionId) return;
        if (!sendingRef.current) setMessages(nextMessages);
        setAguiEvents(nextAguiEvents);
        setProtocolEvents(nextProtocolEvents);
        setUserInputRequests(nextUserInputRequests);
        setUserInputRequest(nextUserInputRequests.find((request) => request.status === "Pending") ?? null);
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
  }, [activeAdapter, aguiEnabled, protocolReplayEnabled, session?.sessionId, shouldPollData, userInputRequest]);

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
    if (loading || config.disabledInput || userInputRequest || userInputAnswerPending) return true;
    if (!draft.trim() && !pendingAttachments.length) return true;
    return false;
  }, [config.disabledInput, draft, loading, pendingAttachments.length, session, userInputAnswerPending, userInputRequest]);
  const queueDisabled = useMemo(
    () => loading || Boolean(config.disabledInput) || Boolean(userInputRequest) || userInputAnswerPending || (!draft.trim() && !pendingAttachments.length) || !session,
    [config.disabledInput, draft, loading, pendingAttachments.length, session, userInputAnswerPending, userInputRequest],
  );
  const steerDisabled = queueDisabled || steering || !canSteer;

  async function ensureSession() {
    if (session) return session;
    const created = await activeAdapter.createSession({
      title: normalizeOptionalValue(config.title) ?? floatingTitle,
    });
    activeSessionCodeRef.current = created.sessionId;
    setSession(created);
    setMessages([]);
    setAguiEvents([]);
    setProtocolEvents([]);
    return created;
  }

  async function handleAttachmentUpload(file: File) {
    if (!file || !activeAdapter.uploadAttachment || attachmentUploadPending) return;
    const activeSession = await ensureSession();
    if (!activeSession) return;
    setAttachmentUploadPending(true);
    try {
      const attachment = await activeAdapter.uploadAttachment(activeSession, {
        file,
        kind: file.type.startsWith("image/") ? "image" : "file",
        summary: file.name,
      });
      if (activeSessionCodeRef.current === activeSession.sessionId) {
        setPendingAttachments((current) => [...current, attachment]);
      }
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Chat attachment upload failed",
        "Attachment upload failed",
      );
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
    const content = sendInput.content.trim();
    if (!content && !(sendInput.attachments?.length)) {
      restoreSourceSubmission();
      return false;
    }
    const submittedAttachments = sendInput.attachments ?? [];
    const autoDrainEpoch = autoDrainEpochRef.current;
    const abortController = new AbortController();
    abortRef.current = abortController;
    streamAbortReasonsRef.current.set(abortController, "none");
    currentLiveAguiRunCodesRef.current.clear();
    currentLiveAguiFailedRunCodesRef.current.clear();
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
        actor: currentUserDisplayName || "User",
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
    try {
      const result = await activeAdapter.streamMessage(
        activeSession,
        sendInput,
        {
          onAguiEvent: (event) => {
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
              currentLiveAguiRunCodesRef.current.add(runId);
              const eventType = String(event.type ?? "").toUpperCase();
              if (eventType === "RUN_ERROR" || eventType === "AGENT.RUN.FAILED") {
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
      await assistantReplyQueueRef.current?.waitForDrain(optimisticAssistantCode);
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
      const nextMessages = await activeAdapter
        .loadMessages(result.session.sessionId)
        .catch(() => null);
      if (nextMessages) {
        setMessages(nextMessages);
      } else {
        setMessages((current) => mergeChatMessagesChronologically(
          current,
          result.messages,
          [optimisticUserCode, optimisticAssistantCode],
        ));
      }
      if (aguiEnabled) {
        const [nextAguiEvents, nextProtocolEvents] = await Promise.all([
          activeAdapter
            .loadAguiEvents(result.session.sessionId)
            .catch(() => aguiEvents),
          protocolReplayEnabled && activeAdapter.loadProtocolEvents
            ? activeAdapter
                .loadProtocolEvents(result.session.sessionId)
                .catch(() => protocolEvents)
            : Promise.resolve([]),
        ]);
        setAguiEvents(nextAguiEvents);
        setProtocolEvents(nextProtocolEvents);
      }
      setLiveAguiEvents([]);
      setLiveAguiAnchorMessageCodes({});
      completedSession = result.session;
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
        const errorMessage = error instanceof Error ? error.message : "Chat send failed";
        if (aguiEnabled) {
          const existingRunCode = activeRunCodeRef.current;
          const runId = existingRunCode || `LOCAL-${optimisticKey}-FAILED`;
          if (!currentLiveAguiFailedRunCodesRef.current.has(runId)) {
            const finishedAt = Date.now();
            const failureEvents: ChatAguiStreamEvent[] = [
              ...(!existingRunCode
                ? [{
                    runId: runId,
                    threadId: activeSession.sessionId,
                    timestamp: finishedAt - 1,
                    type: "RUN_STARTED",
                  }]
                : []),
              {
                runId: runId,
                threadId: activeSession.sessionId,
                timestamp: finishedAt,
                type: "RUN_ERROR",
                code: error instanceof ChatAdapterError
                  ? error.code || "CHAT_SEND_FAILED"
                  : "CHAT_SEND_FAILED",
                message: errorMessage,
              },
            ];
            setLiveAguiEvents((current) => [...current, ...failureEvents]);
            setLiveAguiAnchorMessageCodes((current) => ({
              ...current,
              [runId]: optimisticUserCode,
            }));
            currentLiveAguiRunCodesRef.current.add(runId);
            currentLiveAguiFailedRunCodesRef.current.add(runId);
          }
        } else {
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

  async function handleAnswerUserInput(answers: ChatUserInputAnswer[]) {
    if (!session || !userInputRequest || !activeAdapter.answerUserInputRequestStream) return;
    const continuationAnchorMessageCode = [...messages]
      .reverse()
      .find((message) => message.role === "ASSISTANT")?.messageId ?? "";
    setUserInputAnswerPending(true);
    setSendingState(true);
    setLiveAguiPending(aguiEnabled);
    setLiveAguiPendingAnchorMessageCode(continuationAnchorMessageCode);
    setLiveAguiEvents([]);
    setLiveAguiAnchorMessageCodes({});
    try {
      const result = await activeAdapter.answerUserInputRequestStream(
        session,
        userInputRequest.requestId,
        { answers },
        {
          onAguiEvent: (event) => {
            if (!aguiEnabled) return;
            setLiveAguiEvents((current) => [...current, event]);
            const runId = String(event.runId ?? event.runId ?? "");
            if (runId && continuationAnchorMessageCode) {
              setLiveAguiAnchorMessageCodes((current) => current[runId]
                ? current
                : { ...current, [runId]: continuationAnchorMessageCode });
            }
          },
        },
      );
      setMessages(await activeAdapter.loadMessages(session.sessionId).catch(() => result.messages));
      setSession(result.session);
      const nextUserInputRequests = activeAdapter.loadUserInputRequests
        ? await activeAdapter.loadUserInputRequests(session.sessionId).catch(() => null)
        : null;
      if (nextUserInputRequests) {
        setUserInputRequests(nextUserInputRequests);
        setUserInputRequest(nextUserInputRequests.find((request) => request.status === "Pending") ?? null);
      } else {
        setUserInputRequest(result.userInputRequest?.status === "Pending" ? result.userInputRequest : null);
        setUserInputRequests((current) => current.map((request) => (
          request.requestId === userInputRequest.requestId
            ? { ...request, answers, status: "Answered" as const }
            : request
        )));
      }
      if (aguiEnabled) {
        const [nextAguiEvents, nextProtocolEvents] = await Promise.all([
          activeAdapter.loadAguiEvents(session.sessionId).catch(() => aguiEvents),
          protocolReplayEnabled && activeAdapter.loadProtocolEvents
            ? activeAdapter.loadProtocolEvents(session.sessionId).catch(() => protocolEvents)
            : Promise.resolve([]),
        ]);
        setAguiEvents(nextAguiEvents);
        setProtocolEvents(nextProtocolEvents);
      }
      setLiveAguiEvents([]);
      setLiveAguiPending(false);
      setLiveAguiPendingAnchorMessageCode("");
      setLiveAguiAnchorMessageCodes({});
      await loadActiveRunSnapshot(session.sessionId).then(replaceRemoteActiveRun).catch(() => undefined);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Chat answer failed", "Chat answer failed");
    } finally {
        setSendingState(false);
        setUserInputAnswerPending(false);
        setLiveAguiPending(false);
        setLiveAguiPendingAnchorMessageCode("");
    }
  }

  async function handleSend() {
    if (sendingRef.current || sendDisabled || userInputRequest || userInputAnswerPending) return;
    const activeSession = await ensureSession();
    if (!activeSession) return;
    const content = draft.trim();
    if (!content && !pendingAttachments.length) return;
    const sendInput = createSendInput(activeSession, content, pendingAttachments);
    if (!sendInput) return;
    setDraft("");
    setPendingAttachments([]);
    if (remoteActiveRunRef.current) {
      enqueueSubmission(activeSession, sendInput);
      return;
    }
    await runMessage(activeSession, sendInput);
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

  const panel = (
    <ChatPanel
      attachmentLabels={attachmentLabels}
      attachmentDownloader={attachmentDownloader}
      autoFocusComposer={autoFocusComposer}
      composerRef={composerRef}
      composerHeader={composerHeader ?? pendingAttachmentHeader}
      createSessionLabel={createSessionLabel}
      currentUserDisplayName={currentUserDisplayName}
      debugOptions={resolvedDebugOptions}
      disabledInput={Boolean(config.disabledInput) || userInputRequest?.status === "Pending"}
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
      onCreateSession={onCreateSession ?? (() => { void ensureSession(); })}
      onNewSession={handleNewSession}
      onDraftChange={setDraft}
      onPasteAttachment={handleAttachmentUpload}
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
      renderMarkdownLink={renderMarkdownLink}
    />
  );

  if (config.floating !== false) {
    return (
      <ChatWindow
        attachmentLabels={attachmentLabels}
        attachmentDownloader={attachmentDownloader}
        autoFocusComposer={autoFocusComposer}
        composerRef={composerRef}
        composerHeader={composerHeader ?? pendingAttachmentHeader}
        currentUserDisplayName={currentUserDisplayName}
        debugOptions={resolvedDebugOptions}
        disabledInput={Boolean(config.disabledInput) || userInputRequest?.status === "Pending"}
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
        onCreateSession={onCreateSession ?? (() => { void ensureSession(); })}
        onNewSession={handleNewSession}
        onDraftChange={setDraft}
        onPasteAttachment={handleAttachmentUpload}
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
        renderMarkdownLink={renderMarkdownLink}
      />
    );
  }

  return panel;
}
