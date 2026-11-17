import { parseToolBatchResult, type ToolBatchItemResult } from "./toolBatch";
/**
 * True when a tool result payload reports a top-level failure. Nested
 * `isError` flags belong to inner structured data and must not turn the whole
 * tool call into a failure — the same rule Web and React Native share.
 */
export function toolResultIsError(raw: string): boolean {
  if (!raw) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed)
      && (parsed as { isError?: unknown }).isError === true);
  } catch {
    return false;
  }
}

/** Safe, shared projection of live and persisted tool outputs. */
export interface ToolResultPreview {
  toolSearch?: {
    mode: "summary" | "definition";
    tools: { callName: string; description: string }[];
    matched: number;
    truncated: boolean;
  };
  items?: Array<{ item: ToolBatchItemResult; value: string }>;
  texts: string[];
  images: { url: string; name: string }[];
  links: { url: string; title: string; snippet: string }[];
  facts: { label: string; value: string }[];
}
const object = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
export function toolResultUrl(value: unknown, image = false): string | null {
  if (typeof value !== "string" || /[\x00-\x20\\]/.test(value) && !value.startsWith("data:")) return null;
  if (/^https?:\/\//i.test(value) || /^\/(?![\/\\])/.test(value)) return value;
  return image && /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value) ? value : null;
}
export function toolResultPreview(raw: string): ToolResultPreview {
  const preview: ToolResultPreview = { texts: [], images: [], links: [], facts: [] };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return preview; }
  const root = object(parsed);
  const data = object(root.structured ?? root);
  const batch = parseToolBatchResult(data);
  if (batch) {
    preview.items = batch.results.map(item=>({item, value:JSON.stringify({
      content:item.content, structured:item.structured ?? item.result,
      isError:item.isError, resultReference:item.resultReference,
    })}));
    return preview;
  }
  if (data.kind === "toolSearch" && (data.mode === "summary" || data.mode === "definition")
    && Array.isArray(data.tools) && data.tools.every((tool: unknown) => {
      const entry = object(tool);
      return typeof entry.call_name === "string" && typeof entry.description === "string";
    }) && Number.isSafeInteger(data.matched) && data.matched >= data.tools.length && typeof data.truncated === "boolean") {
    preview.toolSearch = {
      mode: data.mode, matched: data.matched, truncated: data.truncated,
      tools: data.tools.map((tool: Record<string, string>) => ({ callName: tool.call_name, description: tool.description })),
    };
    return preview;
  }
  const addImage = (value: unknown, name: unknown = "") => {
    const url = toolResultUrl(value, true);
    if (url && !preview.images.some(image => image.url === url)) preview.images.push({ url, name: typeof name === "string" ? name : "" });
  };
  for (const entry of [...(Array.isArray(root.content) ? root.content : []), ...(root.resultReference ? [{ type: "resource", resource: root.resultReference }] : [])]) {
    const block = object(entry);
    if (String(block.type).toLowerCase() === "text" && typeof block.text === "string") {
      try { JSON.parse(block.text); } catch { preview.texts.push(block.text); }
    }
    if (String(block.type).toLowerCase() === "media") {
      const media = object(block.media ?? block);
      const source = object(media.source);
      const mime = media.mime_type ?? media.mimeType;
      if (typeof mime === "string" && mime.startsWith("image/")) addImage(source.type === "base64" ? `data:${mime};base64,${source.value}` : source.value, media.name ?? "");
    }
    if (String(block.type).toLowerCase() === "resource") {
      const resource = object(block.resource ?? block);
      const url = toolResultUrl(resource.uri);
      if (url) preview.links.push({ url, title: String(resource.name ?? url), snippet: "" });
    }
  }
  for (const entry of Array.isArray(data.results) ? data.results : []) {
    const result = object(entry), url = toolResultUrl(result.url);
    if (url) preview.links.push({ url, title: String(result.title ?? url), snippet: String(result.snippet ?? "") });
  }
  const job = object(data.job);
  for (const entry of Array.isArray(job.images) ? job.images : []) {
    const image = object(entry), source = object(image.source);
    addImage(typeof entry === "string" ? entry : image.url ?? (source.type === "base64" ? `data:${image.mime_type ?? image.mimeType};base64,${source.value}` : source.value));
  }
  const fact = (label: string, value: unknown) => {
    if (typeof value === "string" || typeof value === "number") preview.facts.push({ label, value: String(value) });
  };
  fact("task_id", data.task_id);
  fact("status", job.status);
  fact("progress", job.progress);
  fact("error", job.error);
  const detection = object(data.result);
  fact("ai_confidence", detection.ai_confidence);
  return preview;
}

export function toolSearchPreviewLabel(search: NonNullable<ToolResultPreview["toolSearch"]>, locale?: string): string {
  const zh = locale?.toLowerCase().startsWith("zh");
  const count = search.tools.length;
  if (search.mode === "definition") return zh ? `已获取 ${count} 个工具定义` : `${count} tool definition${count === 1 ? "" : "s"} loaded`;
  if (search.truncated) return zh ? `找到 ${search.matched} 个工具，显示 ${count} 个；请缩小搜索范围` : `${search.matched} tool${search.matched === 1 ? "" : "s"} found, showing ${count}; narrow your search`;
  return zh ? `找到 ${count} 个工具` : `${count} tool${count === 1 ? "" : "s"} found`;
}
