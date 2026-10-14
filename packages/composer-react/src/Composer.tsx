import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { FileText, Paperclip, Pencil, Send, Square, X } from "lucide-react";
import {
  attachmentLabel,
  attachmentTypeLabel,
  isImageAttachment,
  suggestionQuery as getSuggestionQuery,
  filterSuggestions,
  insertSuggestion,
  composerOverlayParts,
  insertNewlineAtCursor,
  pastedImage,
  type ComposerProps,
  type ComposerAttachment,
  type ComposerSuggestion as ChatInputSuggestion,
  type ComposerSubmitMode as ChatSubmitMode,
} from "@eliteforge/agent-ui-composer-core";

export interface ComposerReactProps extends ComposerProps {
  composerRef?: Ref<HTMLTextAreaElement>;
  composerHeader?: ReactNode;
  footerAddon?: ReactNode;
  onDraftChange: (value: string) => void;
  onSend: (mode?: ChatSubmitMode) => void;
  onStop?: () => void;
  onPasteAttachment?: (file: File) => void | Promise<void>;
  onAttachFile?: (file: File) => void | Promise<void>;
  onRemoveAttachment?: (id: string) => void;
  onEditQueuedMessage?: (id: string, content: string) => void;
  onRemoveQueuedMessage?: (id: string) => void;
}
export function useAttachmentImageSource(
  attachment: ComposerAttachment,
  downloadAttachment?: (attachment: ComposerAttachment) => Promise<Blob>
) {
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);

  useEffect(() => {
    if (
      attachment.imageUrl ||
      !downloadAttachment ||
      !isImageAttachment(attachment)
    ) {
      setRemoteUrl(null);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    void downloadAttachment(attachment)
      .then((blob) => {
        const nextObjectUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(nextObjectUrl);
          return;
        }
        objectUrl = nextObjectUrl;
        setRemoteUrl(nextObjectUrl);
      })
      .catch(() => {
        if (active) setRemoteUrl(null);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment, downloadAttachment]);

  return attachment.imageUrl ?? remoteUrl;
}

function PendingAttachmentCard({
  attachment,
  downloadAttachment,
  onRemove,
  removeLabel,
}: {
  attachment: ComposerAttachment;
  downloadAttachment?: (attachment: ComposerAttachment) => Promise<Blob>;
  onRemove?: (attachmentId: string) => void;
  removeLabel: (name: string) => string;
}) {
  const label = attachmentLabel(attachment);
  const imageSource = useAttachmentImageSource(attachment, downloadAttachment);

  if (isImageAttachment(attachment)) {
    return (
      <div className="ef-chat__runtime-attachment-image">
        {imageSource ? <img alt={label} src={imageSource} /> : null}
        <button
          aria-label={removeLabel(label)}
          className="ef-chat__runtime-attachment-remove ef-chat__runtime-attachment-remove--floating"
          type="button"
          onClick={() => onRemove?.(attachment.id)}
        >
          <X
            size={13}
            style={{
              width: "var(--agent-ui-composer-icon-size, 13px)",
              height: "var(--agent-ui-composer-icon-size, 13px)",
            }}
          />
        </button>
      </div>
    );
  }

  return (
    <div className="ef-chat__runtime-attachment-file">
      <span
        className="ef-chat__runtime-attachment-file-icon"
        aria-hidden="true"
      >
        <FileText
          size={22}
          style={{
            width: "var(--agent-ui-composer-icon-size, 22px)",
            height: "var(--agent-ui-composer-icon-size, 22px)",
          }}
        />
      </span>
      <span className="ef-chat__runtime-attachment-file-info">
        <span className="ef-chat__runtime-attachment-file-name" title={label}>
          {label}
        </span>
        <span className="ef-chat__runtime-attachment-file-type">
          {attachmentTypeLabel(attachment)}
        </span>
      </span>
      <button
        aria-label={removeLabel(label)}
        className="ef-chat__runtime-attachment-remove ef-chat__runtime-attachment-remove--floating"
        type="button"
        onClick={() => onRemove?.(attachment.id)}
      >
        <X
          size={13}
          style={{
            width: "var(--agent-ui-composer-icon-size, 13px)",
            height: "var(--agent-ui-composer-icon-size, 13px)",
          }}
        />
      </button>
    </div>
  );
}

export function Composer({
  draft,
  onDraftChange,
  onSend,
  onStop,
  onPasteAttachment,
  composerRef,
  composerHeader,
  footerAddon,
  composerKey,
  autoFocusComposer = false,
  disabledInput = false,
  inputSuggestions = [],
  skillSuggestionTriggers,
  inputSuggestionLabels = {
    commands: "Commands",
    skills: "Skills",
    commandsAndSkills: "Commands and skills",
  },
  inputPlaceholder = "Enter to send, Shift+Enter for newline",
  queuedInputPlaceholder = "Enter to queue · Shift+Enter for newline",
  steeringInputPlaceholder = "Enter to queue · ⌘/Ctrl+Enter to steer · Shift+Enter for newline",
  sending = false,
  runningSubmitModes = [],
  queueDisabled = false,
  steerDisabled = false,
  sendDisabled = false,
  sendLabel = "Send",
  stopLabel = "Stop",
  showStop = true,
  queuedMessages = [],
  queuedLabel = "Queued",
  onEditQueuedMessage,
  onRemoveQueuedMessage,
  editQueuedLabel = "Edit queued message",
  removeQueuedLabel = "Remove queued message",
  pendingAttachments = [],
  attachmentDownloader,
  onRemoveAttachment,
  onAttachFile,
  showAttachmentControl = false,
  attachmentUploadPending = false,
  attachLabel = "Attach file",
  uploadingLabel = "Uploading attachment",
  removeAttachmentLabel = (name) => `Remove ${name}`,
}: ComposerReactProps) {
  const attachmentFileInputRef = useRef<HTMLInputElement | null>(null);
  const composerElementRef = useRef<HTMLTextAreaElement | null>(null);
  const [composerCaretAtEnd, setComposerCaretAtEnd] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const suggestionQuery = useMemo(() => {
    return getSuggestionQuery(draft);
  }, [draft]);
  const visibleSuggestions = useMemo(() => {
    return filterSuggestions(draft, inputSuggestions, skillSuggestionTriggers);
  }, [draft, inputSuggestions, skillSuggestionTriggers, suggestionQuery]);
  const suggestionGroups = useMemo(() => {
    const commands = visibleSuggestions.filter(
      (item) => item.kind === "command"
    );
    const skills = visibleSuggestions.filter((item) => item.kind === "skill");
    return [
      ...(commands.length
        ? [[inputSuggestionLabels.commands, commands] as const]
        : []),
      ...(skills.length
        ? [[inputSuggestionLabels.skills, skills] as const]
        : []),
    ];
  }, [inputSuggestionLabels, visibleSuggestions]);
  const flatSuggestions = useMemo(
    () => suggestionGroups.flatMap(([, items]) => items),
    [suggestionGroups]
  );
  const suggestionsOpen = !suggestionsDismissed;
  useEffect(() => {
    setActiveSuggestion(0);
    setSuggestionsDismissed(false);
  }, [draft]);
  function chooseSuggestion(item: ChatInputSuggestion) {
    const textarea = composerElementRef.current;
    if (!textarea || !suggestionQuery) return;
    const next = insertSuggestion(draft, item);
    if (!next) return;
    onDraftChange(next.value);
    requestAnimationFrame(() => {
      textarea.focus();
      const position = next.caret;
      textarea.setSelectionRange(position, position);
      setComposerCaretAtEnd(true);
    });
  }
  function updateComposerCaret(textarea: HTMLTextAreaElement) {
    setComposerCaretAtEnd(
      textarea.value.length > 0 &&
        textarea.selectionStart === textarea.value.length &&
        textarea.selectionEnd === textarea.value.length
    );
  }
  const canQueueWhileRunning = runningSubmitModes.includes("queue");
  const canSteerWhileRunning = runningSubmitModes.includes("steer");
  const composerPlaceholder =
    sending && canQueueWhileRunning
      ? canSteerWhileRunning
        ? steeringInputPlaceholder
        : queuedInputPlaceholder
      : inputPlaceholder;
  const primarySubmitMode: ChatSubmitMode | null = !sending
    ? "send"
    : canQueueWhileRunning
    ? "queue"
    : null;
  const primarySubmitDisabled =
    disabledInput ||
    (primarySubmitMode === "queue" ? queueDisabled : Boolean(sendDisabled));
  useLayoutEffect(() => {
    if (!autoFocusComposer || !composerKey) return;
    composerElementRef.current?.focus();
  }, [autoFocusComposer, composerKey]);

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
    const file = pastedImage(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    void onPasteAttachment(file);
  }

  function handleStopSubmit() {
    if (onStop) {
      onStop();
      return;
    }
    onSend("send");
  }

  return (
    <div
      className="ef-composer"
      data-theme-part="composer"
      data-theme-anchor="composer"
    >
      {queuedMessages.length ? (
        <section aria-label={queuedLabel} className="ef-chat__queued-messages">
          <div className="ef-chat__queued-messages-header">
            <span>{queuedLabel}</span>
            <span className="ef-chat__queued-messages-count">
              {queuedMessages.length}
            </span>
          </div>
          <ol className="ef-chat__queued-messages-list">
            {queuedMessages.map((queuedMessage) => (
              <li className="ef-chat__queued-message" key={queuedMessage.id}>
                <span className="ef-chat__queued-message-content">
                  {queuedMessage.input.content}
                </span>
                <span className="ef-chat__queued-message-actions">
                  {onEditQueuedMessage ? (
                    <button
                      aria-label={editQueuedLabel}
                      className="ef-chat__icon-button"
                      title={editQueuedLabel}
                      type="button"
                      onClick={() =>
                        onEditQueuedMessage(
                          queuedMessage.id,
                          queuedMessage.input.content
                        )
                      }
                    >
                      <Pencil
                        size={14}
                        style={{
                          width: "var(--agent-ui-composer-icon-size, 14px)",
                          height: "var(--agent-ui-composer-icon-size, 14px)",
                        }}
                      />
                    </button>
                  ) : null}
                  {onRemoveQueuedMessage ? (
                    <button
                      aria-label={removeQueuedLabel}
                      className="ef-chat__icon-button"
                      title={removeQueuedLabel}
                      type="button"
                      onClick={() => onRemoveQueuedMessage(queuedMessage.id)}
                    >
                      <X
                        size={15}
                        style={{
                          width: "var(--agent-ui-composer-icon-size, 15px)",
                          height: "var(--agent-ui-composer-icon-size, 15px)",
                        }}
                      />
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <div className="ef-chat__composer">
        {suggestionQuery && suggestionsOpen && flatSuggestions.length ? (
          <div
            className="ef-chat__suggestions"
            role="listbox"
            aria-label={
              flatSuggestions.every(item => item.kind === "command")
                ? inputSuggestionLabels.commands
                : flatSuggestions.every(item => item.kind === "skill")
                  ? inputSuggestionLabels.skills
                  : inputSuggestionLabels.commandsAndSkills
            }
          >
            {suggestionGroups.map(([group, items]) => (
              <section className="ef-chat__suggestion-group" key={group}>
                <div className="ef-chat__suggestion-heading">{group}</div>
                {items.map((item) => {
                  const index = flatSuggestions.indexOf(item);
                  return (
                    <button
                      className="ef-chat__suggestion"
                      data-active={index === activeSuggestion}
                      key={`${item.kind}:${item.name}`}
                      role="option"
                      aria-selected={index === activeSuggestion}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => chooseSuggestion(item)}
                    >
                      <span className="ef-chat__suggestion-name">
                        {item.kind === "command" ? "/" : "$"}
                        {item.name}
                      </span>
                      {item.description ? (
                        <span className="ef-chat__suggestion-description">
                          {item.description}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </section>
            ))}
          </div>
        ) : null}
        {pendingAttachments.length ? (
          <div className="ef-chat__composer-header">
            <div className="ef-chat__runtime-attachments ef-chat__runtime-attachments--pending">
              {pendingAttachments.map((attachment) => (
                <PendingAttachmentCard
                  key={attachment.id}
                  attachment={attachment}
                  downloadAttachment={attachmentDownloader}
                  onRemove={onRemoveAttachment}
                  removeLabel={removeAttachmentLabel}
                />
              ))}
            </div>
          </div>
        ) : null}
        {composerHeader ? (
          <div className="ef-chat__composer-header">{composerHeader}</div>
        ) : null}
        <div
          className="ef-chat__composer-editor"
          data-caret-at-end={composerCaretAtEnd ? "true" : undefined}
        >
          <div className="ef-chat__composer-overlay" aria-hidden="true">
            {composerOverlayParts(draft, inputSuggestions).map((part, index) =>
              part.displayName !== null ? (
                <span className="ef-chat__skill-token" key={index}>
                  <span className="ef-chat__skill-token-label">
                    {part.displayName}
                  </span>
                </span>
              ) : (
                <Fragment key={index}>{part.text}</Fragment>
              )
            )}
            {composerCaretAtEnd ? (
              <span className="ef-chat__composer-overlay-caret" />
            ) : null}
          </div>
          <textarea
            autoFocus={autoFocusComposer}
            key={composerKey ?? "composer"}
            ref={setComposerNode}
            className="ef-chat__textarea"
            data-theme-part="chat-input"
            data-theme-anchor="chat-input"
            disabled={disabledInput}
            placeholder={composerPlaceholder}
            value={draft}
            onChange={(event) => {
              updateComposerCaret(event.currentTarget);
              onDraftChange(event.target.value);
            }}
            onClick={(event) => updateComposerCaret(event.currentTarget)}
            onFocus={(event) => updateComposerCaret(event.currentTarget)}
            onBlur={() => setComposerCaretAtEnd(false)}
            onKeyUp={(event) => updateComposerCaret(event.currentTarget)}
            onSelect={(event) => updateComposerCaret(event.currentTarget)}
            onScroll={(event) => {
              const overlay = event.currentTarget.previousElementSibling;
              if (overlay instanceof HTMLElement)
                overlay.scrollTop = event.currentTarget.scrollTop;
            }}
            onPaste={handleComposerPaste}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (
                suggestionsOpen &&
                visibleSuggestions.length &&
                event.key === "ArrowDown"
              ) {
                event.preventDefault();
                setActiveSuggestion(
                  (index) => (index + 1) % flatSuggestions.length
                );
                return;
              }
              if (
                suggestionsOpen &&
                visibleSuggestions.length &&
                event.key === "ArrowUp"
              ) {
                event.preventDefault();
                setActiveSuggestion(
                  (index) =>
                    (index - 1 + flatSuggestions.length) %
                    flatSuggestions.length
                );
                return;
              }
              if (
                suggestionsOpen &&
                visibleSuggestions.length &&
                event.key === "Escape"
              ) {
                setSuggestionsDismissed(true);
                return;
              }
              if (
                suggestionsOpen &&
                visibleSuggestions.length &&
                event.key === "Enter" &&
                !event.shiftKey
              ) {
                event.preventDefault();
                chooseSuggestion(
                  flatSuggestions[activeSuggestion < 0 ? 0 : activeSuggestion]
                );
                return;
              }
              if (event.key === "Enter" && event.shiftKey) {
                event.preventDefault();
                onDraftChange(insertNewlineAtCursor(event.currentTarget));
                return;
              }
              const commandShortcut = event.metaKey || event.ctrlKey;
              if (sending && commandShortcut && event.key === "Enter") {
                event.preventDefault();
                if (canSteerWhileRunning && !disabledInput && !steerDisabled) {
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
            aria-keyshortcuts={
              sending && canSteerWhileRunning
                ? "Meta+Enter Control+Enter"
                : undefined
            }
          />
        </div>
        <div className="ef-chat__composer-row">
          <div className="ef-chat__composer-addon">
            {showAttachmentControl && onAttachFile ? (
              <>
                <input
                  className="ef-chat__runtime-attachment-input"
                  ref={attachmentFileInputRef}
                  type="file"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file && !disabledInput && !attachmentUploadPending)
                      void onAttachFile(file);
                  }}
                />
                <button
                  aria-label={attachLabel}
                  className="ef-chat__icon-button"
                  disabled={disabledInput || attachmentUploadPending}
                  title={attachmentUploadPending ? uploadingLabel : attachLabel}
                  type="button"
                  onClick={() => attachmentFileInputRef.current?.click()}
                >
                  <Paperclip
                    size={16}
                    style={{
                      width: "var(--agent-ui-composer-icon-size, 16px)",
                      height: "var(--agent-ui-composer-icon-size, 16px)",
                    }}
                  />
                </button>
              </>
            ) : null}
            {footerAddon}
          </div>
          <div className="ef-chat__composer-actions">
            {sending && showStop ? (
              <button
                aria-label={stopLabel}
                className="ef-chat__button ef-chat__button_send ef-chat__button--danger"
                title={stopLabel}
                type="button"
                onClick={handleStopSubmit}
              >
                <Square
                  size={14}
                  style={{
                    width: "var(--agent-ui-composer-icon-size, 14px)",
                    height: "var(--agent-ui-composer-icon-size, 14px)",
                  }}
                />
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
                <Send
                  size={15}
                  style={{
                    width: "var(--agent-ui-composer-icon-size, 15px)",
                    height: "var(--agent-ui-composer-icon-size, 15px)",
                  }}
                />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
