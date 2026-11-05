import { historyEventRunId, type SessionHistory } from "./history";
import { parseToolApprovalDetails } from "./toolBatch";
import { approvalPresentation } from "./approvalPresentation";
import { isAguiPresentationFailureEvent } from "./transcript";
import type { ChatAguiStreamEvent, ChatUserInputAnswer, ChatUserInputAnswerInput, ChatUserInputLabels, ChatUserInputRequest } from "./types";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Project the authoritative latest native pause into the existing question controls. */
export function nativeUserInputRequests(events: ChatAguiStreamEvent[], sessionId: string, labels?: Partial<ChatUserInputLabels>): ChatUserInputRequest[] {
  const terminal = events.filter((event) => !event.threadId || event.threadId === sessionId).slice().reverse()
    .find((event) => ["RUN_STARTED", "RUN_FINISHED", "RUN_ERROR"].includes(event.type) && !isAguiPresentationFailureEvent(event));
  if (terminal?.type !== "RUN_FINISHED" || terminal.outcome?.type !== "interrupt" || !terminal.runId) return [];
  return terminal.outcome.interrupts.filter((interrupt) => !Array.isArray(interrupt.metadata?.questions)).map((interrupt) => {
    const interaction = record(interrupt.metadata?.interaction);
    const presentation = record(interaction.presentation);
    const schema = record(interrupt.responseSchema);
    const approval = interrupt.reason === "approval_required" || schema.type === "boolean";
    const choices = approval ? [true, false] : Array.isArray(schema.enum) ? schema.enum : "const" in schema ? [schema.const] : [];
    const optionPayloads: Record<string, unknown> = {};
    const options = choices.map((payload, index) => {
      const optionId = "NATIVE-" + index;
      optionPayloads[optionId] = payload;
      return { optionId, label: approval ? payload ? labels?.approve ?? "Approve" : labels?.reject ?? "Reject" : typeof payload === "string" ? payload : JSON.stringify(payload) };
    });
    const question = interrupt.message || (typeof schema.title === "string" ? schema.title : "Input required");
    const approvalView = approval ? approvalPresentation(interaction.prompt, question) : undefined;
    return {
      requestId: interrupt.id, sessionId, runId: terminal.runId!, intro: approvalView?.reason ?? question, status: "Pending" as const,
      ...(typeof interaction.expires_at_unix_ms === "number" ? { expiresAtMs: interaction.expires_at_unix_ms } : {}),
      ...(!approval && presentation.kind === "a2ui" && Array.isArray(presentation.messages) ? { a2uiInteraction: {messages: presentation.messages, surfaceId: String((presentation.messages[0] as any)?.createSurface?.surfaceId ?? "")} } : {}),
      requestedAt: terminal.timestamp ?? 0,
      questions: Array.isArray(presentation.questions) ? presentation.questions.map((q: any)=>({questionId:String(q.id),question:String(q.question),options:(q.options??[]).map((o:any)=>({optionId:String(o.id),label:String(o.label),description:o.description})),allowCustomAnswer:q.allow_free_text,allowSkip:q.allow_skip})) : [{ questionId: interrupt.id, question, options, allowCustomAnswer: !choices.length, allowSkip: false }],
      nativeInteraction: { questionnaire:Array.isArray(presentation.questions), reason: interrupt.reason, responseSchema: interrupt.responseSchema, optionPayloads, ...(approval ? {details:{...parseToolApprovalDetails(presentation), risk: approvalView?.risk}} : {}) },
    };
  });
}

/** Terminal execution evidence wins over retained pending history. Presentation
 * failures and individual DAG node endings do not close the owning run. */
