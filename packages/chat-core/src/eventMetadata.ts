/** Read protocol fields without requiring a particular host's metadata namespace. */
export function metadataRecords(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const root = value as Record<string, unknown>;
  const records = [root.execution, ...Object.values(root), root];
  return records.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

export function metadataRecordWith(value: unknown, predicate: (record: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
  return metadataRecords(value).find(predicate);
}
