import type { ChatApprovalResponse, ChatToolWorkLabels, ChatUserInputLabels, ChatUserInputRequest } from "./types";
import type { HistoryInteraction } from "./history";
import { parseToolApprovalDetails, type ToolApprovalDetails } from "./toolBatch";
import { approvalResponseSummary } from "./approvalPresentation";

export interface InteractionSummaryRow { label: string; value: string }
interface InteractionSummaryOptions {
  labels?: Partial<ChatUserInputLabels>;
  resolveToolName?: ChatToolWorkLabels["resolveName"];
  toolDetails?: ToolApprovalDetails;
}
const record = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const text = (value: unknown): string => typeof value === "string" ? value : typeof record(value).literalString === "string" ? record(value).literalString : "";
function readable(value: unknown, choices: any[] = []): string {
  if (Array.isArray(value)) return value.map(v => readable(v, choices)).join("、");
  const choice = choices.find(c => c.value === value || c.id === value || c.optionId === value);
  if (choice) return text(choice.label) || String(value);
  if (value == null) return "—";
  if (typeof value === "object") return Object.entries(value).map(([k, v]) => `${k}：${readable(v)}`).join("；");
  return String(value);
}
/** Uses presentation labels rather than transport IDs and JSON envelopes. */
export function interactionSummary(interaction: HistoryInteraction, options?: InteractionSummaryOptions): InteractionSummaryRow[] {
  const approval = historyApprovalResponse(interaction, options?.toolDetails);
  if (approval) return approvalResponseSummary(approval, options?.labels, options?.resolveToolName);
  const presentation = record(interaction.presentation), response = record(interaction.response);
  if (Array.isArray(presentation.questions)) return presentation.questions.map(q => {
    const answer = record(record(response.answers)[q.id ?? q.questionId]);
    return { label: String(q.question ?? ""), value: answer.skip ? "—" : answer.option_id
      ? readable(answer.option_id, q.options ?? []) : readable(answer.text) };
  });
  const fields = new Map<string, {label: string; choices: any[]}>();
  for (const message of presentation.messages ?? []) {
    for (const component of record(message.updateComponents).components ?? []) {
      const path = record(component.value).path;
      if (typeof path !== "string") continue;
      fields.set(path.replace(/^\//, ""), { label: text(component.label) || text(component.title), choices: component.options ?? [] });
    }
  }
  const properties = record(interaction.responseSchema.properties);
  if (interaction.response !== null && typeof interaction.response === "object" && !Array.isArray(interaction.response)) {
    return Object.entries(response).map(([key, value]) => {
      const field = fields.get(key);
      return { label: field?.label || text(record(properties[key]).title) || key, value: readable(value, field?.choices) };
    });
  }
  return [{ label: interaction.prompt.filter(b => b.type === "Text").map(b => (b as {text:string}).text).join(""), value: readable(interaction.response) }];
}

export function historyApprovalResponse(interaction: HistoryInteraction, toolDetails?: ToolApprovalDetails): ChatApprovalResponse | undefined {
  if (typeof interaction.response !== "boolean") return undefined;
  const details = parseToolApprovalDetails(interaction.presentation) ?? toolDetails;
  if (!details && !interaction.invocationId && interaction.responseSchema.type !== "boolean") return undefined;
  return { approved: interaction.response, tool: details?.tool ?? "", parameters: details?.parameters ?? {} };
}

export function submittedApprovalResponse(request: ChatUserInputRequest): ChatApprovalResponse | undefined {
  const native = request.nativeInteraction;
  if (!native || native.questionnaire || (native.reason !== "approval_required" && record(native.responseSchema).type !== "boolean")) return undefined;
  const answer = request.answers?.find(item => item.questionId === request.requestId);
  if (answer?.answerKind !== "Option" || !answer.optionId) return undefined;
  const approved = native.optionPayloads[answer.optionId];
  if (typeof approved !== "boolean") return undefined;
  const details = parseToolApprovalDetails(native.details);
  return { approved, tool: details?.tool ?? "", parameters: details?.parameters ?? {} };
}

/** Interaction tools describe the request; answers are shown in the interaction. */
export function interactionToolSummary(toolName: string, args: unknown): string[] | null {
  if (!/^(chat[._]ask_user|a2ui[._]request_input)$/.test(toolName)) return null;
  const input = record(typeof args === "string" ? parse(args) : args);
  if (Array.isArray(input.questions)) return input.questions.map(q => text(q.question)).filter(Boolean);
  const labels: string[] = [];
  for (const message of input.messages ?? []) for (const component of record(message.updateComponents).components ?? []) {
    const label = text(component.label);
    if (label && record(component.value).path) labels.push(label);
  }
  return labels;
}
function parse(value: string): unknown { try { return JSON.parse(value); } catch { return {}; } }

export function interactionSummaryTitle(interaction: HistoryInteraction): string {
  const presentation = record(interaction.presentation);
  if (presentation.kind === "a2ui") {
    for (const message of presentation.messages ?? []) {
      const heading = (record(message.updateComponents).components ?? []).find((c: any) => c.component === "Text" && /^h[1-6]$/.test(c.variant));
      if (heading) return text(heading.text);
    }
  }
  return interaction.prompt.filter(b => b.type === "Text").map(b => (b as {text:string}).text).join("");
}

export function submittedFormSummary(request: ChatUserInputRequest): InteractionSummaryRow[] {
  const answer = request.answers?.find(a => a.questionId === request.requestId);
  return interactionSummary({ id: request.requestId, runId: request.runId, invocationId: null,
    prompt: [{type:"Text",text:request.intro ?? ""}], responseSchema: {}, expiresAtMs: null,
    presentation: {kind:"a2ui",messages:request.a2uiInteraction?.messages ?? []},
    response: parse(answer?.otherText ?? "null") });
}
