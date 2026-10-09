import type { ChatMessage, ChatUserInputLabels, ChatUserInputRequest } from "./types";

export type HistoryStatus = "Running" | "Waiting" | "Completed" | "Interrupted" | "Failed" | "Unknown" | "Planned" | "Approved";
export type HistoryContentBlock =
  | { type: "Text" | "Reasoning"; text: string }
  | { type: "Json"; value: unknown }
  | { type: "Media"; mimeType: string; source: { type: "url" | "base64"; value: string }; name: string | null }
  | { type: "Resource"; uri: string; mimeType: string | null; name: string | null; sizeBytes: number | null };
export interface HistoryMessage {
  id: string; runId: string; stepId: string | null; role: "User" | "Assistant";
  content: HistoryContentBlock[]; structured: unknown; status: HistoryStatus; createdAtMs: number;
}
export interface HistoryStep {
  id: string; runId: string; nodeInvocationId: string | null; sequence: number; attempt: number; name: string;
  model: { connection: string; model: string } | null; status: HistoryStatus;
  usage: { inputTokens: number; outputTokens: number } | null; startedAtMs: number; finishedAtMs: number | null;
}
export interface HistoryToolInvocation {
  id: string; runId: string; stepId: string; messageId: string; callId: string; toolId: string; toolName: string;
  arguments: unknown; status: HistoryStatus; content: HistoryContentBlock[]; structured: unknown; isError: boolean | null;
  resultReference: HistoryContentBlock | null; startedAtMs: number | null; finishedAtMs: number | null;
}
export interface HistoryInteraction {
  id: string; runId: string; invocationId: string | null; prompt: HistoryContentBlock[];
  responseSchema: Record<string, unknown>; presentation: Record<string, unknown> | null; response: unknown; expiresAtMs: number | null;
}
export interface HistoryRun {
  id: string; sessionId: string; parentRunId: string | null; rootRunId: string; status: HistoryStatus;
  startedAtMs: number; finishedAtMs: number | null; error: string | null;
}
export interface HistoryCursor { sessionId: string; version: string; before: number }
export interface HistoryQuery { limit: number; cursor: HistoryCursor | null }
export interface SessionHistory {
  sessionId: string; version: string; nextCursor: HistoryCursor | null; runs: HistoryRun[];
  records: { steps: HistoryStep[]; messages: HistoryMessage[]; toolInvocations: HistoryToolInvocation[]; interactions: HistoryInteraction[] };
  pendingInteractions: HistoryInteraction[]; activeRuns: HistoryRun[];
}
export interface HistoryMessageView { message: HistoryMessage; step: HistoryStep | null; tools: HistoryToolInvocation[]; run: HistoryRun | null; interactions: HistoryInteraction[] }
export interface ChatHistoryLabels { loading: string; loadOlder: string; step: string; attempt: string; statuses: Record<HistoryStatus, string> }
export const defaultHistoryLabels: ChatHistoryLabels = { loading: "Loading history…", loadOlder: "Load earlier turns", step: "Step", attempt: "Attempt",
  statuses: { Running: "Running", Waiting: "Waiting", Completed: "Completed", Interrupted: "Interrupted", Failed: "Failed", Unknown: "Result unknown", Planned: "Planned", Approved: "Approved" } };

