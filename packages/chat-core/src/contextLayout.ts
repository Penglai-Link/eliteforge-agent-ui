export type ContextBlockPlacement = "prefix" | "history" | "dynamic" | "unknown";

/** Classify the SDK's reported positions; never reorder messages or infer caching. */
export function contextBlockPlacements(
  blocks: readonly { id: string; position: number }[],
  historyBlockId = "framework.history",
): Map<string, ContextBlockPlacement> {
  const history = blocks.filter(block => block.id === historyBlockId);
  const valid = history.length === 1
    && blocks.every(block => Number.isSafeInteger(block.position) && block.position >= 0)
    && new Set(blocks.map(block => block.position)).size === blocks.length
    && new Set(blocks.map(block => block.id)).size === blocks.length;
  return new Map(blocks.map(block => [block.id, !valid ? "unknown"
    : block.id === historyBlockId ? "history"
    : block.position < history[0]!.position ? "prefix" : "dynamic"]));
}
