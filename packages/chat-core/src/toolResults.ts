/** Safe, shared projection of live and persisted Framework tool outputs. */
export interface ToolResultPreview {
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
  const addImage = (value: unknown, name: unknown = "") => {
    const url = toolResultUrl(value, true);
    if (url && !preview.images.some(image => image.url === url)) preview.images.push({ url, name: typeof name === "string" ? name : "" });
  };
  for (const entry of [...(Array.isArray(root.content) ? root.content : []), ...(root.resultReference ? [root.resultReference] : [])]) {
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
