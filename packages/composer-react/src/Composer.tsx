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
import { ComposerDisabledContext } from "./disabledState";
import { FileText, GripVertical, LockKeyhole, Plus, Pencil, Send, Square, X } from "lucide-react";
import {
  attachmentLabel,
  attachmentTypeLabel,
  isImageAttachment,
  suggestionQuery as getSuggestionQuery,
  filterSuggestions,
  insertSuggestion,
  composerOverlayParts,
  insertNewlineAtCursor,
  pastedFiles,
  pasteKeepsText,
  startQueuedMessageDrag,
  type ComposerProps,
  type ComposerAttachment,
  type ComposerSuggestion as ChatInputSuggestion,
  type ComposerSubmitMode as ChatSubmitMode,
} from "@personai/agent-ui-composer-core";

export interface ComposerReactProps extends ComposerProps {
  composerRef?: Ref<HTMLTextAreaElement>;
  composerHeader?: ReactNode;
  footerAddon?: ReactNode;
  /** Customize the attachment trigger while retaining file selection and upload state. */
  renderAttachmentControl?: (control: { disabled: boolean; uploading: boolean; onClick: () => void }) => ReactNode;
  onDraftChange: (value: string) => void;
  onSend: (mode?: ChatSubmitMode) => void;
  onStop?: () => void;
  onPasteAttachment?: (file: File) => void | Promise<void>;
  onAttachFile?: (file: File) => void | Promise<void>;
  onRemoveAttachment?: (id: string) => void;
  onEditQueuedMessage?: (id: string, content: string) => void;
  onRemoveQueuedMessage?: (id: string) => void;
  onSteerQueuedMessage?: (id: string) => void;
  onReorderQueuedMessage?: (sourceId: string, targetId: string) => void;
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
  disabledInputReason,
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
  runningEnterSubmitMode = "queue",
  queueDisabled = false,
  steerDisabled = false,
  queuedSteerDisabled = false,
  sendDisabled = false,
  sendLabel = "Send",
  stopLabel = "Stop",
  showStop = true,
  queuedMessages = [],
  queuedLabel = "Queued",
  onEditQueuedMessage,
  onRemoveQueuedMessage,
  onSteerQueuedMessage,
  onReorderQueuedMessage,
  reorderQueuedLabel = "Drag to reorder; use Up/Down keys to move",
  editQueuedLabel = "Edit queued message",
  removeQueuedLabel = "Remove queued message",
  steerQueuedLabel = "Steer queued message",
  pendingAttachments = [],
  attachmentDownloader,
  onRemoveAttachment,
  onAttachFile,
  renderAttachmentControl,
  showAttachmentControl = false,
  attachmentUploadPending = false,
  attachLabel = "Attach file",
  uploadingLabel = "Uploading attachment",
  removeAttachmentLabel = (name) => `Remove ${name}`,
}: ComposerReactProps) {
  const attachmentFileInputRef = useRef<HTMLInputElement | null>(null);
  const draggedQueuedId = useRef<string | null>(null);
  const cancelQueueDragRef = useRef<(() => void) | undefined>(undefined);
  const reorderQueueRef = useRef(onReorderQueuedMessage);
  reorderQueueRef.current = onReorderQueuedMessage;
  const queueReorderEnabled = Boolean(onReorderQueuedMessage);
  useEffect(() => () => cancelQueueDragRef.current?.(), [composerKey, queueReorderEnabled]);
  const composerElementRef = useRef<HTMLTextAreaElement | null>(null);
  const [composerHasSelection, setComposerHasSelection] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const suggestionQuery = useMemo(() => {
    return getSuggestionQuery(draft);
  }, [draft]);
  const visibleSuggestions = useMemo(() => {
    return filterSuggestions(draft, inputSuggestions, skillSuggestionTriggers);
  }, [draft, inputSuggestions, skillSuggestionTriggers, suggestionQuery]);
  const overlayParts = useMemo(() => composerOverlayParts(draft, inputSuggestions), [draft, inputSuggestions]);
  const hasTokens = overlayParts.some((part) => part.displayName !== null);
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
      setComposerHasSelection(false);
    });
  }
  function updateComposerSelection(textarea: HTMLTextAreaElement) {
    setComposerHasSelection(textarea.selectionStart !== textarea.selectionEnd);
  }
  const canQueueWhileRunning = runningSubmitModes.includes("queue");
  const canSteerWhileRunning = runningSubmitModes.includes("steer");
  const enterSubmitMode: ChatSubmitMode | null = !sending
    ? "send"
    : runningSubmitModes.includes(runningEnterSubmitMode)
      ? runningEnterSubmitMode
      : canQueueWhileRunning ? "queue" : canSteerWhileRunning ? "steer" : null;
  const shortcutSubmitMode: ChatSubmitMode | null = sending
    ? runningSubmitModes.find(mode => mode !== enterSubmitMode) ?? null
    : null;
  const submitDisabled = (mode: ChatSubmitMode) =>
    disabledInput || (mode === "queue" ? queueDisabled : mode === "steer" ? steerDisabled : Boolean(sendDisabled));
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
  const autoFocusedComposerKeyRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!autoFocusComposer || disabledInput) return;
    const key = composerKey ?? "composer";
    if (autoFocusedComposerKeyRef.current === key) return;
    composerElementRef.current?.focus({ preventScroll: true });
    if (document.activeElement === composerElementRef.current) {
      autoFocusedComposerKeyRef.current = key;
    }
  }, [autoFocusComposer, composerKey, disabledInput]);

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
    const files = pastedFiles(event.clipboardData);
    if (!files.length) return;
    // Mixed clipboard payloads still insert their text; attachments are added for every file.
    if (!pasteKeepsText(event.clipboardData)) event.preventDefault();
    for (const file of files) void onPasteAttachment(file);
  }

  function handleStopSubmit() {
    if (onStop) {
      onStop();
      return;
    }
    onSend("send");
  }

  return (
    <ComposerDisabledContext.Provider value={disabledInput}>
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
              <li className="ef-chat__queued-message" key={queuedMessage.id}
                data-queued-id={queuedMessage.id}
                draggable={Boolean(onReorderQueuedMessage)}
                onDragStart={(event) => {
                  draggedQueuedId.current = queuedMessage.id;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", queuedMessage.id);
                }}
                onDragOver={(event) => {
                  if (draggedQueuedId.current && draggedQueuedId.current !== queuedMessage.id) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceId = draggedQueuedId.current;
                  draggedQueuedId.current = null;
                  if (sourceId && sourceId !== queuedMessage.id) onReorderQueuedMessage?.(sourceId, queuedMessage.id);
                }}
                onDragEnd={() => { draggedQueuedId.current = null; }}>
                {onReorderQueuedMessage && queuedMessages.length > 1 ? (
                  <button type="button" className="ef-chat__icon-button ef-chat__queue-drag-handle"
                    aria-label={reorderQueuedLabel} title={reorderQueuedLabel}
                    onPointerDown={event => {
                      const row = event.currentTarget.closest<HTMLElement>(".ef-chat__queued-message");
                      if (!row) return;
                      cancelQueueDragRef.current?.();
                      cancelQueueDragRef.current = startQueuedMessageDrag(event.nativeEvent, row,
                        (sourceId, targetId) => reorderQueueRef.current?.(sourceId, targetId));
                    }}
                    onKeyDown={event => {
                      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                      event.preventDefault();
                      const index = queuedMessages.findIndex(item => item.id === queuedMessage.id);
                      const target = queuedMessages[index + (event.key === "ArrowUp" ? -1 : 1)];
                      if (target) onReorderQueuedMessage(queuedMessage.id, target.id);
                    }}>
                    <GripVertical size={14} aria-hidden="true" />
                  </button>
                ) : null}
                <span className="ef-chat__queued-message-content">
                  {queuedMessage.input.content}
                </span>
                <span className="ef-chat__queued-message-actions">
                  {onSteerQueuedMessage && canSteerWhileRunning ? (
                    <button aria-label={steerQueuedLabel} className="ef-chat__icon-button" title={steerQueuedLabel} type="button"
                      disabled={queuedSteerDisabled} onClick={() => onSteerQueuedMessage(queuedMessage.id)}>
                      <Send size={14} />
                    </button>
                  ) : null}
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
      <div className="ef-chat__composer" data-input-disabled={disabledInput ? "true" : undefined}>
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
          data-input-locked={disabledInput && disabledInputReason ? "true" : undefined}
          data-has-tokens={hasTokens && !composerHasSelection ? "true" : undefined}
        >
        {disabledInput && disabledInputReason ? (
          <div className="ef-chat__composer-disabled-reason" role="status">
            <LockKeyhole size={14} aria-hidden="true" />
            <span>{disabledInputReason}</span>
          </div>
        ) : null}
          <div className="ef-chat__composer-overlay" aria-hidden="true">
            {overlayParts.map((part, index) =>
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
          </div>
          <textarea
            autoFocus={autoFocusComposer}
            key={composerKey ?? "composer"}
            ref={setComposerNode}
            className="ef-chat__textarea"
            data-theme-part="chat-input"
            data-theme-anchor="chat-input"
            disabled={disabledInput}
            aria-description={disabledInput ? disabledInputReason : undefined}
            placeholder={composerPlaceholder}
            value={draft}
            onChange={(event) => {
              updateComposerSelection(event.currentTarget);
              onDraftChange(event.target.value);
            }}
            onClick={(event) => updateComposerSelection(event.currentTarget)}
            onFocus={(event) => updateComposerSelection(event.currentTarget)}
            onBlur={() => setComposerHasSelection(false)}
            onKeyUp={(event) => updateComposerSelection(event.currentTarget)}
            onSelect={(event) => updateComposerSelection(event.currentTarget)}
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
                (event.key === "Enter" || (event.key === "Tab" && !event.altKey)) &&
                !event.shiftKey && !event.metaKey && !event.ctrlKey
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
                if (shortcutSubmitMode && !submitDisabled(shortcutSubmitMode)) onSend(shortcutSubmitMode);
                return;
              }
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (enterSubmitMode && !submitDisabled(enterSubmitMode)) onSend(enterSubmitMode);
            }}
            aria-keyshortcuts={
              shortcutSubmitMode
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
                {renderAttachmentControl ? renderAttachmentControl({
                  disabled: Boolean(disabledInput || attachmentUploadPending),
                  uploading: attachmentUploadPending,
                  onClick: () => attachmentFileInputRef.current?.click(),
                }) : <button
                  aria-label={attachLabel}
                  className="ef-chat__icon-button"
                  disabled={disabledInput || attachmentUploadPending}
                  title={attachmentUploadPending ? uploadingLabel : attachLabel}
                  type="button"
                  onClick={() => attachmentFileInputRef.current?.click()}
                >
                  <Plus
                    size={16}
                    style={{
                      width: "var(--agent-ui-composer-icon-size, 16px)",
                      height: "var(--agent-ui-composer-icon-size, 16px)",
                    }}
                  />
                </button>}
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
    </ComposerDisabledContext.Provider>
  );
}
