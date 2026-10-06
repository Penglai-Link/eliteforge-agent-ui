import {
  ArrowDown,
  Bot,
  BrainCircuit,
  CheckCircle2,
  CircleAlert,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  Send,
  Square,
  Terminal,
  UserRound,
  X,
} from "lucide-react";
import {
  aguiEventRunId,
  isAguiCancellationEvent,
  isAguiExecutionTerminalEvent,
  isAguiPresentationFailureEvent,
  aguiWorkElapsedMilliseconds,
  aguiReasoningEffort,
  buildAguiUserWorkCards,
  buildAguiRunNotices,
  buildTranscriptPresentation,
  currentAguiWorkSnapshot,
  describeDebugEvent,
  formatJsonBlockValue,
  formatTime,
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type ReactNode,
} from "react";
import "github-markdown-css/github-markdown.css";
import { ChatHistoryRail } from "./ChatHistoryRail";
import { ChatUserInputCard } from "./ChatUserInputCard";
import { buildChatHistoryTurns } from "./chatHistory";
import { isImageAttachment, useAttachmentImageSource } from "./chatAttachments";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function insertNewlineAtCursor(textarea: HTMLTextAreaElement) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const nextValue = `${textarea.value.slice(0, start)}\n${textarea.value.slice(end)}`;
  textarea.value = nextValue;
  textarea.selectionStart = start + 1;
  textarea.selectionEnd = start + 1;
  return nextValue;
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

const MarkdownLinkRendererContext = createContext<ChatMarkdownLinkRenderer | undefined>(
  undefined,
);

