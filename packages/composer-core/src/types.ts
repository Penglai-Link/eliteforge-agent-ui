export type ComposerAttachmentKind = "file" | "image" | "inspection";

export interface ComposerAttachment {
  id: string;
  kind: ComposerAttachmentKind;
  title?: string | null;
  imageUrl?: string | null;
  resourceId?: string | null;
  fileName?: string | null;
  contentType?: string | null;
  byteSize?: number | null;
  metadata: Record<string, unknown>;
  summary: string;
}

export interface ComposerSuggestion {
  kind: "command" | "skill";
  name: string;
  /** Human-readable name shown for a selected skill token. */
  displayName?: string;
  description?: string;
  /** Optional grouping label, such as a command category. */
  category?: string;
}

export interface ComposerSuggestionLabels {
  commands: string;
  skills: string;
  commandsAndSkills: string;
}

export type ComposerRunningSubmitMode = "steer" | "queue";
export type ComposerSubmitMode = "send" | ComposerRunningSubmitMode;

/** Only presentation fields are required; a host may carry additional queue metadata. */
export interface ComposerQueuedMessage {
  id: string;
  input: { content: string };
}

export interface ComposerProps {
  draft: string;
  autoFocusComposer?: boolean;
  /** Changing this identity resets and optionally focuses the editor. */
  composerKey?: string;
  disabledInput?: boolean;
  /** Visible explanation shown while input is disabled, without replacing the draft. */
  disabledInputReason?: string;
  inputPlaceholder?: string;
  queuedInputPlaceholder?: string;
  steeringInputPlaceholder?: string;
  inputSuggestions?: ComposerSuggestion[];
  /** Defaults to both triggers. Use ["$"] to reserve slash for commands. */
  skillSuggestionTriggers?: Array<"$" | "/">;
  inputSuggestionLabels?: ComposerSuggestionLabels;
  queuedLabel?: string;
  queuedMessages?: ComposerQueuedMessage[];
  runningSubmitModes?: ComposerRunningSubmitMode[];
  /** Keyboard action for Enter while a run is active; the other action uses Cmd/Ctrl+Enter. */
  runningEnterSubmitMode?: ComposerRunningSubmitMode;
  queueDisabled?: boolean;
  steerDisabled?: boolean;
  queuedSteerDisabled?: boolean;
  sendDisabled?: boolean;
  sending?: boolean;
  sendLabel?: string;
  showStop?: boolean;
  stopLabel?: string;
  pendingAttachments?: ComposerAttachment[];
  attachmentDownloader?: (attachment: ComposerAttachment) => Promise<Blob>;
  showAttachmentControl?: boolean;
  attachmentUploadPending?: boolean;
  attachLabel?: string;
  uploadingLabel?: string;
  removeAttachmentLabel?: (name: string) => string;
  /** Drag handle label; Up/Down keys also reorder the focused message. */
  reorderQueuedLabel?: string;
  editQueuedLabel?: string;
  removeQueuedLabel?: string;
  steerQueuedLabel?: string;
}
