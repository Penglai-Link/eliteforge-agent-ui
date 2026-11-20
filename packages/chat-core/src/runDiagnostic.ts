import type { ChatRunDiagnostic } from "./types";

/** Printable trace identifiers without whitespace or path separators. */
const traceIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function sameOriginPath(value: string) {
  return value.startsWith("/")
    && !value.startsWith("//")
    && !value.startsWith("/\\")
    && !/[\u0000-\u001f\u007f]/.test(value);
}

/**
 * Validates the diagnostic a host attaches to a run. Anything malformed is
 * dropped before shared React/Vue renderers see it, so hosts cannot inject a
 * script-capable or cross-origin link into the failure notice. A valid trace id
 * survives an invalid href; the link is optional.
 */
export function parseChatRunDiagnostic(value: unknown): ChatRunDiagnostic | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const traceId = typeof record.traceId === "string" ? record.traceId.trim() : "";
  if (!traceIdPattern.test(traceId)) return undefined;
  const href = typeof record.href === "string" ? record.href.trim() : "";
  return { traceId, ...(sameOriginPath(href) ? { href } : {}) };
}