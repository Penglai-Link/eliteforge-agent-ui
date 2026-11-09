import { type ToolBatchItem, parseToolApprovalDetails } from "./toolBatch";
import { approvalPresentation } from "./approvalPresentation";
import type { ChatAnnotation } from "./annotations";
import type { ChatMessage, MessageProvenance, ChatUserInputLabels, ChatUserInputRequest } from "./types";
import { interactionMessages } from "./interactionMessages";
import { metadataRecordWith } from "./eventMetadata";
import type { ChatCompactionBlock } from "./compaction";

export type HistoryStatus = "Running" | "Waiting" | "Completed" | "Interrupted" | "Failed" | "Unknown" | "Planned" | "Approved";
/** A protocol-neutral maintenance step, with ordinary HistoryStep status. */
export const CONTEXT_COMPACTION_STEP = "agent.context.compaction";
export type HistoryContentBlock =
  | { type: "Text" | "Reasoning"; text: string }
  | { type: "Json"; value: unknown }
  | { type: "Media"; mimeType: string; source: { type: "url" | "base64"; value: string }; name: string | null }
  | { type: "Resource"; uri: string; mimeType: string | null; name: string | null; sizeBytes: number | null };
export interface HistoryMessage {
  annotations?: ChatAnnotation[];
  requestedSkills?: string[];
  provenance?: MessageProvenance;
  id: string; runId: string; stepId: string | null; role: "User" | "Assistant";
  phase?: string | null; outputIndex?: number | null;
  content: HistoryContentBlock[]; structured: unknown; status: HistoryStatus; createdAtMs: number;
}
export interface HistoryStep {
  compaction?: { blocks: ChatCompactionBlock[] };
  id: string; runId: string; nodeInvocationId: string | null; sequence: number; attempt: number; name: string;
  model: { connection: string; model: string } | null; status: HistoryStatus;
  usage: { inputTokens: number; outputTokens: number } | null; startedAtMs: number; finishedAtMs: number | null;
}
export interface HistoryToolInvocation {
  batchRevision?: string;
  batch?: ToolBatchItem | null;
  id: string; runId: string; stepId: string; messageId: string; callId: string; toolId: string; toolName: string;
  arguments: unknown; status: HistoryStatus; content: HistoryContentBlock[]; structured: unknown; isError: boolean | null;
  resultReference: HistoryContentBlock | null; startedAtMs: number | null; finishedAtMs: number | null;
}
export interface HistoryInteraction {
  responseProvenance?: MessageProvenance | null;
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
  canDeleteTurns?: boolean;
  sessionId: string; version: string; nextCursor: HistoryCursor | null; runs: HistoryRun[];
  records: { steps: HistoryStep[]; messages: HistoryMessage[]; toolInvocations: HistoryToolInvocation[]; interactions: HistoryInteraction[] };
  pendingInteractions: HistoryInteraction[]; activeRuns: HistoryRun[];
}
export interface HistoryMessageView { interactionToolIds?: Record<string, string>; message: HistoryMessage; step: HistoryStep | null; tools: HistoryToolInvocation[]; run: HistoryRun | null; interactions: HistoryInteraction[] }
export interface ChatHistoryLabels { loading: string; loadOlder: string; step: string; attempt: string; statuses: Record<HistoryStatus, string> }
export const defaultHistoryLabels: ChatHistoryLabels = { loading: "Loading history…", loadOlder: "Load earlier turns", step: "Step", attempt: "Attempt",
  statuses: { Running: "Running", Waiting: "Waiting", Completed: "Completed", Interrupted: "Interrupted", Failed: "Failed", Unknown: "Result unknown", Planned: "Planned", Approved: "Approved" } };

