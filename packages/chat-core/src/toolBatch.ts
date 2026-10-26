/** Framework core tool_batch.rs wire contract. Cross-repository fixture tests
 * validate this consumer against Rust serialization, not handwritten examples. */
export interface ToolBatchItem {
  parentCallId: string; parentInvocationId: string;
  callId: string; invocationId: string; index: number;
}
export type ToolBatchStatus = "Pending" | "Waiting" | "Running" | "Completed" | "Failed" | "NotExecuted" | "Unknown";
export interface ToolBatchItemResult extends ToolBatchItem {
  status: ToolBatchStatus; content: unknown[]; structured?: unknown; result?: unknown;
  isError?: boolean; resultReference?: unknown;
}
export interface ToolBatchResult { kind: "toolBatch"; results: ToolBatchItemResult[] }
/** Partial payloads are useful results, but do not complete the parent card. */
export function hasPendingBatchItems(raw: string): boolean {
  try {
    const output = JSON.parse(raw);
    const batch = parseToolBatchResult(output?.structured);
    return Boolean(batch?.results.some(row => ["Pending", "Waiting", "Running"].includes(row.status)));
  } catch { return false; }
}
export const TOOL_BATCH_ACTIVITY_TYPE = "framework.tool.batch";
/** Revisions are decimal strings and scoped to a parent invocation. */
export function validBatchRevision(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]*$/.test(value);
}
export function newerBatchRevision(incoming: unknown, current: unknown): boolean {
  if (!validBatchRevision(incoming)) return false;
  if (!validBatchRevision(current)) return true;
  return incoming.length !== current.length ? incoming.length > current.length : incoming > current;
}
export interface ToolBatchSnapshot {
  revision?: string;
  toolCallId: string; toolName: string; arguments: unknown;
  output: Record<string, unknown> & { structured: ToolBatchResult };
}
export function parseToolBatchSnapshot(value: unknown): ToolBatchSnapshot | null {
  if (!object(value) || typeof value.toolCallId !== "string" || typeof value.toolName !== "string"
    || !("arguments" in value) || !object(value.output)) return null;
  if (value.revision !== undefined && !validBatchRevision(value.revision)) return null;
  const batch = parseToolBatchResult(value.output.structured);
  if (!batch || batch.results.some(row => row.parentInvocationId !== value.toolCallId)) return null;
  return {revision: value.revision as string | undefined, toolCallId:value.toolCallId, toolName:value.toolName, arguments:value.arguments,
    output:{...value.output, structured:batch}};
}
export interface ToolApprovalDetails { tool: string; parameters: unknown; batch?: ToolBatchItem }
const statuses: ToolBatchStatus[] = ["Pending", "Waiting", "Running", "Completed", "Failed", "NotExecuted", "Unknown"];
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
export function isToolBatchItem(v: unknown): v is ToolBatchItem {
  return object(v) && [v.parentCallId,v.parentInvocationId,v.callId,v.invocationId].every(id=>typeof id === "string" && id.length > 0)
    && Number.isInteger(v.index) && Number(v.index) >= 0;
}
export function parseToolBatchResult(v: unknown): ToolBatchResult | null {
  if (!object(v) || v.kind !== "toolBatch" || !Array.isArray(v.results) || !v.results.length) return null;
  if (!v.results.every(row=>isToolBatchItem(row) && object(row) && statuses.includes(row.status as ToolBatchStatus) && Array.isArray(row.content))) return null;
  const rows = v.results as ToolBatchItemResult[];
  if (new Set(rows.map(row=>row.index)).size !== rows.length
    || new Set(rows.map(row=>row.invocationId)).size !== rows.length
    || new Set(rows.map(row=>row.callId)).size !== rows.length
    || rows.some(row=>row.parentCallId !== rows[0].parentCallId
      || row.parentInvocationId !== rows[0].parentInvocationId
      || row.invocationId === row.parentInvocationId || row.callId === row.parentCallId)) return null;
  return {kind:"toolBatch", results:[...rows].sort((a,b)=>a.index-b.index)};
}
export function parseToolApprovalDetails(value: unknown): ToolApprovalDetails | undefined {
  if (!object(value) || typeof value.tool !== "string" || !("parameters" in value) || (value.batch != null && !isToolBatchItem(value.batch))) return undefined;
  return {tool:value.tool,parameters:value.parameters,...(isToolBatchItem(value.batch)?{batch:value.batch}:{})};
}
export function batchItemLabel(index: number, status: ToolBatchStatus, locale?: string): string {
  const zh = locale?.toLowerCase().startsWith("zh");
  const names:Record<ToolBatchStatus,string> = zh
    ? {Pending:"待执行",Waiting:"待审批",Running:"执行中",Completed:"已完成",Failed:"失败",NotExecuted:"未执行",Unknown:"结果未知"}
    : {Pending:"Pending",Waiting:"Awaiting approval",Running:"Running",Completed:"Completed",Failed:"Failed",NotExecuted:"Not executed",Unknown:"Outcome unknown"};
  return `${zh ? "第 " : "Item "}${index+1}${zh ? " 项" : ""} · ${names[status]}`;
}
