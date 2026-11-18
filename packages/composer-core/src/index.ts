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
function pastedFileList(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = Array.from(data.files ?? []);
  if (files.length) return files;
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

function namePastedFile(file: File, suffix: string): File {
  if (file.name.trim()) return file;
  const image = file.type.startsWith("image/");
  const subtype = (file.type.split("/")[1] ?? "")
    .split(";")[0]
    .split("+")[0]
    .split(".")[0];
  const extension = subtype || (image ? "png" : "bin");
  return new File([file], `pasted-${image ? "image" : "file"}${suffix}.${extension}`, {
    type: file.type || (image ? "image/png" : "application/octet-stream"),
  });
}

/** Every image or file in a paste payload, in clipboard order.
 * Unnamed clipboard entries receive a generated name because uploads usually need one.
 */
export function pastedFiles(data: DataTransfer | null): File[] {
  const files = pastedFileList(data);
  const stamp = Date.now();
  const multiple = files.length > 1;
  return files.map((file, index) =>
    namePastedFile(file, multiple ? `-${stamp}-${index + 1}` : `-${stamp}`)
  );
}

export function pastedImage(data: DataTransfer | null): File | null {
  return pastedFiles(data).find((file) => file.type.startsWith("image/")) ?? null;
}

/** Mixed clipboard payloads keep their text insertion; attachments are still added. */
export function pasteKeepsText(data: DataTransfer | null): boolean {
  return Boolean(data?.getData("text/plain").trim());
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
