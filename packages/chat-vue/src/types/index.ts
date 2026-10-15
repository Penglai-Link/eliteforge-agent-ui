import type { ComposerVueProps } from "@eliteforge/agent-ui-composer-vue";
import type { MessageSender } from "@eliteforge/agent-ui-chat-core";
import type { ChatA2uiActionHandler as ActionHandler, ChatA2uiSession } from "@eliteforge/agent-ui-chat-core";
import type {
  AssistantReplyEffect,
  ChatAdapter,
  ChatAttachmentLabels,
  ChatAnnotationLabels,
  ChatAnnotation,
  ChatAguiStreamEvent,
  ChatClientConfig,
  ChatDebugOptions,
  ChatFloatingState,
  ChatMessage,
  ChatHistoryLabels,
  ChatInputSuggestion,
  ChatInputSuggestionLabels,
  ChatMessageAttachment,
  ChatQueuedSubmission,
  ChatRunningSubmitMode,
  ChatRuntimeRunState,
  ChatSession,
  ChatSubmitMode,
  ChatUserInputAnswer,
  ChatUserInputLabels,
  ChatUserInputRequest,
  ChatWorkRailLabels,
} from "@eliteforge/agent-ui-chat-core";

export interface ChatPanelProps extends Pick<ComposerVueProps, "pendingAttachments" | "showAttachmentControl" | "attachmentUploadPending" | "onAttachFile" | "onRemoveAttachment" | "attachLabel" | "uploadingLabel" | "removeAttachmentLabel" | "editQueuedLabel" | "removeQueuedLabel" | "queuedInputPlaceholder" | "steeringInputPlaceholder"> {
  pendingAnnotations?: ChatAnnotation[];
  onPendingAnnotationsChange?: (annotations: ChatAnnotation[]) => void;
  annotationLabels?: ChatAnnotationLabels;
  a2uiSession?: ChatA2uiSession;
  a2uiDisabled?: boolean;
  onA2UIAction?: ActionHandler;
  attachmentDownloader?: (attachment: ChatMessageAttachment) => Promise<Blob>;
  attachmentLabels?: ChatAttachmentLabels;
  autoFocusComposer?: boolean;
  composerHeader?: ComposerVueProps["composerHeader"];
  createSessionLabel?: string;
  currentUserDisplayName?: string;
  currentSender?: MessageSender;
  debugOptions?: ChatDebugOptions;
  disabledInput?: boolean;
  draft: string;
  emptyDescription?: string;
  emptyTitle?: string;
  formatAnnotationCount?: (count: number) => string;
  inputPlaceholder?: string;
  inputSuggestions?: ChatInputSuggestion[];
  skillSuggestionTriggers?: Array<"$" | "/">;
  inputSuggestionLabels?: ChatInputSuggestionLabels;
  liveAguiAnchorMessageCodes?: Record<string, string>;
  liveAguiEvents?: ChatAguiStreamEvent[];
  liveAguiPendingAnchorMessageCode?: string;
  liveAguiPending?: boolean;
  messages: ChatMessage[];
  historyLoading?: boolean;
  historyLoadingOlder?: boolean;
  historyLabels?: ChatHistoryLabels;
  onLoadOlderHistory?: () => void;
  onCreateSession?: () => void;
  onNewSession?: () => void;
  onDraftChange: (value: string) => void;
  onPasteAttachment?: (file: File) => void | Promise<void>;
  onEditMessage?: (content: string, message?: ChatMessage) => void;
  onEditQueuedMessage?: (id: string, content: string) => void;
  onSteerQueuedMessage?: (id: string) => void;
  onReorderQueuedMessage?: (sourceId: string, targetId: string) => void;
  onRemoveQueuedMessage?: (id: string) => void;
  onSend: (mode?: ChatSubmitMode) => void;
  onStop?: () => void;
  protocolEvents?: ChatAguiStreamEvent[];
  queueDisabled?: boolean;
  queuedLabel?: string;
  queuedMessages?: ChatQueuedSubmission[];
  runningSubmitModes?: ChatRunningSubmitMode[];
  runningEnterSubmitMode?: ChatRunningSubmitMode;
  sendDisabled?: boolean;
  sendLabel?: string;
  sending?: boolean;
  streamingAssistantMessageCode?: string | null;
  session?: ChatSession | null;
  showAgui?: boolean;
  showReasoningCards?: boolean;
  showHeader?: boolean;
  showStop?: boolean;
  steerDisabled?: boolean;
  queuedSteerDisabled?: boolean;
  stopLabel?: string;
  title?: string;
  userInputLabels?: ChatUserInputLabels;
  workRailLabels?: ChatWorkRailLabels;
  userInputRequests?: ChatUserInputRequest[];
  userInputRequest?: ChatUserInputRequest | null;
  userInputAnswerPending?: boolean;
  onAnswerUserInput?: (answers: ChatUserInputAnswer[]) => void;
}

export type ToastLikeCallback = (message: string, title?: string) => void;

export interface ChatRuntimeWindowProps {
  pendingAnnotations?: ChatAnnotation[];
  onPendingAnnotationsChange?: (annotations: ChatAnnotation[]) => void;
  /** Forward A2UI actions to the host transport. */
  a2uiSession?: ChatA2uiSession;
  a2uiDisabled?: boolean;
  onA2UIAction?: ActionHandler;
  agentReplyEffect?: AssistantReplyEffect;
  agentReplySpeed?: number;
  adapter?: ChatAdapter;
  attachmentLabels?: ChatAttachmentLabels;
  autoFocusComposer?: boolean;
  config: ChatClientConfig;
  composerHeader?: ComposerVueProps["composerHeader"];
  currentUserDisplayName?: string;
  currentSender?: MessageSender;
  draft?: string;
  debugOptions?: ChatDebugOptions;
  emptyDescription?: string;
  emptyTitle?: string;
  floatingSubtitle?: string;
  floatingTitle?: string;
  formatAnnotationCount?: (count: number) => string;
  footerAddon?: unknown;
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
  ) => import("@eliteforge/agent-ui-chat-core").SendChatMessageInput | null;
  showAttachmentControl?: boolean;
  showHeader?: boolean;
  onWindowStateChange?: (state: ChatFloatingState) => void;
  windowState?: ChatFloatingState;
}

export interface ChatWindowProps extends Omit<
  ChatPanelProps,
  "showHeader"
> {
  onStateChange?: (state: ChatFloatingState) => void;
  showNewSession?: boolean;
  state?: ChatFloatingState;
  storageKey?: string;
  title?: string;
  titleSubtitle?: string;
}
