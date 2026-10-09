import type { ChatHistoryLabels, HistoryMessageView, HistoryQuery, SessionHistory } from "./history";
export type ChatSessionStatus = "ACTIVE" | "ARCHIVED";
export type ChatSessionSource = string;
export type ChatMessageRole = "USER" | "ASSISTANT";
export type ChatMessageChannel = string;
export type ChatRunningSubmitMode = "steer" | "queue";
export type ChatSubmitMode = "send" | ChatRunningSubmitMode;

export class ChatAdapterError extends Error {
  readonly code?: string;
  readonly details?: unknown;
  readonly status?: number;

  constructor(message: string, options: { code?: string; details?: unknown; status?: number } = {}) {
    super(message);
    this.name = "ChatAdapterError";
    this.code = options.code;
    this.details = options.details;
    this.status = options.status;
  }
}

export type ReasoningEffort =
  | "None"
  | "Minimal"
  | "Low"
  | "Medium"
  | "High"
  | "XHigh"
  | "Max"
  | "Ultra";

export interface ChatModelSelection {
  kind: "fixed" | "route" | "auto";
  providerId?: string | null;
  modelId?: string | null;
  routeId?: string | null;
}

export interface ChatSession {
  id: number | string;
  sessionId: string;
  userId?: string | null;
  groupId?: string | null;
  groupTitle?: string | null;
  displayName?: string | null;
  metadata?: Record<string, unknown>;
  title: string;
  status: ChatSessionStatus;
  lastRunId?: string | null;
  lastRunStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionGroup {
  groupId?: string | null;
  groupTitle: string;
  sessions: ChatSession[];
  pendingInteractionCount?: number;
  pendingInteractionSessionIds?: string[];
}

export interface CreateChatSessionInput {
  title?: string | null;
  groupId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateChatSessionInput {
  title: string;
}

export interface ChatMessage {
  history?: HistoryMessageView;
  id: number | string;
  messageId: string;
  sessionId: string;
  runId?: string | null;
  role: ChatMessageRole;
  channel: ChatMessageChannel;
  actor: string;
  content: string;
  attachments?: ChatMessageAttachment[];
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  createdAt: string;
}

export type ChatMessageAttachmentKind = "file" | "image" | "inspection";

export interface ChatMessageAttachment {
  id: string;
  kind: ChatMessageAttachmentKind;
  title?: string | null;
  imageUrl?: string | null;
  resourceId?: string | null;
  fileName?: string | null;
  contentType?: string | null;
  byteSize?: number | null;
  metadata: Record<string, unknown>;
  summary: string;
}

export interface ChatAttachmentLabels {
  attachments: string;
  annotationPreview: string;
}

export interface ChatAttachmentUploadInput {
  file: File;
  kind?: ChatMessageAttachmentKind;
  metadata?: Record<string, unknown>;
  summary?: string;
}

export interface ChatTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ChatRunSummary {
  runId: string;
  conversationId?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  status: "COMPLETED" | "AWAITING_USER_INPUT";
  finalOutput: string;
  stepCount: number;
  tokenUsage?: ChatTokenUsage | null;
  metadata?: Record<string, unknown>;
}

export interface ChatSendResult {
  session: ChatSession;
  run: ChatRunSummary;
  messages: ChatMessage[];
  userInputRequest?: ChatUserInputRequest | null;
}

export type ChatUserInputAnswerKind = "Option" | "Other" | "Skipped";

export interface ChatUserInputOption {
  optionId: string;
  label: string;
  description?: string | null;
}

export interface ChatUserInputQuestion {
  questionId: string;
  question: string;
  options: ChatUserInputOption[];
  allowCustomAnswer?: boolean;
  allowSkip?: boolean;
}

export interface ChatUserInputAnswer {
  questionId: string;
  answerKind: ChatUserInputAnswerKind;
  optionId?: string | null;
  otherText?: string | null;
}

export interface ChatUserInputRequest {
  requestId: string;
  sessionId: string;
  runId: string;
  assistantMessageId?: string | null;
  intro: string;
  questions: ChatUserInputQuestion[];
  answers?: ChatUserInputAnswer[] | null;
  status: "Pending" | "Answered";
  requestedAt: number;
  answeredAt?: number | null;
  nativeInteraction?: { reason: string; responseSchema: unknown; optionPayloads: Record<string, unknown> };
}

export interface ChatAguiResumeEntry {
  interruptId: string;
  status: "resolved" | "cancelled";
  payload: unknown;
}

export interface ChatUserInputAnswerInput {
  answers: ChatUserInputAnswer[];
  resume?: ChatAguiResumeEntry[];
}

export interface ChatUserInputLabels {
  ariaLabel: string;
  progress: (current: number, total: number) => string;
  back: string;
  next: string;
  continue: string;
  confirm?: string;
  approve?: string;
  reject?: string;
  continuing: string;
  otherOptionLabel: string;
  otherOptionDescription: string;
  skipOptionLabel: string;
  skipOptionDescription: string;
  otherAnswerPlaceholder: string;
  otherAnswerAriaLabel: (index: number) => string;
}

export interface ChatRunNoticeLabels {
  mcpUnavailable?: string;
  presentationIncomplete?: string;
  presentationIncompleteDetail?: string;
  compactionRequested: string;
  compactionStarted: string;
  compactionCompleted: string;
  compactionFailed: string;
  compactionInterrupted: string;
  toolSchemaOverBudget: string;
  toolSchemaBudget: (estimatedTokens: number, limitTokens: number, toolCount: number) => string;
  toolSchemaBudgetHint: string;
}

export interface ChatToolWorkLabels {
  ariaLabel: string;
  completed: (name: string) => string;
  running: (name: string) => string;
  domainExpanded: (name: string) => string;
  domainExpanding: (name: string) => string;
  group: (count: number) => string;
  statusDone: string;
  statusRunning: string;
  parameters: string;
  result: string;
  log: string;
  noResult: string;
  waitingActivity: string;
  copyParameters: string;
  copyResult: string;
  reasoningCaptured: string;
  reasoningThinking: string;
  reasoningAria: string;
  emptyReasoning: string;
  resolveName: (runtimeName: string, args: unknown) => string;
}

export interface ChatWorkRailLabels {
  ariaLabel: string;
  preparing: string;
  responding: string;
  thinking: string;
  workedFor: (duration: string) => string;
  workingFor: (duration: string) => string;
  failed?: string;
  stopped?: string;
  notices?: Partial<ChatRunNoticeLabels>;
  askingQuestions?: (count: number) => string;
  askedQuestions?: (count: number) => string;
  waitingForAnswer?: string;
  skipped?: string;
  tool?: Partial<ChatToolWorkLabels>;
}

export interface SendChatMessageInput {
  content: string;
  pageContext?: {
    title: string;
    path: string;
  };
  modelSelection?: ChatModelSelection | null;
  modelId?: string | null;
  reasoningEffort?: ReasoningEffort | null;
  metadata?: Record<string, unknown>;
  attachments?: ChatMessageAttachment[];
  clientCapabilities?: {
    userInputRequests?: boolean;
  };
}

export interface ChatQueuedSubmission {
  id: string;
  sessionId: string;
  input: SendChatMessageInput;
}

export interface ChatSteerContext {
  expectedRunId: string;
}

export interface ChatSteerResult {
  sessionId: string;
  runId: string;
  message: ChatMessage;
}

export type ChatActiveRunState = "RUNNING" | "FINISHING";

export interface ChatActiveRun {
  runId: string;
  runtimeAdapterKey: string;
  supportsSteer: boolean;
  state: ChatActiveRunState;
}

export interface ChatRuntimeRunState {
  active: boolean;
  runId: string;
  sessionId: string;
  supportsSteer: boolean;
}

export interface ChatActiveRunResult {
  sessionId: string;
  activeRun: ChatActiveRun | null;
}

export interface ChatStopContext {
  expectedRunId: string;
}

export interface ChatStopResult {
  sessionId: string;
  runId: string;
}

export interface ChatAguiEvent {
  id: string;
  type: string;
  eventName: string;
  runId?: string | null;
  streamKey: string;
  occurredAt: string;
  outcome: string;
  metadata: Record<string, string>;
}

export interface ChatAguiInterrupt {
  id: string;
  reason: string;
  message?: string;
  toolCallId?: string;
  responseSchema?: unknown;
  metadata?: Record<string, unknown>;
}

export type ChatAguiRunOutcome =
  | { type: "success" }
  | { type: "interrupt"; interrupts: ChatAguiInterrupt[] };

export type ChatAguiStreamEventType =
  | "RUN_STARTED"
  | "RUN_FINISHED"
  | "RUN_ERROR"
  | "TEXT_MESSAGE_START"
  | "TEXT_MESSAGE_CONTENT"
  | "TEXT_MESSAGE_END"
  | "REASONING_START"
  | "REASONING_MESSAGE_START"
  | "REASONING_MESSAGE_CONTENT"
  | "REASONING_TEXT_CONTENT"
  | "REASONING_MESSAGE_END"
  | "REASONING_END"
  | "TOOL_CALL_START"
  | "TOOL_CALL_ARGS"
  | "TOOL_CALL_END"
  | "TOOL_CALL_RESULT"
  | "ACTIVITY_SNAPSHOT"
  | "ACTIVITY_DELTA"
  | string;

export interface ChatAguiStreamEvent {
  type: ChatAguiStreamEventType;
  threadId?: string;
  runId?: string;
  supportsSteer?: boolean;
  activity?: string;
  reasoningEffort?: ReasoningEffort | null;
  messageId?: string;
  role?: string;
  delta?: string | unknown[];
  content?: string;
  code?: string;
  message?: string;
  toolCallId?: string;
  toolCallName?: string;
  toolCallArgs?: unknown;
  parentMessageId?: string;
  timestamp?: number;
  outcome?: ChatAguiRunOutcome | null;
  // AG-UI native results are opaque JSON; adapters validate product completion payloads.
  result?: unknown;
  [key: string]: unknown;
}

export type TranscriptAguiEvent = ChatAguiEvent | ChatAguiStreamEvent;

export interface ChatStreamHandlers {
  onAguiEvent?: (event: ChatAguiStreamEvent) => void;
  onDelta?: (delta: string) => void;
}

export interface ChatAdapterCapabilities {
  supportsAbort: boolean;
  supportsActiveRun?: boolean;
  supportsAgui: boolean;
  supportsProtocolReplay: boolean;
  supportsSteer?: boolean;
  supportsStop?: boolean;
  supportsStreaming: boolean;
  supportsUserInputRequests?: boolean;
}

export interface ChatAdapter {
  capabilities: ChatAdapterCapabilities;
  createSession: (input: CreateChatSessionInput) => Promise<ChatSession>;
  deleteSession: (sessionId: string, signal?: AbortSignal) => Promise<ChatSession>;
  downloadAttachment?: (
    session: ChatSession,
    attachment: ChatMessageAttachment,
    signal?: AbortSignal,
  ) => Promise<Blob>;
  getActiveRun?: (
    sessionId: string,
    signal?: AbortSignal,
  ) => Promise<ChatActiveRunResult>;
  loadAguiEvents: (sessionId: string) => Promise<ChatAguiEvent[]>;
  loadMessages: (sessionId: string) => Promise<ChatMessage[]>;
  /** Authoritative structured history. Ordinary reads skip all replay endpoints. */
  loadHistory?: (sessionId: string, query: HistoryQuery, signal?: AbortSignal) => Promise<SessionHistory>;
  loadUserInputRequests?: (
    sessionId: string,
    signal?: AbortSignal,
  ) => Promise<ChatUserInputRequest[]>;
  answerUserInputRequestStream?: (
    session: ChatSession,
    requestId: string,
    input: ChatUserInputAnswerInput,
    handlers?: ChatStreamHandlers,
    signal?: AbortSignal,
  ) => Promise<ChatSendResult>;
  loadProtocolEvents?: (sessionId: string) => Promise<ChatAguiStreamEvent[]>;
  steerMessage?: (
    session: ChatSession,
    input: SendChatMessageInput,
    context: ChatSteerContext,
    signal?: AbortSignal,
  ) => Promise<ChatSteerResult>;
  stopRun?: (
    session: ChatSession,
    context: ChatStopContext,
    signal?: AbortSignal,
  ) => Promise<ChatStopResult>;
  uploadAttachment?: (
    session: ChatSession,
    input: ChatAttachmentUploadInput,
    signal?: AbortSignal,
  ) => Promise<ChatMessageAttachment>;
  streamMessage: (
    session: ChatSession,
    input: SendChatMessageInput,
    handlers?: ChatStreamHandlers,
    signal?: AbortSignal,
  ) => Promise<ChatSendResult>;
}

export interface ChatFloatingState {
  collapsed: boolean;
  height: number;
  open: boolean;
  width: number;
  x: number;
  y: number;
}

export interface ChatClientConfig {
  historyLabels?: ChatHistoryLabels;
  defaultSessionId?: string;
  disabledInput?: boolean;
  disabledToBottom?: boolean;
  draggable?: boolean;
  floating?: boolean;
  fullScreen?: boolean;
  fullScreenMinWidth?: number;
  inputPlaceholder?: string;
  maxFileSize?: number;
  maxLimitFile?: number;
  open?: boolean;
  resizable?: boolean;
  showAgui?: boolean;
  showSessionList?: boolean;
  storageKey?: string;
  title?: string;
  userInputLabels?: ChatUserInputLabels;
  workRailLabels?: ChatWorkRailLabels;
}

export interface ChatDebugOptions {
  debugEventTypes?: string[];
  recentTurnLimit?: number;
}
