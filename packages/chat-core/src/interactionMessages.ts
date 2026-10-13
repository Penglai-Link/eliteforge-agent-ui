import { interactionSummary, submittedFormSummary } from "./interactionSummary";
import type { ChatMessage, ChatUserInputRequest, ChatWorkRailLabels } from "./types";

/** Keep accepted answers in the transcript, outside the agent's work details. */
export function interactionMessages(messages: readonly ChatMessage[], requests: readonly ChatUserInputRequest[] = [], labels?: ChatWorkRailLabels): ChatMessage[] {
  const result = [...messages];
  const seen = new Set(messages.flatMap(message => message.interactionResponse ? [message.interactionResponse.requestId] : []));
  const legacyAnswers = messages.filter(message => message.role === "USER" && /^(The user answered the questions you asked:|用户回答了你提出的问题：)/.test(message.content.trimStart()));
  const claimedLegacy = new Set<string>();
  function insert(source: ChatMessage | undefined, requestId: string, runId: string, rows: { label: string; value: string }[], timestamp?: number, provenance?: ChatMessage["provenance"]) {
    if (!source || seen.has(requestId)) return;
    seen.add(requestId);
    const legacy = legacyAnswers.find(message => !claimedLegacy.has(message.messageId) && message.runId === runId);
    if (legacy) {
      claimedLegacy.add(legacy.messageId);
      result[result.indexOf(legacy)] = { ...legacy, interactionResponse: { requestId, rows }, provenance: provenance ?? legacy.provenance };
      return;
    }
    const id = `interaction:${requestId}`;
    const createdAtMs = timestamp ?? Date.parse(source.createdAt) + 1;
    const response: ChatMessage = { id, messageId: id, sessionId: source.sessionId, runId, role: "USER", channel: "interaction",
      actor: provenance?.sender.displayName ?? "User", provenance,
      content: rows.map(row => `${row.label}\n${row.value}`).join("\n\n"), interactionResponse: { requestId, rows, answeredAt: timestamp },
      createdAt: new Date(Number.isFinite(createdAtMs) ? createdAtMs : 0).toISOString() };
    let index = result.indexOf(source) + 1;
    while (result[index]?.interactionResponse && result[index].runId === runId) index += 1;
    result.splice(index, 0, response);
  }
  for (const message of messages) for (const interaction of message.history?.interactions ?? []) {
    if (interaction.response != null) insert(message, interaction.id, interaction.runId ?? message.runId ?? "", interactionSummary(interaction), undefined, interaction.responseProvenance ?? undefined);
  }
  for (const request of requests) {
    if (request.status !== "Answered") continue;
    const source = messages.find(message => message.messageId === request.assistantMessageId)
      ?? [...messages].reverse().find(message => message.role === "ASSISTANT" && message.runId === request.runId)
      ?? [...messages].reverse().find(message => message.runId === request.runId)
      ?? [...messages].reverse().find(message => message.sessionId === request.sessionId)
      ?? { id: "", messageId: "", sessionId: request.sessionId, role: "ASSISTANT" as const, channel: "interaction", actor: "Assistant", content: "", createdAt: new Date(request.requestedAt).toISOString() };
    const rows = request.a2uiInteraction ? submittedFormSummary(request) : request.questions.map(question => {
      const answer = request.answers?.find(item => item.questionId === question.questionId);
      const value = answer?.answerKind === "Skipped" ? labels?.skipped ?? "Skipped"
        : answer?.answerKind === "Other" ? answer.otherText ?? ""
        : question.options.find(option => option.optionId === answer?.optionId)?.label ?? answer?.optionId ?? "—";
      return { label: question.question, value };
    });
    insert(source, request.requestId, request.runId, rows, request.answeredAt ?? undefined);
  }
  return result;
}