export function historyText(blocks: HistoryContentBlock[]): string {
  return blocks.filter((b): b is Extract<HistoryContentBlock, { type: "Text" | "Reasoning" }> => b.type === "Text").map((b) => b.text).join("");
}
/** Native execution identity survives protocol run aliases used by host adapters. */
export function historyEventRunId(event: { runId?: string | null; metadata?: unknown }): string {
  const metadata = event.metadata as { nativeRunId?: unknown } | undefined;
  const nativeId = metadataRecordWith(event.metadata, (record) => record !== metadata && typeof record.runId === "string")?.runId ?? metadata?.nativeRunId;
  return typeof nativeId === "string" ? nativeId : event.runId ?? "";
}
/** Projection of structured records; no AG-UI replay or checkpoint parsing. */
export function historyMessages(page: SessionHistory, labels?: ChatUserInputLabels): ChatMessage[] {
  const steps = new Map(page.records.steps.map((s) => [s.id, s]));
  // A model invocation can now contain multiple messages, but its usage is
  // charged once. Attach it to the last answer (or last visible message).
  const usageOwner = new Map<string, HistoryMessage>();
  for (const message of page.records.messages) {
    if (!message.stepId || message.role !== "Assistant" || !historyText(message.content).trim()) continue;
    const previous = usageOwner.get(message.stepId);
    if (!previous || previous.phase !== "final_answer" || message.phase === "final_answer") usageOwner.set(message.stepId, message);
  }
  const runs = new Map(page.runs.map((r) => [r.id, r]));
  const tools = new Map<string, HistoryToolInvocation[]>();
  page.records.toolInvocations.filter(t => !t.batch).forEach((t) => { const group = tools.get(t.messageId) ?? []; group.push(t); tools.set(t.messageId, group); });
  const interactionTools = new Map(page.records.interactions.map(i => [i.id,
    page.records.toolInvocations.find(t => t.runId === i.runId && (t.id === i.id || t.id === i.invocationId))
      ?? page.records.toolInvocations.find(t => {
        // ask_user creates its own interaction identity; the generated question
        // IDs in its structured result bind it without guessing from tool order.
        const questions = i.presentation?.questions;
        let output = t.structured as { interactionId?: string; questions?: { id?: string }[]; [key: string]: unknown } | null;
        if (!output) {
          try { output = JSON.parse(historyText(t.content)); } catch { /* Ordinary text output. */ }
        }
        const interactionId = output?.interactionId ?? (output && Object.entries(output).find(([key]) => key.endsWith("InteractionId"))?.[1]);
        if (t.runId === i.runId && interactionId === i.id) return true;
        return t.runId === i.runId && Array.isArray(questions) && questions.length > 0
          && output?.questions?.length === questions.length
          && questions.every((q, index) => (q as {id?: string}).id === output.questions![index]?.id);
      })]));
  const interactionsByMessage = new Map<string, HistoryInteraction[]>();
  page.records.interactions.forEach(i => {
    const messageId = interactionTools.get(i.id)?.messageId;
    if (!messageId) return;
    const group = interactionsByMessage.get(messageId) ?? [];
    group.push(i); interactionsByMessage.set(messageId, group);
  });
  const messages: ChatMessage[] = page.records.messages.map((message) => {
    const step = message.stepId ? steps.get(message.stepId) ?? null : null;
    const usage = message.stepId && usageOwner.get(message.stepId)?.id === message.id ? step?.usage : null;
    const text = historyText(message.content);
    // Older hosts delivered detached child completion through user steering.
    // Restore its host attribution when replaying those durable records.
    const provenance = message.role === "User" && /^后台子执行已完成（childRunId=[^，]+，status=/.test(text)
      ? { sender: { kind: "SYSTEM", displayName: "系统通知" }, source: "ChildRunCompletion" }
      : message.provenance;
    // Some failed attempts store the run diagnostic as assistant text as well.
    // Render that through the error view once, preserving the source record.
    const isRunDiagnostic = message.role === "Assistant" && text === runs.get(message.runId)?.error;
    return {
      id: message.id, messageId: message.id, sessionId: page.sessionId, runId: message.runId,
      phase: message.phase,
      role: message.role === "User" ? "USER" : "ASSISTANT", channel: "history", actor: provenance?.sender.displayName ?? (message.role === "User" ? "User" : "Assistant"), provenance,
      requestedSkills: message.requestedSkills ?? [], annotations: message.annotations ?? [],
      content: isRunDiagnostic ? "" : text, inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens,
      totalTokens: usage ? usage.inputTokens + usage.outputTokens : null,
      createdAt: new Date(message.createdAtMs).toISOString(), history: { message, step, tools: tools.get(message.id) ?? [], run: runs.get(message.runId) ?? null, interactions: interactionsByMessage.get(message.id) ?? [],
        interactionToolIds: Object.fromEntries((interactionsByMessage.get(message.id) ?? []).flatMap(i => {
          const tool = interactionTools.get(i.id);
          return tool ? [[i.id, tool.id]] : [];
        })) },
    };
  });
  // Submitted interactions keep only their folded answer summary. Never replay
  // their original controls, including after a history refresh.
  for (const interaction of page.records.interactions) {
    if (interaction.response == null || interactionTools.get(interaction.id)) continue;
    const run = runs.get(interaction.runId) ?? null;
    const createdAtMs = page.records.messages.filter(message => message.runId === interaction.runId).at(-1)?.createdAtMs ?? run?.startedAtMs ?? 0;
    const id = `interaction-request:${interaction.id}`;
    const message: HistoryMessage = { id, runId: interaction.runId, stepId: null,
      role: "Assistant", content: [], structured: null, status: "Completed", createdAtMs };
    messages.push({ id, messageId: id, sessionId: page.sessionId, runId: interaction.runId,
      role: "ASSISTANT", actor: "Assistant", channel: "history", content: "",
      createdAt: new Date(createdAtMs).toISOString(),
      history: { message, step: null, tools: [], run, interactions: [interaction] } });
  }
  return interactionMessages(messages.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)), [], undefined, labels)
    .filter(message => !message.messageId.startsWith("interaction-request:"));
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
    const approvalView = approval ? approvalPresentation(interaction.prompt, question) : undefined;
    const presented = interaction.presentation?.questions;
    return { requestId: interaction.id, sessionId: page.sessionId, runId: interaction.runId, intro: approvalView?.reason ?? question, status: "Pending" as const,
      expiresAtMs: interaction.expiresAtMs,
      ...(!approval && interaction.presentation?.kind === "a2ui" && Array.isArray(interaction.presentation.messages) ? { a2uiInteraction: { messages: interaction.presentation.messages, surfaceId: String((interaction.presentation.messages[0] as any)?.createSurface?.surfaceId ?? "") } } : {}),
      requestedAt: page.runs.find((r) => r.id === interaction.runId)?.startedAtMs ?? 0,
      questions: Array.isArray(presented) ? presented.map((entry: Record<string, unknown>) => ({
        questionId: String(entry.id ?? entry.questionId ?? ""), question: String(entry.question ?? ""),
        options: Array.isArray(entry.options) ? entry.options.map((option: Record<string, unknown>) => ({ optionId: String(option.id ?? option.optionId ?? ""), label: String(option.label ?? ""), description: typeof option.description === "string" ? option.description : undefined })) : [],
        allowCustomAnswer: entry.allow_free_text === true || entry.allowCustomAnswer === true,
        allowSkip: entry.allow_skip === true || entry.allowSkip === true,
      })) : [{ questionId: interaction.id, question, options, allowCustomAnswer: !choices.length, allowSkip: false }],
      nativeInteraction: { questionnaire:Array.isArray(presented), reason: approval ? "approval_required" : "input_required", responseSchema: schema, optionPayloads, ...(approval ? {details: {...(parseToolApprovalDetails(interaction.presentation) ?? {tool: page.records.toolInvocations.find(t=>t.id===interaction.invocationId)?.toolName ?? "", parameters: page.records.toolInvocations.find(t=>t.id===interaction.invocationId)?.arguments ?? {}}), risk: approvalView?.risk}} : {}) },
    };
  });
}

export function historyToolResult(tool: HistoryToolInvocation): string {
  if (tool.content.some(block => block.type === "Media" || block.type === "Resource" || block.type === "Json") || tool.structured != null || tool.resultReference != null) {
    return JSON.stringify({ content: tool.content, structured: tool.structured, resultReference: tool.resultReference, isError: tool.isError });
  }
  const text = historyText(tool.content);
  if (text) return text;
  return "";
}

/** Restrict media/link schemes supplied by history records. */
export function historyBlockUrl(block: HistoryContentBlock): string | null {
  const url = block.type === "Resource" ? block.uri : block.type === "Media" ? block.source.type === "url" ? block.source.value : `data:${block.mimeType};base64,${block.source.value}` : "";
  return /^(https?:\/\/|\/(?!\/))/i.test(url) || block.type === "Media" && /^data:image\/(png|jpeg|gif|webp);base64,/i.test(url) ? url : null;
}