function MarkdownBlock({
  content,
  emptyMessage,
}: {
  content: string;
  emptyMessage: string;
}) {
  const renderLink = useContext(MarkdownLinkRendererContext);

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={renderLink ? { a: renderLink } : undefined}
      >
        {content || emptyMessage}
      </ReactMarkdown>
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

function isUserInputAnswerSummary(message: ChatMessage) {
  if (message.role !== "USER") return false;
  const content = message.content.trimStart();
  return content.startsWith("The user answered the questions you asked:")
    || content.startsWith("用户回答了你提出的问题：");
}

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
  onEditMessage,
}: {
  currentUserDisplayName?: string;
  emptyAssistantMessage?: string;
  isStreaming?: boolean;
  message: ChatMessage;
  onEditMessage?: (content: string) => void;
}) {
  const isUser = message.role === "USER";
  const actorName = isUser
    ? currentUserDisplayName || message.actor
    : message.actor;
  return (
    <div
      className={cx(
        "ef-chat__message-entry",
        isUser && "ef-chat__message-entry--user",
      )}
    >
      <article
        className={cx("ef-chat__message", isUser && "ef-chat__message--user")}
        data-theme-anchor="chat-message"
        data-theme-part={isUser ? "chat-message-user" : "chat-message-assistant"}
        data-streaming={isStreaming ? "true" : undefined}
      >
        <div className="ef-chat__message-header">
          <div className="ef-chat__message-actor">
            {isUser ? <UserRound size={16} /> : <Bot size={16} />}
            <span>{actorName}</span>
          </div>
        </div>
        {isUser ? (
          <div className="ef-chat__message-body">{message.content}</div>
        ) : (
          <MarkdownBlock
            content={message.content}
            emptyMessage={emptyAssistantMessage}
          />
        )}
      </article>
      <div className="ef-chat__message-actions ef-chat__message-actions--outside">
        <CopyValueButton
          ariaLabel="Copy raw markdown"
          title="Copy raw markdown"
          value={message.content}
        />
        {isUser && onEditMessage ? (
          <button
            className="ef-chat__icon-button"
            type="button"
            aria-label="Edit message"
            onClick={() => onEditMessage(message.content)}
          >
            <Pencil size={14} />
          </button>
        ) : null}
        <span className="ef-chat__message-time">
          {formatTime(message.createdAt)}
        </span>
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

function latestAguiRunCode(events: ChatAguiStreamEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const runId = aguiEventRunId(events[index]);
    if (runId) return runId;
  }
  return "";
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
  domainExpanded: (name: string) => `Expand ${name}`,
  domainExpanding: (name: string) => `Expanding ${name}`,
  group: (count: number) => `${count} ${count === 1 ? "tool call" : "tool calls"}`,
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
  resolveName: (runtimeName: string) => runtimeName,
} satisfies ChatToolWorkLabels;

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

function JsonBlock({ value }: { value: unknown }) {
  const preview = formatJsonBlockValue(value);
  if (!preview) return null;
  return <pre className="ef-chat__result-block">{preview}</pre>;
}

function ToolCard({
  card,
  labels = defaultWorkRailLabels,
  nested = false,
}: {
  card: ToolWorkCard;
  labels?: ChatWorkRailLabels;
  nested?: boolean;
}) {
  const complete = card.ended || Boolean(card.result);
  const running = card.started && !complete;
  const hasParameters = hasToolParameterPayload(card.args);
  const parametersText = hasParameters ? formatJsonBlockValue(card.args) : "";
  const resultText = card.result ? formatJsonBlockValue(card.result) : "";
  const toolCopy = { ...defaultToolWorkLabels, ...labels.tool };
  const toolName = toolCopy.resolveName(card.toolName, card.args);
  const domainExpansion = card.toolName === "discovery_expand_tool_domain";
  const toolLabel = domainExpansion
    ? (complete ? toolCopy.domainExpanded(toolName) : toolCopy.domainExpanding(toolName))
    : (complete ? toolCopy.completed(toolName) : toolCopy.running(toolName));
  const nestedToolLabel = toolLabel;
  const [expanded, setExpanded] = useState(() => running);
  const [parametersExpanded, setParametersExpanded] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (running) setExpanded(true);
    else if (complete) setExpanded(false);
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
                ? "ef-chat__tool-badge--nested"
                : "ef-chat__tool-badge--standalone",
            )}
          >
            {nested ? (
              <span className="ef-chat__tool-timeline-dot" aria-hidden="true" />
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
                {nested ? nestedToolLabel : toolLabel}
              </span>
              {nested ? null : (
                <span
                  className={cx(
                    "ef-chat__tool-status",
                    complete
                      ? "ef-chat__tool-status--done"
                      : "ef-chat__tool-status--running",
                  )}
                >
                  {complete ? toolCopy.statusDone : toolCopy.statusRunning}
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
            {complete ? (
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
                  <div
                    className="max-h-64"
                    style={{ maxHeight: 256, overflowY: "auto" }}
                  >
                    <JsonBlock value={card.result} />
                  </div>
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
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToolGroupCard({ card, labels = defaultWorkRailLabels }: { card: ToolGroupWorkCard; labels?: ChatWorkRailLabels }) {
  const toolCopy = { ...defaultToolWorkLabels, ...labels.tool };
  const toolCards = card.toolCards.filter((toolCard) => toolCard.started);
  const hasRunningTool = toolCards.some(
    (toolCard) => toolCard.started && !toolCard.ended && !toolCard.result,
  );
  const [expanded, setExpanded] = useState(() => hasRunningTool);

  useEffect(() => {
    setExpanded(hasRunningTool);
  }, [hasRunningTool]);

  if (!toolCards.length) return null;

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
            {toolCopy.group(toolCards.length)}
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
              <ToolCard card={toolCard} labels={labels} nested />
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
}: {
  card: Extract<AguiUserWorkCard, { kind: "reasoning" }>["value"];
  labels?: ChatWorkRailLabels;
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

function userInputAnswerText(
  request: ChatUserInputRequest,
  question: ChatUserInputRequest["questions"][number],
  labels: ChatWorkRailLabels,
) {
  const answer = request.answers?.find((item) => item.questionId === question.questionId);
  if (!answer) return labels.waitingForAnswer ?? "Waiting for your answer";
  if (answer.answerKind === "Other") return answer.otherText?.trim() || labels.waitingForAnswer || "Waiting for your answer";
  if (answer.answerKind === "Skipped") return labels.skipped ?? "Skipped";
  return question.options.find((option) => option.optionId === answer.optionId)?.label
    ?? answer.optionId
    ?? labels.waitingForAnswer
    ?? "Waiting for your answer";
}

function UserInputWorkCard({
  labels,
  request,
}: {
  labels: ChatWorkRailLabels;
  request: ChatUserInputRequest;
}) {
  const [expanded, setExpanded] = useState(false);
  const summary = labels.askedQuestions?.(request.questions.length)
    ?? `Asked ${request.questions.length} questions`;
  return (
    <section className="ef-chat__rail-entry" aria-label={summary}>
      <button
        aria-expanded={expanded}
        className="ef-chat__rail-entry-toggle"
        type="button"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="ef-chat__rail-entry-label">
          <MessageSquareText size={15} />
          <span>{summary}</span>
        </span>
        <span className="ef-chat__rail-entry-chevron">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {expanded ? (
        <ol className="ef-chat__rail-entry-list">
          {request.questions.map((question) => (
            <li className="ef-chat__user-input-work-answer" key={question.questionId}>
              <span className="ef-chat__user-input-work-question">{question.question}</span>
              <span className="ef-chat__user-input-work-value">
                {userInputAnswerText(request, question, labels)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
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
          {detail ? <div className="ef-chat__run-notice-detail">{detail}</div> : null}
          {hint ? <div className="ef-chat__run-notice-detail">{hint}</div> : null}
        </div>
      </div>
    );
  });
}

function AguiRunWorkRail({
  debugEvents,
  events,
  labels = defaultWorkRailLabels,
  messageId,
  userInputRequests = [],
}: {
  debugEvents: string[];
  events: ChatAguiStreamEvent[];
  labels?: ChatWorkRailLabels;
  messageId?: string;
  userInputRequests?: ChatUserInputRequest[];
}) {
  const notices = useMemo(() => buildAguiRunNotices(events), [events]);
  const compacting = notices.some((notice) => (
    notice.kind === "compaction" && (notice.status === "requested" || notice.status === "started")
  ));
  const userCards = useMemo<AguiUserWorkCard[]>(() => buildAguiUserWorkCards(events).flatMap((card): AguiUserWorkCard[] => {
    if (card.kind === "tool" && card.value.toolName === "chat_ask_user") return [];
    if (card.kind !== "toolGroup") return [card];
    const toolCards = card.value.toolCards.filter((toolCard) => toolCard.toolName !== "chat_ask_user");
    return toolCards.length
      ? [{ ...card, value: { ...card.value, toolCards } }]
      : [];
  }), [events]);
  const matchingUserInputRequests = useMemo(() => {
    const runCodes = new Set(events.map((event) => aguiEventRunId(event)));
    return userInputRequests.filter((request) => (
      runCodes.has(request.runId) || request.assistantMessageId === messageId
    ));
  }, [events, messageId, userInputRequests]);
  const answeredUserInputRequests = matchingUserInputRequests.filter(
    (request) => request.status === "Answered",
  );
  const orderedWorkItems = useMemo(() => [
    ...userCards.map((card) => ({
      firstMillis: card.value.firstMillis,
      kind: "agui" as const,
      card,
    })),
    ...answeredUserInputRequests.map((request) => ({
      firstMillis: request.requestedAt,
      kind: "userInput" as const,
      request,
    })),
  ].sort((left, right) => left.firstMillis - right.firstMillis), [
    answeredUserInputRequests,
    userCards,
  ]);
  const pendingUserInputRequest = matchingUserInputRequests.find(
    (request) => request.status === "Pending",
  );
  const reasoningEffort = useMemo(() => aguiReasoningEffort(events), [events]);
  const terminalEvent = useMemo(() => [...events].reverse().find((event) => {
    return isAguiExecutionTerminalEvent(event);
  }) ?? null, [events]);
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
  const currentRunCode = useMemo(() => latestAguiRunCode(events), [events]);
  const latestTerminalSummaryRef = useRef<TerminalWorkSummary | null>(terminalSummary);
  if (terminalSummary?.runId) latestTerminalSummaryRef.current = terminalSummary;
  const displayedTerminalSummary = terminalSummary
    ?? (latestTerminalSummaryRef.current?.runId === currentRunCode
      ? latestTerminalSummaryRef.current
      : null);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const completed = Boolean(displayedTerminalSummary) && !pendingUserInputRequest;
  const duration = completed
    ? displayedTerminalSummary?.duration ?? "<1s"
    : formatAguiDuration(aguiWorkElapsedMilliseconds(events, now));
  const currentSummary = useMemo(() => {
    const snapshot = currentAguiWorkSnapshot(events);
    if (snapshot?.summary) return snapshot.summary;
    const activity = snapshot?.activity;
    if (activity === "PREPARING") return labels.preparing;
    if (activity === "RESPONDING") return labels.responding;
    return labels.thinking;
  }, [events, labels.preparing, labels.responding, labels.thinking]);

  useEffect(() => {
    if (completed) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [completed]);

  useEffect(() => {
    if (completed) setExpanded(false);
  }, [completed]);

  if (!displayedTerminalSummary && !events.length && !orderedWorkItems.length && !debugEvents.length)
    return null;
  const onlyPresentationHealth = notices.length > 0 && !displayedTerminalSummary
    && events.every((event) => event.type === "CUSTOM" && event.name === "agent.presentation.incomplete");
  if (onlyPresentationHealth) {
    return <section className="ef-chat__rail" aria-label={labels.ariaLabel}><AguiRunStatus notices={notices} labels={labels} /></section>;
  }
  const hasDetails = orderedWorkItems.length > 0 || debugEvents.length > 0;
  const presentationClosedWithoutOutcome = !displayedTerminalSummary && events.some(isAguiPresentationFailureEvent);
  let summary = presentationClosedWithoutOutcome
    ? labels.notices?.presentationIncomplete ?? defaultWorkRailLabels.notices.presentationIncomplete
    : labels.workingFor(duration);
  if (completed) {
    summary = displayedTerminalSummary?.failed
      ? `${labels.failed ?? defaultWorkRailLabels.failed} · ${duration}`
      : displayedTerminalSummary?.stopped
        ? `${labels.stopped ?? "Run stopped"} · ${duration}`
        : labels.workedFor(duration);
  }
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
      {!completed && !compacting && !presentationClosedWithoutOutcome ? (
        <div className="ef-chat__rail-current" aria-live="polite">
          {pendingUserInputRequest ? (
            <>
              <MessageSquareText className="ef-chat__rail-current-icon animate-pulse" size={15} />
              <span className="ef-chat__rail-current-text">
                {labels.askingQuestions?.(pendingUserInputRequest.questions.length) ?? "Asking questions"}
                <span className="ef-chat__rail-current-subtext">
                  {labels.waitingForAnswer ?? "Waiting for your answer"}
                </span>
              </span>
            </>
          ) : (
            <>
              <BrainCircuit className="ef-chat__rail-current-icon animate-pulse" size={15} />
              <span className="ef-chat__rail-current-text">{currentSummary}</span>
            </>
          )}
        </div>
      ) : null}
      {expanded && hasDetails ? (
        <div
          className="ef-chat__rail-stack"
          style={{ marginTop: 8 }}
        >
          {orderedWorkItems.length ? (
            <section
              className="ef-chat__rail"
              aria-label="Agent work rail"
              style={{ maxWidth: "none", paddingLeft: 0 }}
            >
              <div className="ef-chat__rail-card-list">
                {orderedWorkItems.map((item) => item.kind === "userInput" ? (
                  <UserInputWorkCard
                    labels={labels}
                    request={item.request}
                    key={`user-input-${item.request.requestId}`}
                  />
                ) : item.card.kind === "reasoning" ? (
                  <ReasoningCard card={item.card.value} key={item.card.value.id} labels={labels} />
                ) : item.card.kind === "toolGroup" ? (
                  <ToolGroupCard card={item.card.value} key={item.card.value.id} labels={labels} />
                ) : (
                  <ToolCard card={item.card.value} key={item.card.value.id} labels={labels} />
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

export interface ChatPanelProps {
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
  liveAguiAnchorMessageCodes?: Record<string, string>;
  liveAguiEvents?: ChatAguiStreamEvent[];
  liveAguiPendingAnchorMessageCode?: string;
  liveAguiPending?: boolean;
  messages: ChatMessage[];
  onCreateSession?: () => void;
  onNewSession?: () => void;
  onDraftChange: (value: string) => void;
  onPasteAttachment?: (file: File) => void | Promise<void>;
  onEditMessage?: (content: string) => void;
  onEditQueuedMessage?: (id: string, content: string) => void;
  onRemoveQueuedMessage?: (id: string) => void;
  onSend: (mode?: ChatSubmitMode) => void;
  onStop?: () => void;
  protocolEvents?: ChatAguiStreamEvent[];
  queueDisabled?: boolean;
  queuedLabel?: string;
  queuedMessages?: ChatQueuedSubmission[];
  runningSubmitModes?: ChatRunningSubmitMode[];
  sendDisabled?: boolean;
  sendLabel?: string;
  sending?: boolean;
  streamingAssistantMessageCode?: string | null;
  session?: ChatSession | null;
  showAgui?: boolean;
  showHeader?: boolean;
  showStop?: boolean;
  sidebarContent?: ReactNode;
  steerDisabled?: boolean;
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
  liveAguiAnchorMessageCodes,
  liveAguiEvents,
  liveAguiPendingAnchorMessageCode,
  liveAguiPending,
  messages,
  onCreateSession,
  onNewSession,
  onDraftChange,
  onPasteAttachment,
  onEditMessage,
  onEditQueuedMessage,
  onRemoveQueuedMessage,
  onSend,
  onStop,
  protocolEvents,
  queueDisabled = false,
  queuedLabel = "Queued",
  queuedMessages = [],
  runningSubmitModes = [],
  sendDisabled,
  sendLabel = "Send",
  sending = false,
  streamingAssistantMessageCode: activeStreamingAssistantMessageCode,
  session,
  showAgui = true,
  showHeader = true,
  showStop = true,
  sidebarContent,
  steerDisabled = false,
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
  const transcriptRef = useRef<HTMLElement | null>(null);
  const composerElementRef = useRef<HTMLTextAreaElement | null>(null);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ alt: string; source: string } | null>(null);
  const autoStickToBottomRef = useRef(true);
  const canQueueWhileRunning = runningSubmitModes.includes("queue");
  const canSteerWhileRunning = runningSubmitModes.includes("steer");
  const composerPlaceholder = sending && canQueueWhileRunning
    ? canSteerWhileRunning
      ? "Enter 加入队列 · ⌘/Ctrl+Enter 立即调整当前回复 · Shift+Enter 换行"
      : "Enter 加入队列 · Shift+Enter 换行"
    : inputPlaceholder;
  const primarySubmitMode: ChatSubmitMode | null = !sending
    ? "send"
    : canQueueWhileRunning
      ? "queue"
      : null;
  const primarySubmitDisabled = disabledInput
    || (primarySubmitMode === "queue"
        ? queueDisabled
        : Boolean(sendDisabled));
  const streamingAssistantMessageCode = useMemo(() => {
    if (activeStreamingAssistantMessageCode !== undefined) {
      return activeStreamingAssistantMessageCode || undefined;
    }
    if (!sending) return undefined;
    const latestMessage = messages[messages.length - 1];
    return latestMessage?.role === "ASSISTANT" ? latestMessage.messageId : undefined;
  }, [activeStreamingAssistantMessageCode, messages, sending]);
  const transcriptMessages = useMemo(
    () => messages.filter((message) => (
      message.messageId !== streamingAssistantMessageCode || message.content.trim().length > 0
    )),
    [messages, streamingAssistantMessageCode],
  );
  const presentation = useMemo(
    () =>
      buildTranscriptPresentation({
        debugOptions,
        liveAguiAnchorMessageCodes,
        liveAguiEvents,
        liveAguiPendingAnchorMessageCode,
        liveAguiPending,
        messages,
        protocolEvents,
        sessionId: session?.sessionId ?? "",
      }),
    [
      debugOptions,
      liveAguiAnchorMessageCodes,
      liveAguiEvents,
      liveAguiPendingAnchorMessageCode,
      liveAguiPending,
      messages,
      protocolEvents,
      session?.sessionId,
    ],
  );
  const historyTurns = useMemo(
    () => buildChatHistoryTurns(transcriptMessages, presentation),
    [transcriptMessages, presentation],
  );
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

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const element = transcriptRef.current;
    if (!element) return;
    element.scrollTo({ behavior, top: element.scrollHeight });
    autoStickToBottomRef.current = true;
    setShowJumpButton(false);
  }

  function handleScroll() {
    const element = transcriptRef.current;
    if (!element) return;
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    autoStickToBottomRef.current = distanceFromBottom <= 96;
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

  useLayoutEffect(() => {
    if (!autoFocusComposer || !session?.sessionId) return;
    composerElementRef.current?.focus();
  }, [autoFocusComposer, session?.sessionId]);

  function setComposerNode(node: HTMLTextAreaElement | null) {
    composerElementRef.current = node;
    if (!composerRef) return;
    if (typeof composerRef === "function") {
      composerRef(node);
      return;
    }
    composerRef.current = node;
  }

  function handleComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (disabledInput || !onPasteAttachment) return;
    const imageItem = Array.from(event.clipboardData.items).find(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
    const file = imageItem?.getAsFile();
    if (!file) return;
    event.preventDefault();
    const fileName = file.name.trim() || `pasted-image-${Date.now()}.${file.type.split("/")[1] || "png"}`;
    const normalizedFile = file.name.trim()
      ? file
      : new File([file], fileName, { type: file.type || "image/png" });
    void onPasteAttachment(normalizedFile);
  }

  function handleStopSubmit() {
    if (onStop) {
      onStop();
      return;
    }
    onSend("send");
  }

  return (
    <MarkdownLinkRendererContext.Provider value={renderMarkdownLink}>
    <div className="ef-chat" data-theme-part="chat" data-theme-anchor="chat">
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
      {session ? (
        <>
          <div
            className={cx(
              "ef-chat__content",
              Boolean(sidebarContent) && "ef-chat__content--with-sidebar",
            )}
          >
            <ChatHistoryRail
              messages={transcriptMessages}
              presentation={presentation}
              transcriptRef={transcriptRef}
            />
            <section
              className="ef-chat__transcript"
              aria-label="Chat transcript"
              ref={transcriptRef}
              onScroll={handleScroll}
            >
              <div className="ef-chat__transcript-inner">
                {transcriptMessages.length ? (
                  historyTurns.map((turn) => (
                    <section
                      className="ef-chat__turn"
                      data-chat-turn-id={turn.id}
                      key={turn.id}
                    >
                      {(messagesByTurnId.get(turn.id) ?? []).map((message) => (
                        <Fragment key={message.messageId}>
                          {message.role === "USER" ? (
                            <div className="ef-chat__user-message-group">
                              <ChatAttachments
                                attachments={message.attachments}
                                attachmentLabels={attachmentLabels}
                                downloadAttachment={attachmentDownloader}
                                formatAnnotationCount={formatAnnotationCount}
                                onPreviewImage={(source, alt) => setPreviewImage({ alt, source })}
                              />
                              {!isUserInputAnswerSummary(message) ? (
                                <ChatBubble
                                  currentUserDisplayName={currentUserDisplayName}
                                  isStreaming={message.messageId === streamingAssistantMessageCode}
                                  message={message}
                                  onEditMessage={onEditMessage}
                                />
                              ) : null}
                            </div>
                          ) : (
                            <ChatBubble
                              currentUserDisplayName={currentUserDisplayName}
                              isStreaming={message.messageId === streamingAssistantMessageCode}
                              message={message}
                              onEditMessage={onEditMessage}
                            />
                          )}
                          {showAgui &&
                            message.messageId ===
                            presentation.waitingForModelAnchorMessageCode ? (
                            <WaitingRail labels={workRailLabels} />
                          ) : null}
                          {showAgui
                            ? (
                              presentation.workRailsByMessageCode.get(
                                message.messageId,
                              ) ?? []
                            ).map((run) => (
                              <AguiRunWorkRail
                                debugEvents={(
                                  presentation.debugEventsByRunCode.get(
                                    run.runId,
                                  ) ?? []
                                ).map(describeDebugEvent)}
                                events={run.events as ChatAguiStreamEvent[]}
                                key={run.runId}
                                labels={workRailLabels}
                                messageId={message.messageId}
                                userInputRequests={userInputRequests}
                              />
                            ))
                            : null}
                        </Fragment>
                      ))}
                    </section>
                  ))
                ) : (
                  <Bot
                    strokeWidth={1}
                    size="60"
                    className="ef-chat__transcript__bot"
                  />
                )}
            {userInputRequest?.status === "Pending" && onAnswerUserInput ? (
              <ChatUserInputCard
                disabled={userInputAnswerPending}
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
            {queuedMessages.length ? (
              <section
                aria-label={queuedLabel}
                className="ef-chat__queued-messages"
              >
                <div className="ef-chat__queued-messages-header">
                  <span>{queuedLabel}</span>
                  <span className="ef-chat__queued-messages-count">
                    {queuedMessages.length}
                  </span>
                </div>
                <ol className="ef-chat__queued-messages-list">
                  {queuedMessages.map((queuedMessage) => (
                    <li
                      className="ef-chat__queued-message"
                      key={queuedMessage.id}
                    >
                      <span className="ef-chat__queued-message-content">
                        {queuedMessage.input.content}
                      </span>
                      <span className="ef-chat__queued-message-actions">
                        {onEditQueuedMessage ? (
                          <button
                            aria-label="Edit queued message"
                            className="ef-chat__icon-button"
                            title="Edit queued message"
                            type="button"
                            onClick={() => onEditQueuedMessage(
                              queuedMessage.id,
                              queuedMessage.input.content,
                            )}
                          >
                            <Pencil size={14} />
                          </button>
                        ) : null}
                        {onRemoveQueuedMessage ? (
                          <button
                            aria-label="Remove queued message"
                            className="ef-chat__icon-button"
                            title="Remove queued message"
                            type="button"
                            onClick={() => onRemoveQueuedMessage(queuedMessage.id)}
                          >
                            <X size={15} />
                          </button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
            <div className="ef-chat__composer">
              {composerHeader ? (
                <div className="ef-chat__composer-header">
                  {composerHeader}
                </div>
              ) : null}
              <textarea
                autoFocus={autoFocusComposer}
                key={session?.sessionId ?? "composer"}
                ref={setComposerNode}
                className="ef-chat__textarea"
                data-theme-part="chat-input" data-theme-anchor="chat-input"
                disabled={disabledInput}
                placeholder={composerPlaceholder}
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                onPaste={handleComposerPaste}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "Enter" && event.shiftKey) {
                    event.preventDefault();
                    onDraftChange(insertNewlineAtCursor(event.currentTarget));
                    return;
                  }
                  const commandShortcut = event.metaKey || event.ctrlKey;
                  if (
                    sending
                    && commandShortcut
                    && event.key === "Enter"
                  ) {
                    event.preventDefault();
                    if (
                      canSteerWhileRunning
                      && !disabledInput
                      && !steerDisabled
                    ) {
                      onSend("steer");
                    }
                    return;
                  }
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  if (primarySubmitMode && !primarySubmitDisabled) {
                    onSend(primarySubmitMode);
                  }
                }}
                aria-keyshortcuts={sending && canSteerWhileRunning
                  ? "Meta+Enter Control+Enter"
                  : undefined}
              />
              <div className="ef-chat__composer-row">
                <div className="ef-chat__composer-addon">{footerAddon}</div>
                <div className="ef-chat__composer-actions">
                  {sending && showStop ? (
                    <button
                      aria-label={stopLabel}
                      className="ef-chat__button ef-chat__button_send ef-chat__button--danger"
                      title={stopLabel}
                      type="button"
                      onClick={handleStopSubmit}
                    >
                      <Square size={14} />
                    </button>
                  ) : null}
                  {!sending ? (
                    <button
                      aria-label={sendLabel}
                      className="ef-chat__button ef-chat__button_send"
                      disabled={disabledInput || Boolean(sendDisabled)}
                      title={sendLabel}
                      type="button"
                      onClick={() => onSend("send")}
                    >
                      <Send size={15} />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
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
  );
}
