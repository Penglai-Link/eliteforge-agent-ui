import { hasPendingBatchItems } from "@eliteforge/agent-ui-chat-core";
import { chatAnnotationsByMessage, chatAnnotationForHref, chatAnnotationTooltip, mountChatAnnotationSelection, mountChatAnnotationPreviews, openChatAnnotationEditor, defaultChatAnnotationLabels, type ChatAnnotationLabels, type ChatAnnotation } from "@eliteforge/agent-ui-chat-core";
import { Composer, type ComposerReactProps } from "@eliteforge/agent-ui-composer-react";
import { messageActorName, messageSenderIsHuman, messageSenderAvatar } from "@eliteforge/agent-ui-chat-core";
import { interactionMessages, historyWorkGroups, historyWorkCompleted, historyCoversAguiWork, currentAguiTerminalEvent, interactionToolSummary } from "@eliteforge/agent-ui-chat-core";
import { ToolResultView } from "./ToolResultView";
import { ChatA2UI } from "./ChatA2UI";
import type { ChatA2uiActionHandler as ActionHandler, ChatA2uiSession } from "@eliteforge/agent-ui-chat-core";
import {
  ArrowDown,
  Bot,
  BrainCircuit,
  CheckCircle2,
  CircleAlert,
  CircleX,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  Square,
  Terminal,
  UserRound,
  X,
} from "lucide-react";
import {
  chatErrorPresentation,
  historyEventRunId,
  aguiEventRunId,
  isAguiCancellationEvent,
  isAguiPresentationFailureEvent,
  aguiWorkElapsedMilliseconds,
  aguiReasoningEffort,
  buildAguiUserWorkCards,
  buildAguiRunNotices,
  buildTranscriptPresentation,
  buildTranscriptWorkTimeline,
  workTimelineElapsedMilliseconds,
  type TranscriptWorkRun,
  historyToolResult, historyBlockUrl,
  defaultHistoryLabels,
  type ChatHistoryLabels,
  type ChatInputSuggestion,
  type ChatInputSuggestionLabels,
  describeDebugEvent,
  formatJsonBlockValue,
  formatTime,
  detectToolPresentationLocale,
  toolDisplayName,
  toolCompactLabel,
  defaultToolActionSummaryLabel,
  summarizeToolActions,
  summarizeReasoning,
  type AguiUserWorkCard,
  type AguiRunNotice,
  type ChatAguiStreamEvent,
  type ChatAttachmentLabels,
  type ChatDebugOptions,
  type ChatMessage,
  type ChatMessageAttachment,
  type ChatQueuedSubmission,
  type ChatRunNoticeLabels,
  type ChatRunningSubmitMode,
  type ChatSession,
  type ChatToolWorkLabels,
  type ChatUserInputAnswer,
  type ChatUserInputLabels,
  type ChatUserInputRequest,
  type ChatWorkRailLabels,
  type ChatSubmitMode,
  type ToolGroupWorkCard,
  type ToolWorkCard,
} from "@eliteforge/agent-ui-chat-core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  type Ref,
  Fragment,
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import "github-markdown-css/github-markdown.css";
import { ChatHistoryRail } from "./ChatHistoryRail";
import { ChatUserInputCard } from "./ChatUserInputCard";
import { buildChatHistoryTurns } from "./chatHistory";
import { isImageAttachment, useAttachmentImageSource } from "./chatAttachments";
import { MarkdownSourceContext, MermaidPre } from "./MermaidBlock";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

async function copyPlainText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export interface ChatMarkdownLinkProps {
  children?: ReactNode;
  href?: string;
}

export type ChatMarkdownLinkRenderer = (props: ChatMarkdownLinkProps) => ReactNode;

const AnnotationLabelsContext = createContext(defaultChatAnnotationLabels);
const AnnotationContext = createContext<ChatAnnotation[]>([]);

function AnnotationLink({ href, children }: { href?: string; children?: ReactNode }) {
  const annotations = useContext(AnnotationContext);
  const renderer = useContext(MarkdownLinkRendererContext);
  const labels = useContext(AnnotationLabelsContext);
  const annotation = chatAnnotationForHref(href, annotations);
  if (annotation) return <span className="ef-chat__annotation-reference" tabIndex={0} role="button" data-annotation-source-id={annotation.messageId} data-annotation-tooltip={chatAnnotationTooltip(annotation, labels)}>{children}</span>;
  return renderer ? renderer({ href, children }) : <a href={href}>{children}</a>;
}

function AnnotationBadges({ annotations, formatCount }: { annotations: ChatAnnotation[]; formatCount: (n: number) => string }) {
  const labels = useContext(AnnotationLabelsContext);
  if (!annotations.length) return null;
  return <div className="ef-chat__text-annotations"><span className="ef-chat__annotation-reference ef-chat__inspection-count" tabIndex={0} role="note" data-annotation-tooltip={annotations.map(item => chatAnnotationTooltip(item, labels)).join("\n\n")}><MessageSquareText size={16} /> {formatCount(annotations.length)}</span></div>;
}

const MarkdownLinkRendererContext = createContext<ChatMarkdownLinkRenderer | undefined>(
  undefined,
);

function MarkdownBlock({
  content,
  emptyMessage,
  streaming = false,
}: {
  content: string;
  emptyMessage: string;
  streaming?: boolean;
}) {
  return (
    <div className="markdown-body" data-chat-annotation-source="true">
      <MarkdownSourceContext.Provider value={{ content: content || emptyMessage, streaming }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ pre: MermaidPre, a: AnnotationLink }}
      >
        {content || emptyMessage}
      </ReactMarkdown>
      </MarkdownSourceContext.Provider>
    </div>
  );
}

function defaultFormatAnnotationCount(count: number) {
  return `${count} annotation${count === 1 ? "" : "s"}`;
}

const defaultAttachmentLabels: ChatAttachmentLabels = {
  attachments: "Attachments",
  annotationPreview: "Annotation preview",
};

function AttachmentImagePreview({
  attachment,
  downloadAttachment,
  onPreview,
}: {
  attachment: ChatMessageAttachment;
  downloadAttachment?: (attachment: ChatMessageAttachment) => Promise<Blob>;
  onPreview: (source: string, alt: string) => void;
}) {
  const source = useAttachmentImageSource(attachment, downloadAttachment);
  if (!source) return null;
  return (
    <figure className="ef-chat__inspection-preview">
      <button
        aria-label={`Preview ${attachment.summary}`}
        className="ef-chat__inspection-preview-button"
        type="button"
        onClick={() => onPreview(source, attachment.summary)}
      >
        <img alt={attachment.summary} src={source} />
      </button>
    </figure>
  );
}

function ChatAttachmentFile({
  attachment,
  downloadAttachment,
}: {
  attachment: ChatMessageAttachment;
  downloadAttachment?: (attachment: ChatMessageAttachment) => Promise<Blob>;
}) {
  const label = attachment.fileName || attachment.title || attachment.summary || attachment.id;
  async function download() {
    if (!downloadAttachment) return;
    try {
      const blob = await downloadAttachment(attachment);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.fileName || attachment.title || attachment.id;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      // The resource can have been deleted together with its chat session.
    }
  }
  return (
    <button
      className="ef-chat__attachment-file"
      disabled={!downloadAttachment}
      title={downloadAttachment ? `Download ${label}` : label}
      type="button"
      onClick={() => { void download(); }}
    >
      <FileText aria-hidden="true" size={15} />
      <span>{label}</span>
      {attachment.byteSize ? <small>{formatByteSize(attachment.byteSize)}</small> : null}
    </button>
  );
}

function AnnotationPreviewItem({
  attachment,
  downloadAttachment,
  onPreview,
}: {
  attachment: ChatMessageAttachment;
  downloadAttachment?: (attachment: ChatMessageAttachment) => Promise<Blob>;
  onPreview: (source: string, alt: string) => void;
}) {
  const source = useAttachmentImageSource(attachment, downloadAttachment);
  const label = attachment.summary || attachment.fileName || attachment.id;

  return (
    <div className="ef-chat__annotation-preview-item">
      {source ? (
        <button
          aria-label={`Preview ${label}`}
          className="ef-chat__annotation-preview-image-button"
          type="button"
          onClick={() => onPreview(source, label)}
        >
          <img alt={label} src={source} />
        </button>
      ) : (
        <div className="ef-chat__annotation-preview-placeholder">
          <FileText aria-hidden="true" size={16} />
        </div>
      )}
      <span title={label}>{label}</span>
    </div>
  );
}

function formatByteSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function ChatAttachments({
  attachments,
  attachmentLabels,
  downloadAttachment,
  formatAnnotationCount,
  onPreviewImage,
}: {
  attachments: ChatMessage["attachments"];
  attachmentLabels: ChatAttachmentLabels;
  downloadAttachment?: (attachment: ChatMessageAttachment) => Promise<Blob>;
  formatAnnotationCount: (count: number) => string;
  onPreviewImage: (source: string, alt: string) => void;
}) {
  const attachmentItems = attachments ?? [];
  const inspectionAttachments = attachmentItems.filter((attachment) => attachment.kind === "inspection");
  const imageAttachments = attachmentItems.filter(isImageAttachment);
  const fileAttachments = attachmentItems.filter((attachment) => !isImageAttachment(attachment));
  const [annotationPreviewOpen, setAnnotationPreviewOpen] = useState(false);
  const annotationPreviewId = useId();

  if (!attachmentItems.length) return null;

  const countLabel = inspectionAttachments.length
    ? formatAnnotationCount(inspectionAttachments.length)
    : attachmentLabels.attachments;

  return (
    <section aria-label={countLabel || attachmentLabels.attachments} className="ef-chat__inspection-attachments">
      <div className="ef-chat__inspection-previews">
        {imageAttachments.map((attachment) => (
          <AttachmentImagePreview
            attachment={attachment}
            downloadAttachment={downloadAttachment}
            key={attachment.id}
            onPreview={onPreviewImage}
          />
        ))}
      </div>
      {fileAttachments.length ? (
        <div className="ef-chat__attachment-files">
          {fileAttachments.map((attachment) => (
            <ChatAttachmentFile
              attachment={attachment}
              downloadAttachment={downloadAttachment}
              key={attachment.id}
            />
          ))}
        </div>
      ) : null}
      {inspectionAttachments.length ? (
        <div
          className="ef-chat__inspection-count-wrap"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setAnnotationPreviewOpen(false);
            }
          }}
          onFocus={() => setAnnotationPreviewOpen(true)}
          onMouseEnter={() => setAnnotationPreviewOpen(true)}
          onMouseLeave={() => setAnnotationPreviewOpen(false)}
        >
          <button
            aria-controls={annotationPreviewId}
            aria-expanded={annotationPreviewOpen}
            aria-label={`${attachmentLabels.annotationPreview}: ${countLabel}`}
            className="ef-chat__inspection-count"
            type="button"
          >
            <MessageSquareText aria-hidden="true" size={16} />
            <span>{countLabel}</span>
          </button>
          {annotationPreviewOpen ? (
            <div
              aria-label={attachmentLabels.annotationPreview}
              className="ef-chat__annotation-preview"
              id={annotationPreviewId}
              role="tooltip"
            >
              <strong>{attachmentLabels.annotationPreview}</strong>
              <div className="ef-chat__annotation-preview-list">
                {inspectionAttachments.map((attachment) => (
                  <AnnotationPreviewItem
                    attachment={attachment}
                    downloadAttachment={downloadAttachment}
                    key={attachment.id}
                    onPreview={onPreviewImage}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ImagePreviewDialog({
  image,
  onClose,
}: {
  image: { alt: string; source: string } | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!image) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [image, onClose]);

  if (!image) return null;
  return (
    <div
      aria-label="Image preview"
      aria-modal="true"
      className="ef-chat__image-preview-dialog"
      role="dialog" data-theme-anchor="dialog"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="ef-chat__image-preview-content">
        <button
          aria-label="Close image preview"
          className="ef-chat__image-preview-close"
          title="Close image preview"
          type="button"
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <img alt={image.alt} src={image.source} />
      </div>
    </div>
  );
}

function CopyValueButton({
  ariaLabel,
  title,
  value,
}: {
  ariaLabel: string;
  title: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  async function handleCopy() {
    if (!value.trim()) return;
    await copyPlainText(value);
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      className="ef-chat__icon-button"
      type="button"
      aria-label={ariaLabel}
      disabled={!value.trim()}
      title={title}
      onClick={() => void handleCopy()}
    >
      {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
    </button>
  );
}

function ChatBubble({
  currentUserDisplayName,
  emptyAssistantMessage = "No assistant response was produced.",
  isStreaming = false,
  message,
  processMessage = false,
  a2uiSession,
  a2uiDisabled,
  onA2UIAction,
  onEditMessage,
}: {
  currentUserDisplayName?: string;
  emptyAssistantMessage?: string;
  isStreaming?: boolean;
  processMessage?: boolean;
  message: ChatMessage;
  a2uiSession?: ChatA2uiSession;
  a2uiDisabled?: boolean;
  onA2UIAction?: ActionHandler;
  onEditMessage?: (content: string, message?: ChatMessage) => void;
}) {
  const isSystemNotice = message.provenance?.sender.kind.toUpperCase() === "SYSTEM";
  const isUser = message.role === "USER" && !isSystemNotice;
  const turnAnnotations = useContext(AnnotationContext);
  const annotationLabels = useContext(AnnotationLabelsContext);
  const missingCitations = isUser ? [] : turnAnnotations.filter(annotation => !message.content.includes(`#chat-annotation-${annotation.id}`));
  const actorName = messageActorName(message, currentUserDisplayName);
  const senderAvatar = messageSenderAvatar(message);
  return (
    <div
      className={cx(
        "ef-chat__message-entry",
        isUser && "ef-chat__message-entry--user",
        processMessage && "ef-chat__message-entry--process",
      )}
    >
      <article
        className={cx("ef-chat__message", isUser && "ef-chat__message--user", isSystemNotice && "ef-chat__message--system", processMessage && "ef-chat__message--process")}
        data-message-id={message.messageId}
        data-theme-anchor="chat-message"
        data-theme-part={isSystemNotice ? "chat-message-system" : isUser ? "chat-message-user" : "chat-message-assistant"}
        data-streaming={isStreaming ? "true" : undefined}
      >
        {!processMessage ? <div className="ef-chat__message-header">
          <div className="ef-chat__message-actor">
            {senderAvatar ? <img src={senderAvatar} alt="" width={16} height={16} /> : messageSenderIsHuman(message) ? <UserRound size={16} /> : <Bot size={16} />}
            <span data-interaction-response-sender={message.interactionResponse ? message.provenance?.sender.kind : undefined}>{actorName}</span>
          </div>
        </div> : null}
        {isUser ? (
          <div className="ef-chat__message-body" data-chat-annotation-source={message.interactionResponse ? undefined : "true"} data-history-interaction-id={message.interactionResponse?.requestId}>
            {message.interactionResponse ? <dl className="ef-chat__interaction-summary">{message.interactionResponse.rows.map((row, index) => <div key={index}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl> : message.content}
          </div>
        ) : (
          <MarkdownBlock
            content={message.content}
            streaming={isStreaming}
            emptyMessage={message.a2ui ? "" : emptyAssistantMessage}
          />
        )}
        {missingCitations.length ? <div className="ef-chat__reply-annotations">{missingCitations.map(annotation => <span key={annotation.id} role="button" data-annotation-source-id={annotation.messageId} tabIndex={0} className="ef-chat__annotation-reference" data-annotation-tooltip={chatAnnotationTooltip(annotation, annotationLabels)}>{annotationLabels.annotation(turnAnnotations.indexOf(annotation) + 1)}</span>)}</div> : null}
        {message.a2ui ? <ChatA2UI message={message} runtime={a2uiSession} disabled={a2uiDisabled} onAction={onA2UIAction} /> : null}
      </article>
      <div className="ef-chat__message-actions ef-chat__message-actions--outside">
        <CopyValueButton
          ariaLabel="Copy raw markdown"
          title="Copy raw markdown"
          value={message.content}
        />
        {isUser && !message.interactionResponse && onEditMessage ? (
          <button
            className="ef-chat__icon-button"
            type="button"
            aria-label="Edit message"
            onClick={() => onEditMessage(message.content, message)}
          >
            <Pencil size={14} />
          </button>
        ) : null}
        {!message.interactionResponse || message.interactionResponse.answeredAt != null ? <span className="ef-chat__message-time">
          {formatTime(message.createdAt)}
        </span> : null}
      </div>
    </div>
  );
}

function formatAguiDuration(milliseconds: number) {
  if (milliseconds < 1000) return "<1s";
  const totalSeconds = Math.max(1, Math.round(milliseconds / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60)
    return seconds ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

const defaultWorkRailLabels = {
  ariaLabel: "Agent work",
  preparing: "Preparing request…",
  responding: "Drafting response…",
  thinking: "Thinking…",
  workedFor: (duration) => `Worked for ${duration}`,
  workingFor: (duration) => `Working for ${duration}`,
  failed: "Run failed",
  notices: {
    mcpUnavailable: "MCP integration unavailable",
    presentationIncomplete: "Presentation replay is incomplete",
    presentationIncompleteDetail: "Some output could not be displayed or saved. The execution result is reported separately.",
    compactionRequested: "Preparing to compact context…",
    compactionStarted: "Compacting context…",
    compactionCompleted: "Context compacted",
    compactionFailed: "Context compaction failed",
    compactionInterrupted: "Run ended before compaction completion was reported",
    toolSchemaOverBudget: "Tool definitions exceed the context budget",
    toolSchemaBudget: (actual, limit, count) => `Tool definitions use about ${actual.toLocaleString()} tokens, exceeding the ${limit.toLocaleString()} limit (${count.toLocaleString()} tools).`,
    toolSchemaBudgetHint: "Reduce exposed tools or increase the Tool Schema budget.",
  } satisfies ChatRunNoticeLabels,
} satisfies ChatWorkRailLabels;

const defaultToolWorkLabels = {
  ariaLabel: "Tool run steps",
  completed: (name: string) => name,
  running: (name: string) => name,
  group: (count: number) => `${count} ${count === 1 ? "tool call" : "tool calls"}`,
  groupSummary: defaultToolActionSummaryLabel,
  statusDone: "done",
  statusRunning: "running",
  parameters: "Parameters",
  result: "Result",
  log: "Log",
  noResult: "No result payload.",
  waitingActivity: "Waiting for tool activity...",
  copyParameters: "Copy parameters",
  copyResult: "Copy result",
  reasoningCaptured: "Reasoning captured.",
  reasoningThinking: "Thinking...",
  reasoningAria: "Thinking",
  emptyReasoning: "No reasoning content was produced.",
  subagentDispatched: (name: string) => name ? `Dispatched ${name} subagent` : "Subagent dispatched",
  // Locale-aware fallback: cards prefer this presenter over the static default.
  resolveName: (runtimeName: string, args: unknown) => toolDisplayName(runtimeName, args),
} satisfies ChatToolWorkLabels;

/** Resolves the card locale from the host locale or the rail label text. */
function resolveToolCardLocale(labels: ChatWorkRailLabels | undefined, locale: string | undefined) {
  return detectToolPresentationLocale(locale, [
    labels?.ariaLabel,
    labels?.thinking,
    labels?.preparing,
    labels?.responding,
  ]);
}

interface TerminalWorkSummary {
  duration: string;
  failed: boolean;
  stopped: boolean;
  runId: string;
}

function hasToolParameterPayload(value: unknown) {
  if (value == null) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return true;
  return true;
}

function toolResultFailed(result: string) {
  if (!result) return false;
  try {
    const parsed: unknown = JSON.parse(result);
    return Boolean(parsed && typeof parsed === "object" && "isError" in parsed && parsed.isError === true);
  } catch {
    return false;
  }
}

function subagentDispatchedLabel(name: string, labels: ChatWorkRailLabels) {
  if (labels.tool?.subagentDispatched) return labels.tool.subagentDispatched(name);
  const chinese = /[\u3400-\u9fff]/.test([labels.ariaLabel, labels.thinking, labels.preparing, labels.responding].join(" "));
  return chinese ? (name ? `已派发 ${name} 子代理` : "已派发子代理") : defaultToolWorkLabels.subagentDispatched(name);
}

function JsonBlock({ value }: { value: unknown }) {
  const preview = formatJsonBlockValue(value);
  if (!preview) return null;
  return <pre className="ef-chat__result-block">{preview}</pre>;
}

function ToolCard({
  card,
  labels = defaultWorkRailLabels,
  nested = false,
  statusLabel,
  statusFailed = false,
  compact = false,
  locale,
}: {
  statusLabel?: string;
  statusFailed?: boolean;
  card: ToolWorkCard;
  labels?: ChatWorkRailLabels;
  nested?: boolean;
  compact?: boolean;
  /** Host language ('zh-CN' | 'en-US' | anything); falls back to label heuristics. */
  locale?: string;
}) {
  const partial = hasPendingBatchItems(card.result);
  const complete = card.ended || (!partial && Boolean(card.result));
  const failed = !partial && (statusFailed || toolResultFailed(card.result));
  const running = card.started && !complete;
  const interactionInfo = interactionToolSummary(card.toolName, card.args);
  const hasParameters = hasToolParameterPayload(card.args);
  const parametersText = hasParameters ? formatJsonBlockValue(card.args) : "";
  const resultText = card.result ? formatJsonBlockValue(card.result) : "";
  const toolCopy = { ...defaultToolWorkLabels, ...labels.tool };
  const presentationLocale = resolveToolCardLocale(labels, locale);
  // A host-provided name still wins unless it only echoes the raw tool id; the
  // presenter parses and appends the subject.
  const hostToolName = labels.tool?.resolveName?.(card.toolName, card.args);
  const toolName = hostToolName
    ? toolCompactLabel(card.toolName, card.args, hostToolName, presentationLocale)
    : toolDisplayName(card.toolName, card.args, undefined, presentationLocale);
  const subagentDispatch = card.toolName.toLowerCase() === "agent_spawn";
  const toolLabel = card.subagentName !== undefined || subagentDispatch && card.toolCallId.startsWith("subagent:")
    ? subagentDispatchedLabel(card.subagentName || "", labels)
    : statusLabel ? toolName : (complete ? toolCopy.completed(toolName) : toolCopy.running(toolName));
  const nestedToolLabel = card.subagentName !== undefined ? toolLabel : toolCompactLabel(card.toolName, card.args, toolName, presentationLocale);
  const [expanded, setExpanded] = useState(false);
  const [parametersExpanded, setParametersExpanded] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (complete) setExpanded(false);
  }, [complete, running]);

  useEffect(() => {
    if (!expanded || complete || !card.logs.length) return;
    const element = logRef.current;
    if (!element) return;
    const frame = window.requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [card.logs.length, complete, expanded]);

  return (
    <div
      className={cx(
        "ef-chat__tool-row",
        !nested && "ef-chat__tool-row--standalone",
      )}
    >
      <button
        className={cx(
          "ef-chat__tool-toggle",
          nested && "ef-chat__tool-toggle--nested",
        )}
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="ef-chat__tool-toggle-main">
          <span
            className={cx(
              "ef-chat__tool-badge",
              nested
                ? cx(
                    "ef-chat__tool-badge--nested",
                    failed && "ef-chat__tool-badge--failed",
                    complete && !failed && "ef-chat__tool-badge--done",
                  )
                : cx(
                    "ef-chat__tool-badge--standalone",
                    failed && "ef-chat__tool-badge--failed",
                    complete && !failed && "ef-chat__tool-badge--done",
                  ),
            )}
          >
            {nested && !complete ? (
              <span className="ef-chat__tool-timeline-dot" aria-hidden="true" />
            ) : failed ? (
              <CircleX size={14} />
            ) : complete ? (
              <CheckCircle2 size={14} />
            ) : running ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Terminal size={14} />
            )}
          </span>
          <span className="ef-chat__tool-toggle-text">
            <span className="ef-chat__tool-title-row">
              <span
                className={cx(
                  "ef-chat__tool-title",
                  nested && "ef-chat__tool-title--nested",
                )}
              >
                {nested || compact && nestedToolLabel !== toolName ? nestedToolLabel : toolLabel}
              </span>
              {nested ? null : complete || failed || subagentDispatch ? null : (
                <span
                  className={cx(
                    "ef-chat__tool-status",
                    "ef-chat__tool-status--running",
                  )}
                >
                  {statusLabel ?? toolCopy.statusRunning}
                </span>
              )}
            </span>
          </span>
        </span>
        <span className="ef-chat__tool-chevron">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {expanded ? (
        <div
          className={cx(
            "ef-chat__tool-body",
            nested
              ? "ef-chat__tool-body--nested"
              : "ef-chat__tool-body--standalone",
          )}
        >
          <div className="ef-chat__tool-sections">
            {interactionInfo !== null ? <p>{interactionInfo.join(" · ") || toolName}</p> : <>
            {hasParameters ? (
              <section>
                <div
                  className="ef-chat__tool-section-header"
                  style={{ marginBottom: parametersExpanded ? 8 : 0 }}
                >
                  <button
                    className="ef-chat__tool-subtoggle"
                    type="button"
                    aria-expanded={parametersExpanded}
                    onClick={() => setParametersExpanded((value) => !value)}
                  >
                    <span className="ef-chat__tool-subtoggle-label">
                      {parametersExpanded ? (
                        <ChevronDown size={13} />
                      ) : (
                        <ChevronRight size={13} />
                      )}
                      <span>{toolCopy.parameters}</span>
                    </span>
                  </button>
                  <CopyValueButton
                    ariaLabel={toolCopy.copyParameters}
                    title={toolCopy.copyParameters}
                    value={parametersText}
                  />
                </div>
                {parametersExpanded ? <JsonBlock value={card.args} /> : null}
              </section>
            ) : null}
            {complete || partial ? (
              <section>
                <div
                  className="ef-chat__tool-section-header"
                  style={{ marginBottom: 8 }}
                >
                  <h3 className="ef-chat__tool-section-title">{toolCopy.result}</h3>
                  <CopyValueButton
                    ariaLabel={toolCopy.copyResult}
                    title={toolCopy.copyResult}
                    value={resultText}
                  />
                </div>
                {card.result ? (
                  <ToolResultView value={card.result} locale={locale} />
                ) : (
                  <div className="ef-chat__result-block">
                    {toolCopy.noResult}
                  </div>
                )}
              </section>
            ) : (
              <section>
                <h3
                  className="ef-chat__tool-section-title"
                  style={{ marginBottom: 8 }}
                >
                  {toolCopy.log}
                </h3>
                <div
                  ref={logRef}
                  className="ef-chat__code-block max-h-64"
                  style={{ maxHeight: 256, overflowY: "auto" }}
                >
                  {card.logs.length ? (
                    card.logs.map((line, index) => (
                      <p
                        key={`${card.id}-log-${index}`}
                        style={{ margin: 0, whiteSpace: "pre-wrap" }}
                      >
                        {line}
                      </p>
                    ))
                  ) : (
                    <p style={{ margin: 0 }}>{toolCopy.waitingActivity}</p>
                  )}
                </div>
              </section>
            )}</>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToolGroupCard({ card, labels = defaultWorkRailLabels, statusLabels, failedStatuses, locale, autoExpanded = false }: { card: ToolGroupWorkCard; labels?: ChatWorkRailLabels; statusLabels?: Record<string, string>; failedStatuses?: Record<string, boolean>; locale?: string; autoExpanded?: boolean }) {
  const toolCopy = { ...defaultToolWorkLabels, ...labels.tool };
  const toolCards = card.toolCards.filter((toolCard) => toolCard.started);
  const [expanded, setExpanded] = useState(autoExpanded);

  useEffect(() => {
    setExpanded(autoExpanded);
  }, [autoExpanded]);

  if (!toolCards.length) return null;
  // A phase is not necessarily a group: one invocation (even a batch) is one card.
  if (toolCards.length === 1) {
    const tool = toolCards[0]!;
    return <ToolCard card={tool} labels={labels} locale={locale}
      statusLabel={statusLabels?.[tool.id]} statusFailed={failedStatuses?.[tool.id]} />;
  }
  const hasRunningTool = toolCards.some(
    (toolCard) => toolCard.started && !toolCard.ended && !toolCard.result,
  );
  const summary = toolCopy.groupSummary?.(summarizeToolActions(toolCards))
    ?? defaultToolActionSummaryLabel(summarizeToolActions(toolCards));

  return (
    <section className="ef-chat__rail-entry" aria-label={toolCopy.ariaLabel}>
      <button
        className="ef-chat__rail-entry-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="ef-chat__rail-entry-main">
          <span className="ef-chat__rail-entry-icon">
            <Terminal
              size={15}
              className={hasRunningTool ? "animate-pulse" : undefined}
            />
          </span>
          <span className="ef-chat__rail-entry-summary ef-chat__rail-entry-summary--strong">
            {summary}
          </span>
        </span>
        <span className="ef-chat__rail-entry-chevron">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {expanded ? (
        <ol className="ef-chat__rail-entry-list">
          {toolCards.map((toolCard) => (
            <li key={toolCard.id}>
            <ToolCard card={toolCard} labels={labels} nested locale={locale} statusLabel={statusLabels?.[toolCard.id]} statusFailed={failedStatuses?.[toolCard.id]} />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function ReasoningCard({
  card,
  labels = defaultWorkRailLabels,
  unfolded = false,
}: {
  card: Extract<AguiUserWorkCard, { kind: "reasoning" }>["value"];
  labels?: ChatWorkRailLabels;
  unfolded?: boolean;
}) {
  const toolCopy = { ...defaultToolWorkLabels, ...labels.tool };
  const hasRunningTool = card.toolCards.some(
    (toolCard) => toolCard.started && !toolCard.ended && !toolCard.result,
  );
  const summary =
    summarizeReasoning(card) ||
    (card.ended ? toolCopy.reasoningCaptured : toolCopy.reasoningThinking);
  const detail = card.summary;
  const [expanded, setExpanded] = useState(false);

  if (unfolded) return <section className="ef-chat__rail-entry" aria-label={toolCopy.reasoningAria}>
    <div className="ef-chat__rail-entry-main ef-chat__reasoning-inline">
      <BrainCircuit size={15} className={card.ended ? undefined : "animate-pulse"} />
      <div className="ef-chat__rail-detail"><MarkdownBlock content={detail || summary} emptyMessage={toolCopy.emptyReasoning} streaming={!card.ended} /></div>
    </div>
  </section>;

  return (
    <section className="ef-chat__rail-entry" aria-label={toolCopy.reasoningAria}>
      <button
        className="ef-chat__rail-entry-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="ef-chat__rail-entry-main">
          <span className="ef-chat__rail-entry-icon">
            <BrainCircuit
              size={15}
              className={card.ended ? undefined : "animate-pulse"}
            />
          </span>
          <span
            className={cx(
              "ef-chat__rail-entry-summary",
              !card.ended && "ef-chat__rail-entry-summary--pending",
            )}
          >
            {summary}
          </span>
        </span>
        <span className="ef-chat__rail-entry-chevron">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {expanded ? (
        <div className="ef-chat__rail-entry-body">
          {detail ? (
            <div className="ef-chat__rail-detail">
              <MarkdownBlock
                content={detail}
                emptyMessage={toolCopy.emptyReasoning}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function RunErrorDetails({ raw, fallback }: { raw: string; fallback: string }) {
  const error = chatErrorPresentation(raw, fallback);
  return <><div className="ef-chat__run-notice-detail">{error.summary}</div>
    {error.details ? <details className="ef-chat__error-details"><summary>{/[\u3400-\u9fff]/.test(fallback) ? "错误详情" : "Error details"}</summary><pre>{error.details}</pre></details> : null}</>;
}

function AguiRunStatus({ notices, labels }: { notices: AguiRunNotice[]; labels: ChatWorkRailLabels }) {
  const copy = { ...defaultWorkRailLabels.notices, ...labels.notices };
  return notices.map((notice) => {
    let pending = false;
    let failed = false;
    let title: string;
    let detail = "";
    let hint = "";
    let Icon = CircleAlert;
    if (notice.kind === "compaction") {
      pending = notice.status === "requested" || notice.status === "started";
      failed = notice.status === "failed";
      title = {
        requested: copy.compactionRequested,
        started: copy.compactionStarted,
        completed: copy.compactionCompleted,
        failed: copy.compactionFailed,
        interrupted: copy.compactionInterrupted,
      }[notice.status];
      detail = notice.code;
      if (pending) Icon = LoaderCircle;
      if (notice.status === "completed") Icon = CheckCircle2;
    } else if (notice.kind === "integrationWarning") {
      title = copy.mcpUnavailable;
      detail = notice.message || notice.code;
    } else if (notice.kind === "runStopped") {
      title = labels.stopped ?? "Run stopped";
      detail = notice.message;
      Icon = Square;
    } else {
      failed = true;
      title = labels.failed ?? defaultWorkRailLabels.failed;
      detail = notice.message || notice.code;
      if (notice.code === "AGENT_AGUI_REPLAY_INCOMPLETE") {
        title = copy.presentationIncomplete;
        detail = copy.presentationIncompleteDetail;
      } else if (notice.code.toLowerCase() === "tool_schema_over_budget") {
        title = copy.toolSchemaOverBudget;
        const budget = notice.toolSchemaBudget;
        detail = budget ? copy.toolSchemaBudget(budget.estimatedTokens, budget.limitTokens, budget.toolCount) : "";
        hint = copy.toolSchemaBudgetHint;
      }
    }
    return (
      <div
        className={cx("ef-chat__run-notice", failed && "ef-chat__run-notice--error")}
        role={failed ? "alert" : "status"}
        aria-atomic="true"
        key={notice.kind === "integrationWarning" ? notice.id : notice.kind === "runError" || notice.kind === "runStopped" ? notice.kind + ":" + notice.code : notice.kind}
      >
        <Icon size={16} aria-hidden="true" className={pending ? "animate-spin" : undefined} />
        <div className="ef-chat__run-notice-content">
          <div className="ef-chat__run-notice-title">{title}</div>
          {detail ? <RunErrorDetails raw={detail} fallback={labels.failed ?? "Run failed"} /> : null}
          {hint ? <div className="ef-chat__run-notice-detail">{hint}</div> : null}
        </div>
      </div>
    );
  });
}

function StructuredMessageDetails({ message, workOnly = false, showReasoningCards = true, labels, hasRunError = false, historyLabels = defaultHistoryLabels, locale }: { workOnly?: boolean; showReasoningCards?: boolean; hasRunError?: boolean; message: ChatMessage; labels?: ChatWorkRailLabels; historyLabels?: ChatHistoryLabels; locale?: string }) {
  const view = message.history;
  if (!view) return null;
  const reasoning = view.message.content.filter((b) => b.type === "Reasoning").map((b) => "text" in b ? b.text : "").join("");
  const blocks = view.message.content.filter((b) => b.type === "Json" || b.type === "Media" || b.type === "Resource");
  const showError = !workOnly && message.role === "ASSISTANT" && !!view.run?.error && !hasRunError;
  // Empty history sections are flex children: each one used to add another
  // transcript gap after tool-only steps, pushing the pending question away.
  if (workOnly ? (!showReasoningCards || !reasoning.trim()) && !view.tools.length : !blocks.length && view.message.structured == null && !showError) return null;
  return <section className="ef-chat__history-details" data-history-message-id={message.messageId}>
    {workOnly && showReasoningCards && reasoning ? <ReasoningCard labels={labels} card={{ id: `${message.messageId}:reasoning`, runId: message.runId ?? "", content: reasoning, summary: reasoning,
      ended: view.message.status !== "Running", firstMillis: view.message.createdAtMs, endMillis: view.step?.finishedAtMs ?? null, toolCards: [] }} /> : null}
    {!workOnly && blocks.map((block, index) => <div key={index}>
      {block.type === "Json" ? <pre>{JSON.stringify(block.value, null, 2)}</pre> : block.type === "Media" && block.mimeType.startsWith("image/") && historyBlockUrl(block) ? <img src={historyBlockUrl(block)!} alt={block.name ?? block.mimeType} loading="lazy" /> : block.type === "Media" || block.type === "Resource" ? historyBlockUrl(block) ? <a href={historyBlockUrl(block)!} target="_blank" rel="noreferrer">{block.name ?? (block.type === "Resource" ? block.uri : block.mimeType)}</a> : <code>{block.name ?? (block.type === "Resource" ? block.uri : block.mimeType)}</code> : null}
    </div>)}
    {!workOnly && view.message.structured != null ? <pre>{JSON.stringify(view.message.structured, null, 2)}</pre> : null}
    {workOnly && view.tools.map((tool) => <div key={tool.id} data-tool-invocation-id={tool.id}>
      <ToolCard labels={labels} locale={locale} statusLabel={historyLabels.statuses[tool.status]} card={{ id: tool.id, runId: tool.runId, toolCallId: tool.id, toolName: tool.toolName, args: tool.arguments,
        result: historyToolResult(tool), logs: [], parentReasoningId: null, firstMillis: tool.startedAtMs ?? view.message.createdAtMs,
        started: tool.status === "Running", ended: ["Completed", "Failed"].includes(tool.status) }} />
    </div>)}
    {showError ? <RunErrorDetails raw={view.run!.error!} fallback={labels?.failed ?? historyLabels.statuses.Failed} /> : null}
  </section>;
}

function HistoryWorkRail({ messages, labels = defaultWorkRailLabels, historyLabels, showReasoningCards = true, locale }: { messages: ChatMessage[]; labels?: ChatWorkRailLabels; historyLabels: ChatHistoryLabels; showReasoningCards?: boolean; locale?: string }) {
  const completed = historyWorkCompleted(messages);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (completed) setExpanded(false); }, [completed]);
  const runs = messages.flatMap(message => message.history?.run ? [message.history.run] : []);
  const starts = runs.map(run => run.startedAtMs);
  const ends = runs.flatMap(run => run.finishedAtMs == null ? [] : [run.finishedAtMs]);
  const duration = formatAguiDuration(starts.length && ends.length ? Math.max(...ends) - Math.min(...starts) : 0);
  const failed = runs.some(run => run.status === "Failed");
  const interrupted = !failed && runs.some(run => run.status === "Interrupted");
  const statusNotice = failed ? historyLabels.statuses.Failed : interrupted ? historyLabels.statuses.Interrupted : null;
  const summary = completed ? labels.workedFor(duration) : labels.workingFor(duration);
  return <section className="ef-chat__rail" aria-label={labels.ariaLabel} data-history-work>
    <button className="ef-chat__rail-summary" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{summary}{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
    {statusNotice ? <div className={cx("ef-chat__run-notice", failed && "ef-chat__run-notice--error")} role={failed ? "alert" : "status"}>
      {failed ? <CircleAlert aria-hidden="true" size={16} /> : <CircleX aria-hidden="true" size={16} />}
      <div className="ef-chat__run-notice-content"><div className="ef-chat__run-notice-title">{statusNotice}</div></div>
    </div> : null}
    {expanded ? <div className="ef-chat__rail-stack">{messages.map(message => <StructuredMessageDetails key={message.messageId} message={message} workOnly showReasoningCards={showReasoningCards} labels={labels} historyLabels={historyLabels} locale={locale} />)}</div> : null}
  </section>;
}

function AguiRunWorkRail({
  historyCovered = false,
  debugEvents,
  events,
  labels = defaultWorkRailLabels,
  messageId,
  userInputRequests = [],
  timeline,
  renderMessage,
  historyLabels = defaultHistoryLabels,
  showReasoningCards = true,
  locale,
}: {
  historyCovered?: boolean;
  debugEvents: string[];
  events: ChatAguiStreamEvent[];
  labels?: ChatWorkRailLabels;
  messageId?: string;
  userInputRequests?: ChatUserInputRequest[];
  timeline?: TranscriptWorkRun;
  renderMessage?: (message: ChatMessage) => ReactNode;
  historyLabels?: ChatHistoryLabels;
  showReasoningCards?: boolean;
  locale?: string;
}) {
  const notices = useMemo(() => {
    const notices = buildAguiRunNotices(events);
    const error = timeline?.messages.find(message => message.history?.run?.error)?.history?.run?.error;
    if (error && !notices.some(notice => notice.kind === "runError" && notice.code !== "AGENT_AGUI_REPLAY_INCOMPLETE"))
      notices.push({ kind: "runError", code: "HISTORY_RUN_ERROR", message: error });
    return notices;
  }, [events, timeline]);
  const userCards = useMemo<AguiUserWorkCard[]>(() => buildAguiUserWorkCards(events)
    .filter(card => showReasoningCards || card.kind !== "reasoning"), [events, showReasoningCards]);
  const visibleTimelineItems = useMemo(() => timeline?.items.filter(item => showReasoningCards || item.kind !== "reasoning") ?? [], [timeline, showReasoningCards]);
  const matchingUserInputRequests = useMemo(() => {
    const runCodes = new Set(events.map((event) => aguiEventRunId(event)));
    return userInputRequests.filter((request) => (
      runCodes.has(request.runId) || request.assistantMessageId === messageId
    ));
  }, [events, messageId, userInputRequests]);
  const orderedWorkItems = useMemo(() => [
    ...userCards.map((card) => ({
      firstMillis: card.value.firstMillis,
      kind: "agui" as const,
      card,
    })),
  ].sort((left, right) => left.firstMillis - right.firstMillis), [
    userCards,
  ]);
  const pendingUserInputRequest = matchingUserInputRequests.find(
    (request) => request.status === "Pending",
  );
  const reasoningEffort = useMemo(() => aguiReasoningEffort(events), [events]);
  const terminalEvent = useMemo(() => currentAguiTerminalEvent(events), [events]);
  const terminalSummary = useMemo<TerminalWorkSummary | null>(() => {
    if (!terminalEvent) return null;
    // A cancellation must not mask another run's execution failure in this rail.
    const stopped = isAguiCancellationEvent(terminalEvent)
      && !notices.some((notice) => notice.kind === "runError" && notice.code !== "AGENT_AGUI_REPLAY_INCOMPLETE");
    return {
      duration: formatAguiDuration(aguiWorkElapsedMilliseconds(events)),
      failed: String(terminalEvent.type).toUpperCase() === "RUN_ERROR" && !stopped,
      stopped,
      runId: aguiEventRunId(terminalEvent),
    };
  }, [events, notices, terminalEvent]);
  const displayedTerminalSummary = terminalSummary;
  const completed = timeline?.completed ?? (historyCovered || Boolean(displayedTerminalSummary) && !pendingUserInputRequest);
  const [expanded, setExpanded] = useState(!completed);
  const [now, setNow] = useState(() => Date.now());
  const duration = timeline ? formatAguiDuration(workTimelineElapsedMilliseconds(timeline, now)) : completed
    ? displayedTerminalSummary?.duration ?? "<1s"
    : formatAguiDuration(aguiWorkElapsedMilliseconds(events, now));
  useEffect(() => {
    if (completed) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [completed]);

  useEffect(() => {
    setExpanded(!completed);
  }, [completed]);

  if (!timeline && historyCovered && !debugEvents.length) return notices.length
    ? <section className="ef-chat__rail" aria-label={labels.ariaLabel}><AguiRunStatus notices={notices} labels={labels} /></section> : null;

  if (!timeline && !displayedTerminalSummary && !events.length && !orderedWorkItems.length && !debugEvents.length)
    return null;
  const onlyPresentationHealth = notices.length > 0 && !displayedTerminalSummary
    && events.every((event) => event.type === "CUSTOM" && event.name === "agent.presentation.incomplete");
  if (onlyPresentationHealth) {
    return <section className="ef-chat__rail" aria-label={labels.ariaLabel}><AguiRunStatus notices={notices} labels={labels} /></section>;
  }
  const hasDetails = (timeline ? visibleTimelineItems.length > 0 : orderedWorkItems.length > 0) || debugEvents.length > 0;
  const historyFailure = !timeline?.events.length && timeline?.messages.some(message => message.history?.run?.status === "Failed");
  const historyInterrupted = !historyFailure && !timeline?.events.length
    && timeline?.messages.some(message => message.history?.run?.status === "Interrupted");
  const historyStatusNotice = historyFailure ? historyLabels.statuses.Failed
    : historyInterrupted ? historyLabels.statuses.Interrupted : null;
  const presentationClosedWithoutOutcome = !displayedTerminalSummary && events.some(isAguiPresentationFailureEvent);
  const summary = completed
    ? labels.workedFor(duration)
    : labels.workingFor(duration);
  const summaryContent = (
    <span className="ef-chat__rail-summary-label">
      <span>{summary}</span>
      {reasoningEffort ? <span>{` · ${reasoningEffort}`}</span> : null}
    </span>
  );
  return (
    <section className="ef-chat__rail" aria-label={labels.ariaLabel}>
      {hasDetails ? (
        <button
          className="ef-chat__rail-summary"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {summaryContent}
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      ) : <div className="ef-chat__rail-summary ef-chat__rail-summary--static">{summaryContent}</div>}
      <AguiRunStatus notices={notices} labels={labels} />
      {historyStatusNotice ? <div className={cx("ef-chat__run-notice", historyFailure && "ef-chat__run-notice--error")} role={historyFailure ? "alert" : "status"}>
        {historyFailure ? <CircleAlert aria-hidden="true" size={16} /> : <CircleX aria-hidden="true" size={16} />}
        <div className="ef-chat__run-notice-content"><div className="ef-chat__run-notice-title">{historyStatusNotice}</div></div>
      </div> : null}
      {expanded && hasDetails ? (
        <div
          className="ef-chat__rail-stack"
          style={{ marginTop: 8 }}
        >
          {timeline ? <section className="ef-chat__rail" aria-label="Agent work rail" style={{ maxWidth: "none", paddingLeft: 0 }}>
            <div className="ef-chat__rail-card-list">{visibleTimelineItems.map(item => <div key={item.id} data-work-item={item.kind} data-work-item-id={item.id}>
              {item.kind === "message" ? renderMessage?.(item.message) : item.kind === "reasoning"
                ? <ReasoningCard card={item.value} labels={labels} />
                : item.kind === "toolGroup"
                  ? <ToolGroupCard card={item.value} autoExpanded={!completed && item.value.isCurrentPhase === true} labels={labels} locale={locale} statusLabels={item.historyStatuses ? Object.fromEntries(Object.entries(item.historyStatuses).map(([id, status]) => [id, historyLabels.statuses[status]])) : undefined} failedStatuses={item.historyStatuses ? Object.fromEntries(Object.entries(item.historyStatuses).map(([id, status]) => [id, status === "Failed"])) : undefined} />
                  : <ToolCard card={item.value} labels={labels} locale={locale} compact statusLabel={item.historyStatus ? historyLabels.statuses[item.historyStatus] : undefined} statusFailed={item.historyStatus === "Failed"} />}
            </div>)}</div>
          </section> : orderedWorkItems.length ? (
            <section
              className="ef-chat__rail"
              aria-label="Agent work rail"
              style={{ maxWidth: "none", paddingLeft: 0 }}
            >
              <div className="ef-chat__rail-card-list">
                {orderedWorkItems.map((item) => item.card.kind === "reasoning" ? (
                  <ReasoningCard card={item.card.value} key={item.card.value.id} labels={labels} />
                ) : item.card.kind === "toolGroup" ? (
                  <ToolGroupCard card={item.card.value} autoExpanded={!completed && item.card.value.isCurrentPhase === true} key={item.card.value.id} labels={labels} locale={locale} />
                ) : (
                  <ToolCard card={item.card.value} key={item.card.value.id} labels={labels} locale={locale} />
                ))}
              </div>
            </section>
          ) : null}
          {debugEvents.length ? (
            <section
              className="ef-chat__rail"
              aria-label="AG-UI debug event cards"
              style={{ maxWidth: "none", paddingLeft: 0 }}
            >
              <div className="ef-chat__debug-list">
                {debugEvents.map((event, index) => (
                  <div
                    className="ef-chat__debug-item"
                    key={`${event}-${index}`}
                  >
                    <div className="ef-chat__debug-summary">{event}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
      {!completed && !presentationClosedWithoutOutcome ? <div className="ef-chat__rail-current ef-chat__rail-current--working" role="status">
        <Bot className="ef-chat__rail-current-icon" size={15} aria-hidden="true" />
        <span className="ef-chat__rail-current-text">{labels.working ?? (/^[\u3400-\u9fff]/.test(labels.thinking) ? "工作中" : "Working")}</span>
      </div> : null}
    </section>
  );
}

function WaitingRail({ labels = defaultWorkRailLabels }: { labels?: ChatWorkRailLabels }) {
  return (
    <section className="ef-chat__rail" aria-label={labels.ariaLabel}>
      <div className="ef-chat__waiting">
        <span className="ef-chat__waiting-line" />
        <span className="ef-chat__rail-toggle-label">
          <LoaderCircle size={14} className="animate-spin" />
          <span>{labels.preparing}</span>
        </span>
        <span className="ef-chat__waiting-line" />
      </div>
    </section>
  );
}

export interface ChatPanelProps extends Pick<ComposerReactProps, "pendingAttachments" | "showAttachmentControl" | "attachmentUploadPending" | "onAttachFile" | "onRemoveAttachment" | "attachLabel" | "uploadingLabel" | "removeAttachmentLabel" | "editQueuedLabel" | "removeQueuedLabel"> {
  pendingAnnotations?: ChatAnnotation[];
  onPendingAnnotationsChange?: (annotations: ChatAnnotation[]) => void;
  annotationLabels?: ChatAnnotationLabels;
  /** Show the composer before a persisted session exists. */
  allowDraftSession?: boolean;
  attachmentDownloader?: (attachment: ChatMessageAttachment) => Promise<Blob>;
  attachmentLabels?: ChatAttachmentLabels;
  autoFocusComposer?: boolean;
  createSessionLabel?: string;
  currentUserDisplayName?: string;
  composerRef?: Ref<HTMLTextAreaElement>;
  debugOptions?: ChatDebugOptions;
  disabledInput?: boolean;
  draft: string;
  composerHeader?: ReactNode;
  emptyDescription?: string;
  emptyTitle?: string;
  footerAddon?: ReactNode;
  formatAnnotationCount?: (count: number) => string;
  headerContent?: ReactNode;
  inputPlaceholder?: string;
  inputSuggestions?: ChatInputSuggestion[];
  skillSuggestionTriggers?: Array<"$" | "/">;
  inputSuggestionLabels?: ChatInputSuggestionLabels;
  queuedInputPlaceholder?: string;
  steeringInputPlaceholder?: string;
  liveAguiAnchorMessageCodes?: Record<string, string>;
  liveAguiEvents?: ChatAguiStreamEvent[];
  liveAguiPendingAnchorMessageCode?: string;
  liveAguiPending?: boolean;
  /** Host language for tool card titles ('zh-CN' | 'en-US' | anything). */
  locale?: string;
  messages: ChatMessage[];
  historyLoading?: boolean;
  historyLoadingOlder?: boolean;
  historyLabels?: ChatHistoryLabels;
  onLoadOlderHistory?: () => void;
  onCreateSession?: () => void;
  onNewSession?: () => void;
  onDraftChange: (value: string) => void;
  onPasteAttachment?: (file: File) => void | Promise<void>;
  a2uiSession?: ChatA2uiSession;
  a2uiDisabled?: boolean;
  onA2UIAction?: ActionHandler;
  onEditMessage?: (content: string, message?: ChatMessage) => void;
  onEditQueuedMessage?: (id: string, content: string) => void;
  onRemoveQueuedMessage?: (id: string) => void;
  onSteerQueuedMessage?: (id: string) => void;
  onReorderQueuedMessage?: (sourceId: string, targetId: string) => void;
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
  /** Read-only transcripts reuse the same work rail without an input composer. */
  showComposer?: boolean;
  showHistoryRail?: boolean;
  showStop?: boolean;
  sidebarContent?: ReactNode;
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
  renderMarkdownLink?: ChatMarkdownLinkRenderer;
}

export function ChatPanel({
  pendingAttachments, showAttachmentControl, attachmentUploadPending, onAttachFile, onRemoveAttachment, attachLabel, uploadingLabel, removeAttachmentLabel, editQueuedLabel, removeQueuedLabel,
  pendingAnnotations: controlledPendingAnnotations,
  onPendingAnnotationsChange,
  annotationLabels = defaultChatAnnotationLabels,
  allowDraftSession = false,
  attachmentDownloader,
  attachmentLabels = defaultAttachmentLabels,
  autoFocusComposer = false,
  createSessionLabel = "Create session",
  currentUserDisplayName,
  composerRef,
  debugOptions,
  disabledInput = false,
  draft,
  composerHeader,
  emptyDescription = "Create a session to start chatting.",
  emptyTitle = "No session selected",
  footerAddon,
  formatAnnotationCount = defaultFormatAnnotationCount,
  headerContent,
  inputPlaceholder = "Enter to send, Shift+Enter for newline",
  inputSuggestions = [],
  skillSuggestionTriggers,
  inputSuggestionLabels = { commands: "Commands", skills: "Skills", commandsAndSkills: "Commands and skills" },
  queuedInputPlaceholder = "Enter to queue · Shift+Enter for newline",
  steeringInputPlaceholder = "Enter to queue · ⌘/Ctrl+Enter to steer · Shift+Enter for newline",
  liveAguiAnchorMessageCodes,
  liveAguiEvents,
  liveAguiPendingAnchorMessageCode,
  liveAguiPending,
  locale,
  messages,
  historyLoading = false,
  historyLoadingOlder = false,
  historyLabels = defaultHistoryLabels,
  onLoadOlderHistory,
  onCreateSession,
  onNewSession,
  onDraftChange,
  onPasteAttachment,
  a2uiSession,
  a2uiDisabled,
  onA2UIAction,
  onEditMessage,
  onEditQueuedMessage,
  onRemoveQueuedMessage,
  onSteerQueuedMessage,
  onReorderQueuedMessage,
  onSend,
  onStop,
  protocolEvents,
  queueDisabled = false,
  queuedLabel = "Queued",
  queuedMessages = [],
  runningSubmitModes = [],
  runningEnterSubmitMode = "queue",
  sendDisabled,
  sendLabel = "Send",
  sending = false,
  streamingAssistantMessageCode: activeStreamingAssistantMessageCode,
  session,
  showAgui = true,
  showReasoningCards = true,
  showHeader = true,
  showComposer = true,
  showHistoryRail = true,
  showStop = true,
  sidebarContent,
  steerDisabled = false,
  queuedSteerDisabled = false,
  stopLabel = "Stop",
  title,
  userInputLabels,
  workRailLabels,
  userInputRequests = [],
  userInputRequest,
  userInputAnswerPending = false,
  onAnswerUserInput,
  renderMarkdownLink,
}: ChatPanelProps) {
  const [internalAnnotations, setInternalAnnotations] = useState<ChatAnnotation[]>([]);
  const annotations = controlledPendingAnnotations ?? internalAnnotations;
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const changeAnnotationsRef = useRef((next: ChatAnnotation[]) => {});
  changeAnnotationsRef.current = next => {
    annotationsRef.current = next;
    if (controlledPendingAnnotations === undefined) setInternalAnnotations(next);
    onPendingAnnotationsChange?.(next);
  };
  const annotationDraft = { content: draft, annotations };
  const annotationEditorRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    setInternalAnnotations([]);
    return () => { annotationEditorRef.current?.(); };
  }, [session?.sessionId]);
  useEffect(() => () => { annotationEditorRef.current?.(); }, [session?.status, disabledInput]);
  function editPendingAnnotation(annotation: ChatAnnotation, anchor: HTMLElement) {
    annotationEditorRef.current?.();
    annotationEditorRef.current = openChatAnnotationEditor(anchor, annotation, updated => {
      changeAnnotationsRef.current(annotationsRef.current.map(item => item.id === updated.id ? updated : item));
    }, annotationLabels);
  }
  const annotationMap = useMemo(() => chatAnnotationsByMessage(messages), [messages]);
  const annotationRootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => annotationRootRef.current ? mountChatAnnotationPreviews(annotationRootRef.current) : undefined, []);
  const transcriptRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!transcriptRef.current || disabledInput || session?.status === "ARCHIVED") return;
    return mountChatAnnotationSelection(transcriptRef.current, annotation => {
      changeAnnotationsRef.current([...annotationsRef.current, annotation]);
    }, annotationLabels);
  }, [session?.sessionId, session?.status, disabledInput, annotationLabels, allowDraftSession]);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ alt: string; source: string } | null>(null);
  const autoStickToBottomRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const streamingAssistantMessageCode = useMemo(() => {
    if (activeStreamingAssistantMessageCode !== undefined) {
      return activeStreamingAssistantMessageCode || undefined;
    }
    if (!sending) return undefined;
    const latestMessage = messages[messages.length - 1];
    return latestMessage?.role === "ASSISTANT" ? latestMessage.messageId : undefined;
  }, [activeStreamingAssistantMessageCode, messages, sending]);
  const transcriptMessages = useMemo(
    () => interactionMessages(messages, userInputRequests, workRailLabels).filter((message) => (
      message.messageId !== streamingAssistantMessageCode || message.content.trim().length > 0 || !!message.a2ui
    )),
    [messages, userInputRequests, workRailLabels, streamingAssistantMessageCode],
  );
  const historyWork = useMemo(() => historyWorkGroups(transcriptMessages), [transcriptMessages]);
  const lastHistoryErrorByRun = useMemo(() => new Map(transcriptMessages
    .filter(message => message.role === "ASSISTANT" && message.history?.run?.error)
    .map(message => [message.runId, message.messageId])), [transcriptMessages]);
  const displayedErrorRuns = useMemo(() => {
    const runs = new Set<string>();
    if (showAgui) for (const event of [...(protocolEvents ?? []), ...(liveAguiEvents ?? [])]) {
      if (event.type !== "RUN_ERROR" || isAguiPresentationFailureEvent(event)) continue;
      if (event.runId) runs.add(event.runId);
      runs.add(historyEventRunId(event));
    }
    return runs;
  }, [showAgui, protocolEvents, liveAguiEvents]);
  const presentation = useMemo(
    () =>
      buildTranscriptPresentation({
        debugOptions,
        liveAguiAnchorMessageCodes,
        liveAguiEvents,
        liveAguiPendingAnchorMessageCode,
        liveAguiPending,
        messages: transcriptMessages,
        protocolEvents,
        sessionId: session?.sessionId ?? "",
      }),
    [
      debugOptions,
      liveAguiAnchorMessageCodes,
      liveAguiEvents,
      liveAguiPendingAnchorMessageCode,
      liveAguiPending,
      transcriptMessages,
      protocolEvents,
      session?.sessionId,
    ],
  );
  const historyTurns = useMemo(
    () => buildChatHistoryTurns(transcriptMessages, presentation),
    [transcriptMessages, presentation],
  );
  const workTimeline = useMemo(() => buildTranscriptWorkTimeline(transcriptMessages, presentation, userInputRequests, { showReasoningCards }),
    [transcriptMessages, presentation, userInputRequests, showReasoningCards]);
  const turnByMessageCode = useMemo(() => {
    const next = new Map<string, string>();
    historyTurns.forEach((turn) => {
      turn.messageCodes.forEach((messageId) => {
        next.set(messageId, turn.id);
      });
    });
    return next;
  }, [historyTurns]);
  const messagesByTurnId = useMemo(() => {
    const next = new Map<string, ChatMessage[]>();
    historyTurns.forEach((turn) => {
      next.set(turn.id, []);
    });
    transcriptMessages.forEach((message) => {
      const turnId = turnByMessageCode.get(message.messageId);
      if (!turnId) return;
      const bucket = next.get(turnId);
      if (!bucket) return;
      bucket.push(message);
    });
    return next;
  }, [historyTurns, transcriptMessages, turnByMessageCode]);

  function renderProcessMessage(message: ChatMessage) {
    return <>
      <StructuredMessageDetails message={message} labels={workRailLabels} historyLabels={historyLabels} locale={locale} hasRunError={workTimeline.managedMessageIds.has(message.messageId) || displayedErrorRuns.has(message.runId ?? "") || lastHistoryErrorByRun.get(message.runId) !== message.messageId} />
      {message.content.trim() || message.a2ui ? <ChatBubble currentUserDisplayName={currentUserDisplayName} processMessage
        isStreaming={message.messageId === streamingAssistantMessageCode} message={message} a2uiSession={a2uiSession}
        a2uiDisabled={a2uiDisabled} onA2UIAction={onA2UIAction} onEditMessage={onEditMessage} /> : null}
    </>;
  }
  function renderWorkRun(run: TranscriptWorkRun) {
    return <AguiRunWorkRail key={run.id} timeline={run} renderMessage={renderProcessMessage} historyLabels={historyLabels}
      showReasoningCards={showReasoningCards} locale={locale}
      events={run.events as ChatAguiStreamEvent[]} labels={workRailLabels} userInputRequests={userInputRequests}
      debugEvents={(presentation.debugEventsByRunCode.get(run.runId) ?? []).map(describeDebugEvent)} />;
  }

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const element = transcriptRef.current;
    if (!element) return;
    element.scrollTo({ behavior, top: element.scrollHeight });
    lastScrollTopRef.current = element.scrollTop;
    autoStickToBottomRef.current = true;
    setShowJumpButton(false);
  }

  function handleScroll() {
    const element = transcriptRef.current;
    if (!element) return;
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceFromBottom <= 2) autoStickToBottomRef.current = true;
    else if (element.scrollTop < lastScrollTopRef.current) autoStickToBottomRef.current = false;
    lastScrollTopRef.current = element.scrollTop;
    setShowJumpButton(distanceFromBottom > 160);
  }

  useEffect(() => {
    if (autoStickToBottomRef.current) scrollToBottom("auto");
    else handleScroll();
  }, [messages, presentation, userInputRequest]);

  useEffect(() => {
    autoStickToBottomRef.current = true;
    setShowJumpButton(false);
  }, [session?.sessionId]);

  return (
    <AnnotationLabelsContext.Provider value={annotationLabels}>
    <MarkdownLinkRendererContext.Provider value={renderMarkdownLink}>
    <div ref={annotationRootRef} className="ef-chat" data-theme-part="chat" data-theme-anchor="chat">
      <span
        aria-hidden="true"
        className="ef-chat__theme-effect-layer"
        data-theme-effect-layer="chat"
      />
      <ImagePreviewDialog
        image={previewImage}
        onClose={() => setPreviewImage(null)}
      />
      {showHeader ? (
        <header className="ef-chat__header">
          <div className="ef-chat__header-content">
            {headerContent ?? (
              <>
                <span className="ef-chat__title">
                  {title ?? session?.title ?? "Chat"}
                </span>
                {session ? (
                  <span className="ef-chat__subtitle">
                    {session.sessionId} ·{" "}
                    {session.displayName ?? "Assistant"}
                  </span>
                ) : null}
              </>
            )}
          </div>
        </header>
      ) : null}
      {session || allowDraftSession ? (
        <>
          <div
            className={cx(
              "ef-chat__content",
              Boolean(sidebarContent) && "ef-chat__content--with-sidebar",
            )}
          >
            {showHistoryRail ? <ChatHistoryRail
              messages={transcriptMessages}
              presentation={presentation}
              transcriptRef={transcriptRef}
            /> : null}
            <section
              className="ef-chat__transcript"
              aria-label="Chat transcript"
              ref={transcriptRef}
              onScroll={handleScroll}
              onWheel={event => { if (event.deltaY < 0) autoStickToBottomRef.current = false; }}
            >
              <div className="ef-chat__transcript-inner">
                {!historyLoading && onLoadOlderHistory ? <button type="button" disabled={historyLoadingOlder} onClick={onLoadOlderHistory}>{historyLoadingOlder ? historyLabels.loading : historyLabels.loadOlder}</button> : null}
                {!historyLoading && transcriptMessages.length ? (
                  historyTurns.map((turn) => (
                    <section
                      className="ef-chat__turn"
                      data-chat-turn-id={turn.id}
                      key={turn.id}
                    >
                      {(messagesByTurnId.get(turn.id) ?? []).map((message) => (
                        <AnnotationContext.Provider key={message.messageId} value={annotationMap.get(message.messageId) ?? []}>
                          {showAgui ? workTimeline.before.get(message.messageId)?.map(renderWorkRun) : null}
                          {!showAgui || !workTimeline.processMessageIds.has(message.messageId) ? <>
                          {!workTimeline.managedMessageIds.has(message.messageId) && historyWork.has(message.messageId) ? <HistoryWorkRail messages={historyWork.get(message.messageId)!} labels={workRailLabels} historyLabels={historyLabels} showReasoningCards={showReasoningCards} locale={locale} /> : null}
                          <StructuredMessageDetails message={message} labels={workRailLabels} historyLabels={historyLabels} locale={locale} hasRunError={displayedErrorRuns.has(message.runId ?? "") || lastHistoryErrorByRun.get(message.runId) !== message.messageId} />
                          {message.role === "USER" && message.provenance?.sender.kind.toUpperCase() !== "SYSTEM" ? (
                            <div className="ef-chat__user-message-group">
                              <AnnotationBadges annotations={message.annotations ?? []} formatCount={formatAnnotationCount} />
                              <ChatAttachments
                                attachments={message.attachments}
                                attachmentLabels={attachmentLabels}
                                downloadAttachment={attachmentDownloader}
                                formatAnnotationCount={formatAnnotationCount}
                                onPreviewImage={(source, alt) => setPreviewImage({ alt, source })}
                              />
                              <ChatBubble
                                  currentUserDisplayName={currentUserDisplayName}
                                  isStreaming={message.messageId === streamingAssistantMessageCode}
                                  message={message}
                                  a2uiSession={a2uiSession}
                                  a2uiDisabled={a2uiDisabled}
                                  onA2UIAction={onA2UIAction}
                                  onEditMessage={onEditMessage}
                                />
                            </div>
                          ) : message.history && !message.a2ui && !message.content.trim() ? null : (
                            <ChatBubble
                              currentUserDisplayName={currentUserDisplayName}
                              isStreaming={message.messageId === streamingAssistantMessageCode}
                              message={message}
                              a2uiSession={a2uiSession}
                                  a2uiDisabled={a2uiDisabled}
                                  onA2UIAction={onA2UIAction}
                                  onEditMessage={onEditMessage}
                            />
                          )}
                          </> : null}
                          {showAgui &&
                            message.messageId ===
                            presentation.waitingForModelAnchorMessageCode ? (
                            <WaitingRail labels={workRailLabels} />
                          ) : null}
                          {showAgui ? workTimeline.after.get(message.messageId)?.map(renderWorkRun) : null}
                        </AnnotationContext.Provider>
                      ))}
                    </section>
                  ))
                ) : (
                  <div className="ef-chat__transcript-empty">
                    <Bot strokeWidth={1} size="60" className="ef-chat__transcript__bot" />
                    {historyLoading ? (
                      <div role="status" aria-live="polite" className="ef-chat__history-loading">
                        <LoaderCircle className="animate-spin" size={18} />
                        {historyLabels.loading}
                      </div>
                    ) : null}
                  </div>
                )}
            {userInputRequest?.status === "Pending" && onAnswerUserInput ? (
              <ChatUserInputCard
                disabled={userInputAnswerPending || session?.status === "ARCHIVED"}
                labels={userInputLabels}
                onSubmit={onAnswerUserInput}
                request={userInputRequest}
              />
            ) : null}
              </div>
            </section>
            {sidebarContent ? (
              <aside className="ef-chat__sidebar">{sidebarContent}</aside>
            ) : null}
          </div>
          <footer className="ef-chat__footer">

            {showJumpButton ? (
              <button
                className="ef-chat__button ef-chat__jump"
                type="button"
                aria-label="Jump to latest message"
                onClick={() => scrollToBottom("smooth")}
              >
                <ArrowDown size={16} />
              </button>
            ) : null}
            {annotationDraft.annotations.length ? <div className="ef-chat__pending-annotations" aria-label={annotationLabels.pendingAnnotations}>
              {annotationDraft.annotations.map((annotation, index) => <div key={annotation.id}>
                <button type="button" className="ef-chat__pending-annotation-edit ef-chat__annotation-reference" disabled={disabledInput || session?.status === "ARCHIVED"} onClick={event => editPendingAnnotation(annotation, event.currentTarget)} data-annotation-tooltip={chatAnnotationTooltip(annotation, annotationLabels)}>{annotationLabels.annotation(index + 1)}: {annotation.comment}</button>
                <button type="button" aria-label={annotationLabels.removeAnnotation(index + 1)} onClick={() => changeAnnotationsRef.current(annotations.filter(item => item.id !== annotation.id))}>×</button>
              </div>)}
            </div> : null}
            {showComposer ? <Composer
              composerKey={session?.sessionId}
              autoFocusComposer={autoFocusComposer}
              composerRef={composerRef}
              composerHeader={composerHeader}
              disabledInput={disabledInput}
              draft={annotationDraft.content}
              footerAddon={footerAddon}
              inputPlaceholder={inputPlaceholder}
              inputSuggestions={inputSuggestions}
              skillSuggestionTriggers={skillSuggestionTriggers}
              inputSuggestionLabels={inputSuggestionLabels}
              queuedInputPlaceholder={queuedInputPlaceholder}
              steeringInputPlaceholder={steeringInputPlaceholder}
              onDraftChange={onDraftChange}
              onPasteAttachment={onPasteAttachment}
              onEditQueuedMessage={onEditQueuedMessage ? (id, content) => onEditQueuedMessage(id, queuedMessages.find(item => item.id === id)?.input.content ?? content) : undefined}
              onRemoveQueuedMessage={onRemoveQueuedMessage}
              onSteerQueuedMessage={onSteerQueuedMessage}
              onReorderQueuedMessage={onReorderQueuedMessage}
              onSend={onSend}
              onStop={onStop}
              queueDisabled={queueDisabled}
              queuedLabel={queuedLabel}
              queuedMessages={queuedMessages.map(item => ({ ...item, input: { ...item.input, content: item.input.content || (item.input.annotations ?? []).map(annotation => annotation.comment).join("; ") } }))}
              runningSubmitModes={runningSubmitModes}
              runningEnterSubmitMode={runningEnterSubmitMode}
              sendDisabled={sendDisabled}
              sendLabel={sendLabel}
              sending={sending}
              showStop={showStop}
              steerDisabled={steerDisabled}
              queuedSteerDisabled={queuedSteerDisabled}
              stopLabel={stopLabel}
              pendingAttachments={pendingAttachments}
              attachmentDownloader={attachmentDownloader}
              showAttachmentControl={showAttachmentControl}
              attachmentUploadPending={attachmentUploadPending}
              onAttachFile={onAttachFile}
              onRemoveAttachment={onRemoveAttachment}
              attachLabel={attachLabel}
              uploadingLabel={uploadingLabel}
              removeAttachmentLabel={removeAttachmentLabel}
              editQueuedLabel={editQueuedLabel}
              removeQueuedLabel={removeQueuedLabel}
            /> : null}
          </footer>
        </>
      ) : (
        <div
          className={cx(
            "ef-chat__content",
            Boolean(sidebarContent) && "ef-chat__content--with-sidebar",
          )}
        >
          <section className="ef-chat__transcript">
            <div className="ef-chat__empty">
              <div className="ef-chat__empty-inner">
                <div className="ef-chat__empty-title">{emptyTitle}</div>
                <div className="ef-chat__empty-description">
                  {emptyDescription}
                </div>
                {onCreateSession ? (
                  <div style={{ marginTop: 16 }}>
                    <button
                      className="ef-chat__button"
                      type="button"
                      onClick={onCreateSession}
                    >
                      {createSessionLabel}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
          {sidebarContent ? (
            <aside className="ef-chat__sidebar">{sidebarContent}</aside>
          ) : null}
        </div>
      )}
    </div>
    </MarkdownLinkRendererContext.Provider>
    </AnnotationLabelsContext.Provider>
  );
}
