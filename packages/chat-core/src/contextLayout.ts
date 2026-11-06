export type ContextBlockPlacement = "prefix" | "history" | "dynamic" | "unknown";

/** Classify reported positions; never reorder messages or infer caching. */
export function contextBlockPlacements(
  blocks: readonly { id: string; position: number }[],
  historyBlockId?: string,
): Map<string, ContextBlockPlacement> {
  const history = blocks.filter(block => historyBlockId ? block.id === historyBlockId : block.id === "history" || block.id.endsWith(".history"));
  const valid = history.length === 1
    && blocks.every(block => Number.isSafeInteger(block.position) && block.position >= 0)
    && new Set(blocks.map(block => block.position)).size === blocks.length
    && new Set(blocks.map(block => block.id)).size === blocks.length;
  return new Map(blocks.map(block => [block.id, !valid ? "unknown"
    : block.id === history[0]!.id ? "history"
    : block.position < history[0]!.position ? "prefix" : "dynamic"]));
}
