import type { ChatMessage } from "@personai/agent-ui-chat-core";

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function normalizeOptionalValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function dedupeMessages(messages: ChatMessage[]) {
  const seen = new Set<string>();
  return messages.filter((message) => {
    if (seen.has(message.messageId)) return false;
    seen.add(message.messageId);
    return true;
  });
}

export function defaultErrorReporter(message: string) {
  console.error(message);
}

export async function copyPlainText(value: string) {
  if (!value.trim()) return;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === "undefined") return;
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

export function insertNewlineAtCursor(textarea: HTMLTextAreaElement) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const nextValue = `${textarea.value.slice(0, start)}\n${textarea.value.slice(end)}`;
  textarea.value = nextValue;
  textarea.selectionStart = start + 1;
  textarea.selectionEnd = start + 1;
  return nextValue;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInlineMarkdown(value: string) {
  const escaped = escapeHtml(value);
  const codeSegments: string[] = [];
  const withCodePlaceholders = escaped.replace(/`([^`]+)`/g, (_, code: string) => {
    const placeholder = `__CHAT_CODE_${codeSegments.length}__`;
    codeSegments.push(`<code>${code}</code>`);
    return placeholder;
  });

  const formatted = withCodePlaceholders
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  return formatted.replace(/__CHAT_CODE_(\d+)__/g, (_, index: string) => codeSegments[Number(index)] ?? "");
}