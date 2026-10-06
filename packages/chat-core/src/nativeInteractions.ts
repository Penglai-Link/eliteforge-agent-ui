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
    return {
      requestId: interrupt.id, sessionId, runId: terminal.runId!, intro: question, status: "Pending" as const,
      requestedAt: terminal.timestamp ?? 0,
      questions: [{ questionId: interrupt.id, question, options, allowCustomAnswer: !choices.length, allowSkip: false }],
      nativeInteraction: { reason: interrupt.reason, responseSchema: interrupt.responseSchema, optionPayloads },
    };
  });
}

/** Keep native payloads as JSON values; the Framework remains the schema authority. */
export function nativeUserInputAnswer(request: ChatUserInputRequest, answers: ChatUserInputAnswer[]): ChatUserInputAnswerInput {
  const native = request.nativeInteraction;
  if (!native) return { answers };
  const answer = answers.find((entry) => entry.questionId === request.requestId);
  if (!answer || answer.answerKind === "Skipped") throw new Error("An interaction answer is required");
  let payload: unknown;
  if (answer.answerKind === "Option" && answer.optionId && Object.prototype.hasOwnProperty.call(native.optionPayloads, answer.optionId)) {
    payload = native.optionPayloads[answer.optionId];
  } else if (answer.answerKind === "Other" && request.questions[0]?.allowCustomAnswer) {
    const text = answer.otherText ?? "";
    const schema = record(native.responseSchema);
    if (schema.type === "string") payload = text;
    else { try { payload = JSON.parse(text); } catch { throw new Error("Enter a valid JSON answer"); } }
  } else throw new Error("Select a valid interaction answer");
  return { answers: [], resume: [{ interruptId: request.requestId, status: "resolved", payload }] };
}
