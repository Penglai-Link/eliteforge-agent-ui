import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  filterSuggestions,
  insertSuggestion,
  type ComposerAttachment,
  type ComposerQueuedMessage,
  type ComposerSubmitMode,
  type ComposerSuggestion,
  type ComposerSuggestionLabels,
} from "@personai/agent-ui-composer-core";
import {
  chatMetaTextStyle,
  resolveChatTheme,
  type ChatReactNativeTheme,
  type ChatStyle,
} from "./theme";

/** A clipboard entry normalized by the host. RN has no browser `File`. */
export interface ComposerClipboardFile {
  name: string;
  mimeType?: string | null;
  size?: number | null;
  /** Local `file://`/`content://` URI, or a remote URL. */
  uri?: string | null;
  /** Optional base64 payload when the host uploads directly. */
  base64?: string | null;
}

/**
 * Native clipboard bridge. React Native exposes no paste event, so the host
 * supplies this adapter and the composer renders an explicit paste control.
 */
export interface ComposerClipboardAdapter {
  readFile: () => Promise<ComposerClipboardFile | null>;
}

/** Per-slot style overrides; every key accepts a React Native style bag. */
export interface ComposerStyles {
  root: ChatStyle;
  queuedSection: ChatStyle;
  queuedHeader: ChatStyle;
  queuedRow: ChatStyle;
  queuedText: ChatStyle;
  queuedActions: ChatStyle;
  suggestionList: ChatStyle;
  suggestionRow: ChatStyle;
  suggestionName: ChatStyle;
  suggestionDescription: ChatStyle;
  attachments: ChatStyle;
  attachmentCard: ChatStyle;
  attachmentImage: ChatStyle;
  attachmentText: ChatStyle;
  attachmentRemove: ChatStyle;
  editor: ChatStyle;
  input: ChatStyle;
  disabledReason: ChatStyle;
  toolbar: ChatStyle;
  toolbarGroup: ChatStyle;
  iconButton: ChatStyle;
  sendButton: ChatStyle;
  stopButton: ChatStyle;
  modeButton: ChatStyle;
  modeLabel: ChatStyle;
  hint: ChatStyle;
}

export interface ComposerProps {
  draft?: string;
  /** @deprecated Use `draft`; kept for hosts migrating from preview.24. */
  value?: string;
  onDraftChange?: (value: string) => void;
  /** @deprecated Use `onDraftChange`. */
  onChangeText?: (value: string) => void;
  onSend: (mode?: ComposerSubmitMode) => void;
  onStop?: () => void;
  sending?: boolean;
  showStop?: boolean;
  sendDisabled?: boolean;
  disabledInput?: boolean;
  /** @deprecated Use `disabledInput`. */
  disabled?: boolean;
  disabledInputReason?: string;
  inputPlaceholder?: string;
  /** @deprecated Use `inputPlaceholder`. */
  placeholder?: string;
  maxLength?: number;
  autoFocusComposer?: boolean;
  /** @deprecated Use `autoFocusComposer`. */
  autoFocus?: boolean;
  composerKey?: string;
  pendingAttachments?: ComposerAttachment[];
  attachmentUploadPending?: boolean;
  showAttachmentControl?: boolean;
  attachLabel?: string;
  uploadingLabel?: string;
  pasteLabel?: string;
  pastingLabel?: string;
  clipboardEmptyLabel?: string;
  removeAttachmentLabel?: (name: string) => string;
  onPickAttachment?: () => void | Promise<void>;
  onRemoveAttachment?: (id: string) => void;
  /** Explicit clipboard bridge; renders a paste control when present. */
  clipboard?: ComposerClipboardAdapter;
  onPasteAttachment?: (
    file: ComposerClipboardFile,
  ) => void | Promise<void>;
  queuedMessages?: ComposerQueuedMessage[];
  queuedLabel?: string;
  editQueuedLabel?: string;
  removeQueuedLabel?: string;
  steerQueuedLabel?: string;
  reorderQueuedLabel?: string;
  onEditQueuedMessage?: (id: string, content: string) => void;
  onRemoveQueuedMessage?: (id: string) => void;
  onSteerQueuedMessage?: (id: string) => void;
  onReorderQueuedMessage?: (sourceId: string, targetId: string) => void;
  inputSuggestions?: ComposerSuggestion[];
  skillSuggestionTriggers?: Array<"$" | "/">;
  inputSuggestionLabels?: ComposerSuggestionLabels;
  runningSubmitModes?: Array<"queue" | "steer">;
  showRunningModeControls?: boolean;
  queueLabel?: string;
  steerLabel?: string;
  queueDisabled?: boolean;
  steerDisabled?: boolean;
  /** Extension slot above the input (mirrors web `composerHeader`). */
  composerHeader?: ReactNode;
  /** @deprecated Use `composerHeader`. */
  header?: ReactNode;
  /** Extension slot in the toolbar, before the actions. */
  footerAddon?: ReactNode;
  sendLabel?: string;
  stopLabel?: string;
  renderAttachmentControl?: (state: {
    disabled: boolean;
    uploading: boolean;
    onPress: () => void;
  }) => ReactNode;
  renderAttachment?: (attachment: ComposerAttachment) => ReactNode;
  renderSuggestion?: (suggestion: ComposerSuggestion) => ReactNode;
  theme?: Partial<ChatReactNativeTheme>;
  style?: ChatStyle;
  styles?: Partial<ComposerStyles>;
  testID?: string;
}

