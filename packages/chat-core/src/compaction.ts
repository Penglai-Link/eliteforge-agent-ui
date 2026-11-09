/** Host-neutral facts from one context assembly, without prompt contents. */
export interface ChatCompactionBlock {
  id: string;
  beforeTokens: number;
  afterTokens: number;
  kind: "compressed" | "summary";
}

/** Undefined means unrecorded; an empty array means no confirmed reductions. */
export function parseCompactionBlocks(value: unknown): ChatCompactionBlock[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const blocks = new Map<string, ChatCompactionBlock>();
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id
      || !Number.isSafeInteger(item.beforeTokens) || item.beforeTokens < 0
      || !Number.isSafeInteger(item.afterTokens) || item.afterTokens < 0
      || (item.kind !== "compressed" && item.kind !== "summary")
      || (item.kind === "compressed" && item.afterTokens >= item.beforeTokens)) continue;
    blocks.set(item.id, { id: item.id, beforeTokens: item.beforeTokens, afterTokens: item.afterTokens, kind: item.kind });
  }
  return [...blocks.values()];
}

export function compactionBlockLabel(block: ChatCompactionBlock): string {
  return `${block.id} ${block.kind === "summary" ? "summary generated" : "compacted"} · ${block.beforeTokens.toLocaleString()} → ${block.afterTokens.toLocaleString()} tokens`;
}
