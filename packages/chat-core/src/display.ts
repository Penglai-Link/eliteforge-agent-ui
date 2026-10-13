export function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function truncateLabel(value: string, maxLength = 64) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function reasoningPreviewLabel(value: string, maxLength = 168) {
  return truncateLabel(value.replace(/[#>*_`~-]+/g, " "), maxLength);
}

function normalizeReasoningText(value: string) {
  const normalized = value
    .replace(/[#>*_`~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  return normalized
    .replace(/^(?:but )?the user (?:wants|asked|is asking|is saying|said|has asked|is requesting)[^.?!。！？]*[.?!。！？]\s*/i, "")
    .replace(/^i should\s+/i, "")
    .replace(/^i need to\s+/i, "")
    .replace(/^let me\s+/i, "");
}

function splitReasoningSentences(value: string) {
  return value.match(/[^.?!。！？]+[.?!。！？]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
}

export function reasoningLastSentence(value: string) {
  const normalized = normalizeReasoningText(value);
  if (!normalized) return "";
  const sentences = splitReasoningSentences(normalized);
  if (sentences.length === 0) return normalized;
  return sentences[sentences.length - 1] || normalized;
}

export function deriveReasoningPreview(summary: string) {
  return reasoningPreviewLabel(summary, 120);
}

/**
 * Returns one immutable preview for a single reasoning turn. Raw reasoning
 * deltas arrive token-by-token, so using the newest partial sentence causes
 * the work rail to visibly rewrite itself on every stream event.
 */
export function reasoningCheckpointPreview(detail: string) {
  const normalized = normalizeReasoningText(detail);
  if (!normalized) return "";

  const sentence = splitReasoningSentences(normalized).find((candidate) => (
    /[.?!。！？]$/.test(candidate) && candidate.length >= 12
  ));
  return sentence ? reasoningPreviewLabel(sentence, 120) : "";
}
