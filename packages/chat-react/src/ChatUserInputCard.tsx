import { useEffect, useMemo } from "react";
import { A2UIClient } from "@eliteforge/agent-ui-a2ui-core";
import { A2UISurface } from "@eliteforge/agent-ui-a2ui-react";
import { interactionEnvelopes, type ChatUserInputAnswer, type ChatUserInputLabels, type ChatUserInputRequest } from "@eliteforge/agent-ui-chat-core";
export function ChatUserInputCard({ disabled = false, labels, onSubmit, request }: { disabled?: boolean; labels?: ChatUserInputLabels; onSubmit: (answers: ChatUserInputAnswer[]) => void; request: ChatUserInputRequest }) {
  const presentationKey = JSON.stringify([request.a2uiInteraction ?? null, labels ?? null]);
  const client = useMemo(() => { const c = new A2UIClient(); for (const envelope of request.a2uiInteraction?.messages ?? interactionEnvelopes(request, labels)) c.apply(envelope); return c; }, [request.requestId, presentationKey]);
  const surfaceId = request.a2uiInteraction?.surfaceId ?? `interaction:${request.requestId}`;
  useEffect(() => { if (request.a2uiInteraction) return; client.apply({ version: "v0.9.1", updateDataModel: { surfaceId, path: "/status", value: disabled ? "Submitting" : request.status } }); }, [client, disabled, request.status, surfaceId]);
  return <fieldset disabled={disabled || request.status !== "Pending" || Boolean(request.expiresAtMs && request.expiresAtMs <= Date.now())} style={{border:0,margin:0,padding:0,minWidth:0}}><A2UISurface client={client} surfaceId={surfaceId} onAction={message => {
    if(request.a2uiInteraction) {onSubmit([{questionId:request.requestId,answerKind:"Other",optionId:null,otherText:JSON.stringify(message.action.context.response)}]);return;}
    const value = message.action.context.answer;
    if (typeof value === "boolean") {
      const option = Object.entries(request.nativeInteraction?.optionPayloads ?? {}).find(([, payload]) => payload === value);
      if (option) onSubmit([{ questionId: request.requestId, answerKind: "Option", optionId: option[0], otherText: null }]);
    } else onSubmit(Object.values(value ?? {}));
  }} /></fieldset>;
}
