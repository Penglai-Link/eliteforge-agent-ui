import type { ChatUserInputLabels, ChatUserInputRequest } from "./types";
export const AGENT_CATALOG_ID = "https://eliteforge.dev/a2ui/v0.9.1/agent";
export function interactionEnvelopes(request: ChatUserInputRequest, labels?: ChatUserInputLabels, submitting = false): unknown[] {
  const surfaceId = `interaction:${request.requestId}`;
  const approval = request.nativeInteraction?.reason === "approval_required" || request.nativeInteraction?.responseSchema && (request.nativeInteraction.responseSchema as any).type === "boolean";
  const strings = Object.fromEntries(Object.entries(labels ?? {}).filter(([, v]) => typeof v === "string"));
  request.questions.forEach((_, i) => {
    if (labels?.progress) strings[`progress.${i+1}`] = labels.progress(i+1, request.questions.length);
    if (labels?.otherAnswerAriaLabel) strings[`otherAnswerAriaLabel.${i+1}`] = labels.otherAnswerAriaLabel(i+1);
  });
  const answers = Object.fromEntries((request.answers ?? []).map(a => [a.questionId, a]));
  return [
    { version: "v0.9.1", createSurface: { surfaceId, catalogId: AGENT_CATALOG_ID } },
    { version: "v0.9.1", updateComponents: { surfaceId, components: [{ id: "root", component: approval ? "ApprovalCard" : "QuestionCard", intro: request.intro, value: { path: "/answer" }, status: { path: "/status" }, labels: strings,
      ...(request.expiresAtMs ? {expiresAtMs:request.expiresAtMs} : {}), ...(approval ? {details:request.nativeInteraction?.details ?? {}} : { questions: request.questions }), action: { event: { name: "interaction.submit", context: { answer: { path: "/answer" } } } } }] } },
    { version: "v0.9.1", updateDataModel: { surfaceId, value: { answer: approval ? null : answers, status: submitting ? "Submitting" : request.status } } },
  ];
}
