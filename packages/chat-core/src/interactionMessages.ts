import { historyApprovalResponse, interactionSummary, submittedApprovalResponse, submittedFormSummary } from "./interactionSummary";
import { detectToolPresentationLocale } from "./toolPresentation";
import { toolDisplayName } from "./transcript";
import { approvalResponseSummary } from "./approvalPresentation";
import type { ChatApprovalResponse, ChatMessage, ChatUserInputLabels, ChatUserInputRequest, ChatWorkRailLabels } from "./types";

/** Keep accepted answers in the transcript, outside the agent's work details. */
export function interactionMessages(messages: readonly ChatMessage[], requests: readonly ChatUserInputRequest[] = [], labels?: ChatWorkRailLabels, inputLabels?: Partial<ChatUserInputLabels>): ChatMessage[] {
  const summaryContent = (rows: { label: string; value: string }[]) => rows.map(row => `${row.label}\n${row.value}`).join("\n\n");
  const result = messages.map(message => {
    if (!message.interactionResponse?.approval) return message;
    const rows = approvalResponseSummary(message.interactionResponse.approval, inputLabels, labels?.tool?.resolveName);
    return { ...message, content: summaryContent(rows), interactionResponse: { ...message.interactionResponse, rows } };
  });
  const seen = new Set(messages.flatMap(message => message.interactionResponse ? [message.interactionResponse.requestId] : []));
  const legacyAnswers = messages.filter(message => message.role === "USER" && /^(The user answered the questions you asked:|用户回答了你提出的问题：)/.test(message.content.trimStart()));
  const claimedLegacy = new Set<string>();
  function insert(source: ChatMessage | undefined, requestId: string, runId: string, rows: { label: string; value: string }[], timestamp?: number, provenance?: ChatMessage["provenance"], approval?: ChatApprovalResponse, kind: "form" | "question" = "question", toolCallId?: string) {
    if (!source || seen.has(requestId)) return;
    seen.add(requestId);
    const legacy = legacyAnswers.find(message => !claimedLegacy.has(message.messageId) && message.runId === runId);
    if (legacy) {
      claimedLegacy.add(legacy.messageId);
      const index = result.findIndex(message => message.messageId === legacy.messageId);
      result[index] = { ...legacy, content: summaryContent(rows), interactionResponse: { requestId, rows, toolCallId, kind: approval ? "approval" : kind, ...(approval ? { approval } : {}) }, provenance: provenance ?? legacy.provenance };
      return;
    }
    const id = `interaction:${requestId}`;
    const createdAtMs = timestamp ?? Date.parse(source.createdAt) + 1;
    const response: ChatMessage = { id, messageId: id, sessionId: source.sessionId, runId, role: "USER", channel: "interaction",
      actor: provenance?.sender.displayName ?? "User", provenance,
      content: summaryContent(rows), interactionResponse: { requestId, rows, toolCallId, kind: approval ? "approval" : kind, answeredAt: timestamp, ...(approval ? { approval } : {}) },
      createdAt: new Date(Number.isFinite(createdAtMs) ? createdAtMs : 0).toISOString() };
    let index = result.findIndex(message => message.messageId === source.messageId) + 1;
    while (result[index]?.interactionResponse && result[index].runId === runId) index += 1;
    result.splice(index, 0, response);
  }
  for (const message of messages) for (const interaction of message.history?.interactions ?? []) {
    if (interaction.response == null) continue;
    const toolCallId = message.history?.interactionToolIds?.[interaction.id] ?? interaction.invocationId ?? undefined;
    const tool = message.history?.tools.find(tool => tool.id === toolCallId);
    const toolDetails = tool ? { tool: tool.toolName, parameters: tool.arguments } : undefined;
    const approval = historyApprovalResponse(interaction, toolDetails);
    insert(message, interaction.id, interaction.runId ?? message.runId ?? "",
      interactionSummary(interaction, { labels: inputLabels, resolveToolName: labels?.tool?.resolveName, toolDetails }),
      undefined, interaction.responseProvenance ?? undefined, approval, (interaction.presentation as {kind?: string} | null)?.kind === "a2ui" ? "form" : "question", toolCallId);
  }
  for (const request of requests) {
    if (request.status !== "Answered") continue;
    const source = messages.find(message => message.messageId === request.assistantMessageId)
      ?? [...messages].reverse().find(message => message.role === "ASSISTANT" && message.runId === request.runId)
      ?? [...messages].reverse().find(message => message.runId === request.runId)
      ?? [...messages].reverse().find(message => message.sessionId === request.sessionId)
      ?? { id: "", messageId: "", sessionId: request.sessionId, role: "ASSISTANT" as const, channel: "interaction", actor: "Assistant", content: "", createdAt: new Date(request.requestedAt).toISOString() };
    const approval = submittedApprovalResponse(request);
    const rows = approval ? approvalResponseSummary(approval, inputLabels, labels?.tool?.resolveName)
      : request.a2uiInteraction ? submittedFormSummary(request) : request.questions.map(question => {
      const answer = request.answers?.find(item => item.questionId === question.questionId);
      const value = answer?.answerKind === "Skipped" ? labels?.skipped ?? "Skipped"
        : answer?.answerKind === "Other" ? answer.otherText ?? ""
        : question.options.find(option => option.optionId === answer?.optionId)?.label ?? answer?.optionId ?? "—";
      return { label: question.question, value };
    });
    insert(source, request.requestId, request.runId, rows, request.answeredAt ?? undefined, undefined, approval, request.a2uiInteraction ? "form" : "question");
  }
  const locale = detectToolPresentationLocale(undefined, [labels?.ariaLabel, labels?.thinking, inputLabels?.responseSubmitted, inputLabels?.approved]);
  const zh = locale === "zh-CN";
  return result.map(message => {
    const response = message.interactionResponse;
    if (!response) return message;
    const kind = response.approval ? "approval" : response.kind ?? "question";
    const approval = response.approval;
    const action = approval?.tool ? (labels?.tool?.resolveName?.(approval.tool, approval.parameters) || toolDisplayName(approval.tool, approval.parameters, undefined, locale)) : "";
    const summaryLabel = approval
      ? zh ? `${approval.approved ? "已批准" : "已拒绝"}${action || "操作"}` : `${approval.approved ? "Approved" : "Rejected"} ${action || "operation"}`
      : kind === "form" ? (zh ? "已提供数据" : "Data provided") : (zh ? "已解答疑惑" : "Questions answered");
    return { ...message, interactionResponse: { ...response, kind, summaryLabel } };
  });
}
