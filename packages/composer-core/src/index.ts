import "./styles.css";
export * from "./types";
export { startQueuedMessageDrag } from "./queueDrag";
import type { ComposerAttachment, ComposerSuggestion } from "./types";

export function suggestionQuery(draft: string) {
  const match = draft.match(/(?:^|\s)([/$])([^\s]*)$/);
  return match
    ? {
        trigger: match[1],
        query: match[2],
        start: draft.length - match[0].length,
        prefix: /^\s/.test(match[0]) ? match[0][0] : "",
      }
    : null;
}
export function filterSuggestions(
  draft: string,
  suggestions: ComposerSuggestion[],
  skillTriggers: Array<"$" | "/"> = ["$", "/"],
) {
  const match = suggestionQuery(draft);
  if (!match) return [];
  const query = match.query.toLocaleLowerCase();
  return suggestions.filter(
    (item) =>
      (item.kind === "command" ? match.trigger === "/" : skillTriggers.includes(match.trigger as "$" | "/")) &&
      [item.name, item.description, item.category].some((value) =>
        value?.toLocaleLowerCase().includes(query)
      )
  );
}
export function insertSuggestion(draft: string, item: ComposerSuggestion) {
  const match = suggestionQuery(draft);
  if (!match) return null;
  const value = `${draft.slice(0, match.start)}${match.prefix}${
    item.kind === "skill" ? "$" : "/"
  }${item.name} `;
  return { value, caret: value.length };
}
export function composerOverlayParts(
  draft: string,
  suggestions: ComposerSuggestion[]
) {
  const skills = new Map(
    suggestions
      .filter((item) => item.kind === "skill")
      .map((item) => [item.name, item])
  );
  return draft.split(/(\$[\p{L}\p{N}_.-]+)/gu).map((text) => {
    const skill = text.startsWith("$") ? skills.get(text.slice(1)) : undefined;
    return {
      text,
      displayName: skill
        ? text
        : null,
    };
  });
}
export function insertNewlineAtCursor(textarea: HTMLTextAreaElement) {
  const start = textarea.selectionStart,
    end = textarea.selectionEnd;
  const value = `${textarea.value.slice(0, start)}\n${textarea.value.slice(
    end
  )}`;
  textarea.value = value;
  textarea.setSelectionRange(start + 1, start + 1);
  return value;
}
export function pastedImage(data: DataTransfer | null): File | null {
  const item = Array.from(data?.items ?? []).find(
    (item) => item.kind === "file" && item.type.startsWith("image/")
  );
  const file = item?.getAsFile();
  if (!file) return null;
  return file.name.trim()
    ? file
    : new File(
        [file],
        `pasted-image-${Date.now()}.${file.type.split("/")[1] || "png"}`,
        { type: file.type || "image/png" }
      );
}
export function isImageAttachment(attachment: ComposerAttachment) {
  return (
    attachment.kind === "image" ||
    Boolean(attachment.imageUrl) ||
    ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
      attachment.contentType?.toLowerCase() ?? ""
    )
  );
}
export function attachmentLabel(attachment: ComposerAttachment) {
  return (
    attachment.fileName ||
    attachment.title ||
    attachment.summary ||
    attachment.id
  );
}
export function attachmentTypeLabel(attachment: ComposerAttachment) {
  const name = attachment.fileName || attachment.title || "";
  const extension = name.includes(".") ? name.split(".").pop() : undefined;
  return (
    extension ||
    attachment.contentType?.split("/").pop() ||
    "FILE"
  ).toUpperCase();
}

/** Stable identities from explicit skill tokens, including restored queue selections.
 * Tokens are user intent only; the server must authorize every submitted identity.
 */
export function requestedSkillsFromDraft(draft: string, suggestions: ComposerSuggestion[], previous: string[] = []): string[] {
  const known = new Set([...previous, ...suggestions.filter(item => item.kind === "skill").map(item => item.name)]);
  return [...new Set(Array.from(draft.matchAll(/(?:^|\s)\$([\p{L}\p{N}_.-]+)(?=\s|$)/gu), match => match[1]).filter(name => known.has(name)))];
}