export function activeNativeUserInputRequests(requests: ChatUserInputRequest[], events: ChatAguiStreamEvent[],
  sessionId: string, history?: SessionHistory | null): ChatUserInputRequest[] {
  const closed = new Set((history?.runs ?? []).filter(run =>
    !["Running", "Waiting", "Planned", "Approved"].includes(run.status)).map(run => run.id));
  const answered = new Set((history?.records.interactions ?? []).filter(item => item.response != null).map(item => item.id));
  const aliases = new Map<string, string>();
  for (const event of events) {
    if (event.threadId && event.threadId !== sessionId) continue;
    const nativeId = historyEventRunId(event);
    if (event.runId) aliases.set(event.runId, nativeId);
    if (record(record(event.metadata).framework).node || isAguiPresentationFailureEvent(event)) continue;
    if (event.type === "RUN_ERROR" || event.type === "RUN_FINISHED" && event.outcome?.type !== "interrupt") closed.add(nativeId);
  }
  return requests.filter(request => !request.nativeInteraction || request.status !== "Pending"
    || !answered.has(request.requestId) && !closed.has(aliases.get(request.runId) ?? request.runId));
}

/** Keep native payloads as JSON values; the Framework remains the schema authority. */
export function nativeUserInputAnswer(request: ChatUserInputRequest, answers: ChatUserInputAnswer[]): ChatUserInputAnswerInput {
  const native = request.nativeInteraction;
  if (!native) return { answers };
  if (native.questionnaire) {
    return {answers:[],resume:[{interruptId:request.requestId,status:"resolved",payload:{answers:Object.fromEntries(answers.map(a=>[a.questionId,a.answerKind === "Option" ? {option_id:a.optionId} : a.answerKind === "Skipped" ? {skip:true} : {text:a.otherText}]))}}]};
  }
  const answer = answers.find((entry) => entry.questionId === request.requestId);
  if (!answer || answer.answerKind === "Skipped") throw new Error("An interaction answer is required");
  let payload: unknown;
  if (answer.answerKind === "Option" && answer.optionId && Object.prototype.hasOwnProperty.call(native.optionPayloads, answer.optionId)) {
    payload = native.optionPayloads[answer.optionId];
  } else if (answer.answerKind === "Other" && request.questions[0]?.allowCustomAnswer) {
    const text = answer.otherText ?? "";
    const schema = record(native.responseSchema);
    if (schema.type === "string" && !request.a2uiInteraction) payload = text;
    else { try { payload = JSON.parse(text); } catch { throw new Error("Enter a valid JSON answer"); } }
  } else throw new Error("Select a valid interaction answer");
  return { answers: [], resume: [{ interruptId: request.requestId, status: "resolved", payload }] };
}

/** All approvals in a paused run form one decision barrier. No tool is resumed
 * until each card has an explicit decision; unrelated questions stay separate. */
export function pendingApprovalRequests(request: ChatUserInputRequest, requests: ChatUserInputRequest[]): ChatUserInputRequest[] {
  const isApproval = (item: ChatUserInputRequest) => item.nativeInteraction?.reason === "approval_required"
    || record(item.nativeInteraction?.responseSchema).type === "boolean";
  if (!isApproval(request)) return [request];
  return [...new Map([...requests, request].filter(item => item.status === "Pending"
    && item.sessionId === request.sessionId && item.runId === request.runId && isApproval(item))
    .map(item => [item.requestId, item])).values()];
}

export function nativeUserInputBatchAnswer(requests: ChatUserInputRequest[], answers: ChatUserInputAnswer[]): ChatUserInputAnswerInput {
  if (requests.length === 1) return nativeUserInputAnswer(requests[0], answers);
  return { answers: [], resume: requests.flatMap(request => nativeUserInputAnswer(request, answers).resume ?? []) };
}

/** Resolve every pending approval using its own schema-backed option IDs. */
export function batchApprovalDecisions(requests: ChatUserInputRequest[], approved: boolean): Record<string, ChatUserInputAnswer[]> | null {
  if (!requests.length) return null;
  const decisions: Record<string, ChatUserInputAnswer[]> = {};
  for (const request of requests) {
    if (request.status !== "Pending" || request.expiresAtMs != null && request.expiresAtMs <= Date.now()) return null;
    const option = Object.entries(request.nativeInteraction?.optionPayloads ?? {}).find(([, value]) => value === approved);
    if (!option) return null;
    decisions[request.requestId] = [{ questionId: request.requestId, answerKind: "Option", optionId: option[0], otherText: null }];
  }
  return decisions;
}