export function historyText(blocks: HistoryContentBlock[]): string {
  return blocks.filter((b): b is Extract<HistoryContentBlock, { type: "Text" | "Reasoning" }> => b.type === "Text").map((b) => b.text).join("");
}
/** Native execution identity survives protocol run aliases used by host adapters. */
export function historyEventRunId(event: { runId?: string | null; metadata?: unknown }): string {
  const metadata = event.metadata as { nativeRunId?: unknown; framework?: { runId?: unknown } } | undefined;
  const nativeId = metadata?.framework?.runId ?? metadata?.nativeRunId;
  return typeof nativeId === "string" ? nativeId : event.runId ?? "";
}
/** Linear projection of structured records; no AG-UI replay or checkpoint parsing. */
export function historyMessages(page: SessionHistory): ChatMessage[] {
  const steps = new Map(page.records.steps.map((s) => [s.id, s]));
  const runs = new Map(page.runs.map((r) => [r.id, r]));
  const tools = new Map<string, HistoryToolInvocation[]>();
  page.records.toolInvocations.forEach((t) => { const group = tools.get(t.messageId) ?? []; group.push(t); tools.set(t.messageId, group); });
  const lastMessageByRun = new Map(page.records.messages.map((m) => [m.runId, m.id]));
  const interactionsByRun = new Map<string, HistoryInteraction[]>();
  page.records.interactions.forEach((i) => { const group = interactionsByRun.get(i.runId) ?? []; group.push(i); interactionsByRun.set(i.runId, group); });
  return page.records.messages.map((message) => {
    const step = message.stepId ? steps.get(message.stepId) ?? null : null;
    return {
      id: message.id, messageId: message.id, sessionId: page.sessionId, runId: message.runId,
      role: message.role === "User" ? "USER" : "ASSISTANT", channel: "history", actor: message.role === "User" ? "User" : "Assistant",
      content: historyText(message.content), inputTokens: step?.usage?.inputTokens, outputTokens: step?.usage?.outputTokens,
      totalTokens: step?.usage ? step.usage.inputTokens + step.usage.outputTokens : null,
      createdAt: new Date(message.createdAtMs).toISOString(), history: { message, step, tools: tools.get(message.id) ?? [], run: runs.get(message.runId) ?? null, interactions: lastMessageByRun.get(message.runId) === message.id ? interactionsByRun.get(message.runId) ?? [] : [] },
    };
  });
}

export function historyUserInputRequests(page: SessionHistory, labels?: Partial<ChatUserInputLabels>): ChatUserInputRequest[] {
  return page.pendingInteractions.map((interaction) => {
    const schema = interaction.responseSchema;
    const approval = interaction.invocationId !== null || schema.type === "boolean";
    const choices = approval ? [true, false] : Array.isArray(schema.enum) ? schema.enum : "const" in schema ? [schema.const] : [];
    const optionPayloads: Record<string, unknown> = {};
    const options = choices.map((payload, index) => {
      const optionId = `NATIVE-${index}`; optionPayloads[optionId] = payload;
      return { optionId, label: approval ? payload ? labels?.approve ?? "Approve" : labels?.reject ?? "Reject" : String(payload) };
    });
    const question = typeof interaction.presentation?.intro === "string" ? interaction.presentation.intro : historyText(interaction.prompt) || "Input required";
    const presented = interaction.presentation?.questions;
    return { requestId: interaction.id, sessionId: page.sessionId, runId: interaction.runId, intro: question, status: "Pending" as const,
      requestedAt: page.runs.find((r) => r.id === interaction.runId)?.startedAtMs ?? 0,
      questions: Array.isArray(presented) ? presented.map((entry: Record<string, unknown>) => ({
        questionId: String(entry.id ?? entry.questionId ?? ""), question: String(entry.question ?? ""),
        options: Array.isArray(entry.options) ? entry.options.map((option: Record<string, unknown>) => ({ optionId: String(option.id ?? option.optionId ?? ""), label: String(option.label ?? ""), description: typeof option.description === "string" ? option.description : undefined })) : [],
        allowCustomAnswer: entry.allow_free_text === true || entry.allowCustomAnswer === true,
        allowSkip: entry.allow_skip === true || entry.allowSkip === true,
      })) : [{ questionId: interaction.id, question, options, allowCustomAnswer: !choices.length, allowSkip: false }],
      ...(Array.isArray(presented) ? {} : { nativeInteraction: { reason: approval ? "approval_required" : "input_required", responseSchema: schema, optionPayloads } }),
    };
  });
}

export function historyToolResult(tool: HistoryToolInvocation): string {
  const text = historyText(tool.content);
  if (text) return text;
  if (tool.structured !== null) return JSON.stringify(tool.structured, null, 2);
  if (tool.resultReference?.type === "Resource") return tool.resultReference.uri;
  return "";
}

/** Restrict media/link schemes supplied by history records. */
export function historyBlockUrl(block: HistoryContentBlock): string | null {
  const url = block.type === "Resource" ? block.uri : block.type === "Media" ? block.source.type === "url" ? block.source.value : `data:${block.mimeType};base64,${block.source.value}` : "";
  return /^(https?:\/\/|\/(?!\/))/i.test(url) || block.type === "Media" && /^data:image\/(png|jpeg|gif|webp);base64,/i.test(url) ? url : null;
}
