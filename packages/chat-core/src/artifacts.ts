/**
 * Flat delivered-file list attached to a finished assistant message.
 *
 * The host has already merged, deduped and resolved per-client actions. The UI
 * never sees file paths or a `source` object: it renders `items` in order and
 * only exposes the actions listed on each item. Unknown protocol versions and
 * malformed payloads render nothing instead of throwing.
 */
export const ARTIFACTS_VERSION = "v1" as const;

/** Items shown before the list folds behind an "all N" toggle. */
export const ARTIFACT_COLLAPSED_COUNT = 4;

export type ChatArtifactAction = "preview" | "open" | "reveal" | "save";

const ARTIFACT_ACTIONS: readonly ChatArtifactAction[] = [
  "preview",
  "open",
  "reveal",
  "save",
];

export interface ChatArtifactItem {
  id: string;
  display: string;
  description?: string;
  mediaType?: string;
  byteSize?: number;
  /** Authoritative action list for this client; `actions[0]` is the primary. */
  actions?: readonly ChatArtifactAction[];
}

export interface ChatArtifacts {
  version: "v1";
  items: ChatArtifactItem[];
}

/** Host-overridable labels shared by React, Vue and React Native. */
export interface ChatArtifactLabels {
  title: string;
  empty: string;
  /** Expand-label for a folded list; receives the full item count. */
  more: (count: number) => string;
  less: string;
  retry: string;
  pending: string;
  failed: string;
  /** Overflow-menu trigger label. */
  actions: string;
  /** Per-action button label. */
  action: (action: ChatArtifactAction) => string;
  size: (byteSize: number) => string;
  type: (mediaType: string) => string;
}

/** Identical props on the React, Vue and React Native artifact lists. */
export interface ChatArtifactsProps {
  artifacts: ChatArtifacts;
  onAction?: (item: ChatArtifactItem, action: ChatArtifactAction) => void | Promise<void>;
  onPreview?: (item: ChatArtifactItem) => void;
  labels?: Partial<ChatArtifactLabels>;
  locale?: string;
  states?: Record<string, "pending" | "failed">;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function parseActions(value: unknown): readonly ChatArtifactAction[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const actions: ChatArtifactAction[] = [];
  for (const raw of value) {
    if (typeof raw !== "string" || !ARTIFACT_ACTIONS.includes(raw as ChatArtifactAction)) continue;
    const action = raw as ChatArtifactAction;
    if (!actions.includes(action)) actions.push(action);
  }
  return actions.length ? actions : undefined;
}

function parseArtifactItem(value: unknown): ChatArtifactItem | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id : "";
  const display = typeof value.display === "string" ? value.display : "";
  if (!id.trim() || !display.trim()) return null;
  const item: ChatArtifactItem = { id, display };
  const description = optionalText(value.description);
  if (description) item.description = description;
  const mediaType = optionalText(value.mediaType);
  if (mediaType) item.mediaType = mediaType;
  const byteSize = value.byteSize;
  if (typeof byteSize === "number" && Number.isFinite(byteSize) && byteSize >= 0) {
    item.byteSize = byteSize;
  }
  const actions = parseActions(value.actions);
  if (actions) item.actions = actions;
  return item;
}

/**
 * Defensive parse for `ChatMessage.artifacts`. Unknown versions, non-array
 * items and invalid items are dropped; valid siblings still render in order.
 */
export function parseArtifacts(value: unknown): ChatArtifacts | null {
  if (!isRecord(value)) return null;
  if (value.version !== ARTIFACTS_VERSION) return null;
  if (!Array.isArray(value.items)) return null;
  const items: ChatArtifactItem[] = [];
  for (const raw of value.items) {
    const item = parseArtifactItem(raw);
    if (item) items.push(item);
  }
  return { version: ARTIFACTS_VERSION, items };
}

/** Human-readable byte size used by the default `size` label. */
export function formatArtifactSize(byteSize: number): string {
  if (!Number.isFinite(byteSize) || byteSize < 0) return "";
  if (byteSize < 1024) return `${Math.round(byteSize)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = byteSize / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 100 || Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} ${units[unit]}`;
}

const ARTIFACT_TYPE_LABELS: Record<string, string> = {
  "application/gzip": "GZIP",
  "application/javascript": "JS",
  "application/json": "JSON",
  "application/msword": "DOC",
  "application/octet-stream": "FILE",
  "application/pdf": "PDF",
  "application/typescript": "TS",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/x-tar": "TAR",
  "application/x-yaml": "YAML",
  "application/xml": "XML",
  "application/zip": "ZIP",
  "image/gif": "GIF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/svg+xml": "SVG",
  "image/webp": "WEBP",
  "text/css": "CSS",
  "text/csv": "CSV",
  "text/html": "HTML",
  "text/markdown": "MD",
  "text/plain": "TXT",
  "text/x-typescript": "TS",
  "text/xml": "XML",
  "text/yaml": "YAML",
};

/** Short media-type hint used by the default `type` label. */
export function formatArtifactType(mediaType: string): string {
  const normalized = mediaType.split(";")[0]?.trim().toLowerCase();
  if (!normalized) return "";
  const known = ARTIFACT_TYPE_LABELS[normalized];
  if (known) return known;
  const subtype = normalized.split("/")[1] ?? normalized;
  const short = subtype.replace(/^x-/, "").replace(/\+.*$/, "");
  return short.length <= 12 ? short.toUpperCase() : normalized;
}

const EN_ACTIONS: Record<ChatArtifactAction, string> = {
  preview: "Preview",
  open: "Open",
  reveal: "Show in folder",
  save: "Save",
};

const ZH_ACTIONS: Record<ChatArtifactAction, string> = {
  preview: "预览",
  open: "打开",
  reveal: "在文件夹中显示",
  save: "保存",
};

export const defaultChatArtifactLabels: ChatArtifactLabels = {
  title: "Delivered files",
  empty: "No files were delivered.",
  more: (count) => `Show all ${count}`,
  less: "Show less",
  retry: "Retry",
  pending: "Working…",
  failed: "Action failed",
  actions: "More actions",
  action: (action) => EN_ACTIONS[action],
  size: formatArtifactSize,
  type: formatArtifactType,
};

const zhChatArtifactLabels: ChatArtifactLabels = {
  title: "交付文件",
  empty: "没有交付文件。",
  more: (count) => `显示全部 ${count} 项`,
  less: "收起",
  retry: "重试",
  pending: "处理中…",
  failed: "操作失败",
  actions: "更多操作",
  action: (action) => ZH_ACTIONS[action],
  size: formatArtifactSize,
  type: formatArtifactType,
};

/** Locale defaults, with host overrides taking precedence. */
export function resolveArtifactLabels(
  locale?: string,
  overrides?: Partial<ChatArtifactLabels>,
): ChatArtifactLabels {
  const defaults = locale?.toLowerCase().startsWith("zh")
    ? zhChatArtifactLabels
    : defaultChatArtifactLabels;
  return { ...defaults, ...overrides };
}