function attachmentName(attachment: ComposerAttachment): string {
  return (
    attachment.fileName ||
    attachment.title ||
    attachment.summary ||
    attachment.id
  );
}

function attachmentImage(attachment: ComposerAttachment): string | null {
  if (attachment.imageUrl) return attachment.imageUrl;
  const uri = attachment.metadata?.uri ?? attachment.metadata?.url;
  return typeof uri === "string" ? uri : null;
}

function sizeLabel(size: number | null | undefined): string {
  if (!size || !Number.isFinite(size)) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Native composer aligned with `composer-react`/`composer-vue`: the same
 * draft/send/stop contract, attachments, queued messages, suggestions,
 * header/footer slots and theme tokens. Clipboard access is injected because
 * React Native has no paste event.
 */
export function Composer({
  draft,
  value,
  onDraftChange,
  onChangeText,
  onSend,
  onStop,
  sending = false,
  showStop = true,
  sendDisabled = false,
  disabledInput,
  disabled,
  disabledInputReason,
  inputPlaceholder = "Message…",
  placeholder,
  maxLength,
  autoFocusComposer,
  autoFocus,
  composerKey,
  pendingAttachments = [],
  attachmentUploadPending = false,
  showAttachmentControl = true,
  attachLabel = "Attach file",
  uploadingLabel = "Uploading…",
  pasteLabel = "Paste image or file",
  pastingLabel = "Reading clipboard…",
  clipboardEmptyLabel = "No readable image or file in the clipboard.",
  removeAttachmentLabel = (name) => `Remove ${name}`,
  onPickAttachment,
  onRemoveAttachment,
  clipboard,
  onPasteAttachment,
  queuedMessages = [],
  queuedLabel = "Queued",
  editQueuedLabel = "Edit",
  removeQueuedLabel = "Remove",
  steerQueuedLabel = "Steer",
  reorderQueuedLabel = "Reorder",
  onEditQueuedMessage,
  onRemoveQueuedMessage,
  onSteerQueuedMessage,
  onReorderQueuedMessage,
  inputSuggestions = [],
  skillSuggestionTriggers = ["$", "/"],
  inputSuggestionLabels,
  runningSubmitModes = [],
  showRunningModeControls = true,
  queueLabel = "Queue",
  steerLabel = "Steer",
  queueDisabled = false,
  steerDisabled = false,
  composerHeader,
  header,
  footerAddon,
  sendLabel = "Send",
  stopLabel = "Stop",
  renderAttachmentControl,
  renderAttachment,
  renderSuggestion,
  theme: themeOverride,
  style,
  styles: styleOverrides,
  testID,
}: ComposerProps): ReactNode {
  const theme = resolveChatTheme(themeOverride);
  const styles = styleOverrides ?? {};
  const text = draft ?? value ?? "";
  const updateDraft = onDraftChange ?? onChangeText ?? (() => undefined);
  const inputDisabled = Boolean(disabledInput ?? disabled);
  const placeholderText = placeholder ?? inputPlaceholder;
  const [clipboardBusy, setClipboardBusy] = useState(false);
  const longPressRef = useRef(false);
  const [hint, setHint] = useState<string | null>(null);
  const suggestions = useMemo(
    () => filterSuggestions(text, inputSuggestions, skillSuggestionTriggers),
    [inputSuggestions, skillSuggestionTriggers, text],
  );
  const canSubmit = !inputDisabled && text.trim().length > 0;
  const canSend = canSubmit && !sending && !sendDisabled;
  const canQueue = canSubmit && !queueDisabled;
  const canSteer = canSubmit && !steerDisabled;
  const uploading = attachmentUploadPending || clipboardBusy;

  async function readClipboard() {
    if (!clipboard || !onPasteAttachment || inputDisabled || clipboardBusy) return;
    setClipboardBusy(true);
    setHint(null);
    try {
      const file = await clipboard.readFile();
      if (file) await onPasteAttachment(file);
      else setHint(clipboardEmptyLabel);
    } catch (error) {
      setHint(error instanceof Error ? error.message : String(error));
    } finally {
      setClipboardBusy(false);
    }
  }

  function pickSuggestion(suggestion: ComposerSuggestion) {
    const next = insertSuggestion(text, suggestion);
    if (next) updateDraft(next.value);
  }

  function moveQueued(id: string, direction: -1 | 1) {
    if (!onReorderQueuedMessage) return;
    const index = queuedMessages.findIndex((item) => item.id === id);
    const target = queuedMessages[index + direction];
    if (target) onReorderQueuedMessage(id, target.id);
  }

  const base = {
    backgroundColor: theme.panelColor,
    borderTopColor: theme.borderColor,
    borderTopWidth: 1,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  };

  return (
    <View style={[base, styles.root, style]} testID={testID}>
      {queuedMessages.length ? (
        <View
          accessibilityLabel={queuedLabel}
          style={[
            {
              borderColor: theme.borderColor,
              borderRadius: theme.borderRadius,
              borderWidth: 1,
              gap: 2,
              padding: 8,
            },
            styles.queuedSection,
          ]}
        >
          <View
            style={[
              { flexDirection: "row", justifyContent: "space-between" },
              styles.queuedHeader,
            ]}
          >
            <Text style={chatMetaTextStyle(theme)}>{queuedLabel}</Text>
            <Text style={chatMetaTextStyle(theme)}>{queuedMessages.length}</Text>
          </View>
          {queuedMessages.map((item) => (
            <View
              key={item.id}
              style={[
                {
                  alignItems: "center",
                  flexDirection: "row",
                  gap: 6,
                  minHeight: 34,
                },
                styles.queuedRow,
              ]}
            >
              <Text
                numberOfLines={2}
                style={[
                  { color: theme.textColor, flex: 1, fontSize: 12 },
                  styles.queuedText,
                ]}
              >
                {item.input.content}
              </Text>
              <View style={[{ flexDirection: "row", gap: 2 }, styles.queuedActions]}>
                {onReorderQueuedMessage && queuedMessages.length > 1 ? (
                  <>
                    <Pressable
                      accessibilityLabel={`${reorderQueuedLabel} up`}
                      hitSlop={6}
                      onPress={() => moveQueued(item.id, -1)}
                      style={[iconStyle(theme), styles.iconButton]}
                    >
                      <Text style={iconGlyph(theme)}>↑</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`${reorderQueuedLabel} down`}
                      hitSlop={6}
                      onPress={() => moveQueued(item.id, 1)}
                      style={[iconStyle(theme), styles.iconButton]}
                    >
                      <Text style={iconGlyph(theme)}>↓</Text>
                    </Pressable>
                  </>
                ) : null}
                {onSteerQueuedMessage && sending ? (
                  <Pressable
                    accessibilityLabel={steerQueuedLabel}
                    hitSlop={6}
                    onPress={() => onSteerQueuedMessage(item.id)}
                    style={[iconStyle(theme), styles.iconButton]}
                  >
                    <Text style={iconGlyph(theme)}>↗</Text>
                  </Pressable>
                ) : null}
                {onEditQueuedMessage ? (
                  <Pressable
                    accessibilityLabel={editQueuedLabel}
                    hitSlop={6}
                    onPress={() =>
                      onEditQueuedMessage(item.id, item.input.content)
                    }
                    style={[iconStyle(theme), styles.iconButton]}
                  >
                    <Text style={iconGlyph(theme)}>✎</Text>
                  </Pressable>
                ) : null}
                {onRemoveQueuedMessage ? (
                  <Pressable
                    accessibilityLabel={removeQueuedLabel}
                    hitSlop={6}
                    onPress={() => onRemoveQueuedMessage(item.id)}
                    style={[iconStyle(theme), styles.iconButton]}
                  >
                    <Text style={iconGlyph(theme)}>×</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {suggestions.length ? (
        <View
          accessibilityLabel={
            inputSuggestionLabels?.commandsAndSkills ?? "Suggestions"
          }
          style={[
            {
              backgroundColor: theme.surfaceColor,
              borderColor: theme.borderColor,
              borderRadius: theme.borderRadius,
              borderWidth: 1,
              maxHeight: 190,
              overflow: "hidden",
            },
            styles.suggestionList,
          ]}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            {suggestions.map((suggestion) =>
              renderSuggestion ? (
                <View key={`${suggestion.kind}:${suggestion.name}`}>
                  {renderSuggestion(suggestion)}
                </View>
              ) : (
                <Pressable
                  key={`${suggestion.kind}:${suggestion.name}`}
                  accessibilityRole="button"
                  onPress={() => pickSuggestion(suggestion)}
                  style={[
                    {
                      borderTopColor: theme.borderColor,
                      borderTopWidth: 1,
                      gap: 2,
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                    },
                    styles.suggestionRow,
                  ]}
                >
                  <Text
                    style={[
                      { color: theme.textColor, fontSize: 13, fontWeight: "600" },
                      styles.suggestionName,
                    ]}
                  >
                    {(suggestion.kind === "command" ? "/" : "$") +
                      suggestion.name}
                  </Text>
                  {suggestion.description ? (
                    <Text
                      numberOfLines={1}
                      style={[
                        chatMetaTextStyle(theme),
                        { fontSize: 11 },
                        styles.suggestionDescription,
                      ]}
                    >
                      {suggestion.description}
                    </Text>
                  ) : null}
                </Pressable>
              ),
            )}
          </ScrollView>
        </View>
      ) : null}

      {pendingAttachments.length ? (
        <ScrollView
          horizontal
          contentContainerStyle={[
            { gap: 6, paddingVertical: 2 },
            styles.attachments,
          ]}
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
        >
          {pendingAttachments.map((attachment) =>
            renderAttachment ? (
              <View key={attachment.id}>{renderAttachment(attachment)}</View>
            ) : (
              <View
                key={attachment.id}
                style={[
                  {
                    alignItems: "center",
                    backgroundColor: theme.surfaceColor,
                    borderColor: theme.borderColor,
                    borderRadius: theme.borderRadius,
                    borderWidth: 1,
                    flexDirection: "row",
                    gap: 6,
                    maxWidth: 220,
                    padding: 6,
                  },
                  styles.attachmentCard,
                ]}
              >
                {attachmentImage(attachment) ? (
                  <Image
                    source={{ uri: attachmentImage(attachment)! }}
                    style={[
                      {
                        borderRadius: 4,
                        height: 32,
                        width: 32,
                      },
                      styles.attachmentImage,
                    ]}
                  />
                ) : (
                  <Text style={{ color: theme.mutedTextColor, fontSize: 16 }}>▤</Text>
                )}
                <View style={{ flexShrink: 1, gap: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={[
                      { color: theme.textColor, fontSize: 12, fontWeight: "600" },
                      styles.attachmentText,
                    ]}
                  >
                    {attachmentName(attachment)}
                  </Text>
                  {attachment.metadata?.uploading === true ? (
                    <Text style={[chatMetaTextStyle(theme), { fontSize: 10 }]}>
                      {uploadingLabel}
                    </Text>
                  ) : attachment.byteSize ? (
                    <Text style={[chatMetaTextStyle(theme), { fontSize: 10 }]}>
                      {sizeLabel(attachment.byteSize)}
                    </Text>
                  ) : null}
                </View>
                {onRemoveAttachment ? (
                  <Pressable
                    accessibilityLabel={removeAttachmentLabel(
                      attachmentName(attachment),
                    )}
                    hitSlop={6}
                    onPress={() => onRemoveAttachment(attachment.id)}
                    style={[iconStyle(theme), styles.attachmentRemove]}
                  >
                    <Text style={iconGlyph(theme)}>×</Text>
                  </Pressable>
                ) : null}
              </View>
            ),
          )}
        </ScrollView>
      ) : null}

      {composerHeader ?? header}

      <View
        style={[
          {
            backgroundColor: theme.assistantBubbleColor,
            borderColor: theme.borderColor,
            borderRadius: theme.borderRadius,
            borderWidth: 1,
            gap: 2,
            paddingHorizontal: 6,
            paddingVertical: 4,
          },
          styles.editor,
        ]}
      >
        {inputDisabled && disabledInputReason ? (
          <View
            accessibilityLiveRegion="polite"
            style={[
              {
                alignItems: "center",
                flexDirection: "row",
                gap: 4,
                paddingHorizontal: 4,
                paddingTop: 2,
              },
              styles.disabledReason,
            ]}
          >
            <Text style={{ color: theme.mutedTextColor, fontSize: 11 }}>🔒</Text>
            <Text style={[chatMetaTextStyle(theme), { flex: 1, fontSize: 11 }]}>
              {disabledInputReason}
            </Text>
          </View>
        ) : null}
        <TextInput
          accessibilityLabel={placeholderText}
          autoFocus={autoFocusComposer ?? autoFocus}
          editable={!inputDisabled}
          key={composerKey}
          maxLength={maxLength}
          multiline
          onChangeText={updateDraft}
          placeholder={placeholderText}
          placeholderTextColor={theme.mutedTextColor}
          style={[
            {
              color: theme.textColor,
              fontSize: 15,
              lineHeight: 21,
              maxHeight: 132,
              minHeight: 38,
              paddingHorizontal: 4,
              paddingVertical: 4,
              textAlignVertical: "top",
            },
            styles.input,
          ]}
          value={text}
        />
        <View
          style={[
            { alignItems: "center", flexDirection: "row", gap: 2 },
            styles.toolbar,
          ]}
        >
          <View style={[{ flexDirection: "row", gap: 2 }, styles.toolbarGroup]}>
            {showAttachmentControl && (onPickAttachment || clipboard) ? (
              renderAttachmentControl ? (
                renderAttachmentControl({
                  disabled: inputDisabled || uploading,
                  uploading,
                  onPress: () => {
                    if (onPickAttachment) void onPickAttachment();
                    else void readClipboard();
                  },
                })
              ) : (
                <Pressable
                  accessibilityHint={
                    clipboard && onPasteAttachment
                      ? pasteLabel
                      : undefined
                  }
                  accessibilityLabel={
                    attachmentUploadPending ? uploadingLabel : attachLabel
                  }
                  accessibilityState={{ disabled: inputDisabled || uploading }}
                  disabled={inputDisabled || uploading}
                  onLongPress={
                    clipboard && onPasteAttachment
                      ? () => {
                          longPressRef.current = true;
                          void readClipboard();
                        }
                      : undefined
                  }
                  onPress={() => {
                    if (longPressRef.current) {
                      longPressRef.current = false;
                      return;
                    }
                    if (onPickAttachment) void onPickAttachment();
                    else if (clipboard) void readClipboard();
                  }}
                  style={[iconStyle(theme), styles.iconButton]}
                >
                  <Text style={iconGlyph(theme)}>+</Text>
                </Pressable>
              )
            ) : null}
            {footerAddon}
          </View>
          <View style={{ flex: 1 }} />
          <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
            {sending && showRunningModeControls
              ? runningSubmitModes.map((mode) => {
                  const disabled =
                    inputDisabled ||
                    uploading ||
                    (mode === "queue" ? !canQueue : !canSteer);
                  const label = mode === "queue" ? queueLabel : steerLabel;
                  return (
                    <Pressable
                      key={mode}
                      accessibilityLabel={label}
                      accessibilityState={{ disabled }}
                      disabled={disabled}
                      onPress={() => onSend(mode)}
                      style={[
                        {
                          borderColor: theme.borderColor,
                          borderRadius: 999,
                          borderWidth: 1,
                          opacity: disabled ? 0.45 : 1,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                        },
                        styles.modeButton,
                      ]}
                    >
                      <Text
                        style={[
                          { color: theme.textColor, fontSize: 12, fontWeight: "600" },
                          styles.modeLabel,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })
              : null}
            {sending && showStop && onStop ? (
              <Pressable
                accessibilityLabel={stopLabel}
                onPress={onStop}
                style={[
                  {
                    alignItems: "center",
                    backgroundColor: theme.dangerColor,
                    borderRadius: 999,
                    height: 34,
                    justifyContent: "center",
                    width: 34,
                  },
                  styles.stopButton,
                ]}
              >
                <Text style={{ color: theme.primaryTextColor, fontSize: 12 }}>■</Text>
              </Pressable>
            ) : !sending ? (
              <Pressable
                accessibilityLabel={sendLabel}
                accessibilityState={{ disabled: !canSend }}
                disabled={!canSend}
                onPress={() => onSend("send")}
                style={[
                  {
                    alignItems: "center",
                    backgroundColor: theme.primaryColor,
                    borderRadius: 999,
                    height: 34,
                    justifyContent: "center",
                    opacity: canSend ? 1 : 0.45,
                    width: 34,
                  },
                  styles.sendButton,
                ]}
              >
                <Text style={{ color: theme.primaryTextColor, fontSize: 16 }}>↑</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
      {hint ? (
        <Text style={[chatMetaTextStyle(theme), { fontSize: 10 }, styles.hint]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function iconStyle(theme: ChatReactNativeTheme): ChatStyle {
  return {
    alignItems: "center",
    height: 30,
    justifyContent: "center",
    width: 30,
  };
}

function iconGlyph(theme: ChatReactNativeTheme): ChatStyle {
  return { color: theme.mutedTextColor, fontSize: 15, lineHeight: 18 };
}