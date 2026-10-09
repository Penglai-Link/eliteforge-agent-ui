import "@eliteforge/agent-ui-a2ui-react/styles.css";
import { useMemo } from "react";
import { A2UIClient, type ActionHandler } from "@eliteforge/agent-ui-a2ui-core";
import { A2UISurface } from "@eliteforge/agent-ui-a2ui-react";
import type { ChatA2uiActionHandler, ChatA2uiSession, ChatMessage } from "@eliteforge/agent-ui-chat-core";

export function ChatA2UI({ message, onAction, runtime, disabled }: { message: ChatMessage; onAction?: ChatA2uiActionHandler; runtime?: ChatA2uiSession; disabled?: boolean }) {
  const result = useMemo(() => {
    const client = (message.a2ui?.messages.length === 0 ? runtime?.client : undefined) ?? new A2UIClient();
    try {
      for (const envelope of message.a2ui?.messages ?? []) client.apply(envelope);
      return { client, error: false };
    } catch { return { client, error: true }; }
  }, [message.a2ui, runtime]);
  if (result.error) return <div role="alert">Invalid A2UI message</div>;
  return <div className="ef-chat__a2ui">{(message.a2ui?.surfaceIds ?? Object.keys(result.client.getSnapshot().surfaces)).map(surfaceId =>
    <fieldset key={surfaceId} disabled={disabled || message.channel === "history" || runtime?.getSurface(surfaceId)?.mode === "Display"} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><A2UISurface client={result.client} surfaceId={surfaceId} onAction={(action, metadata) => { const surface = runtime?.getSurface(surfaceId); onAction?.(action, surface ? runtime!.metadata(surface.ownerAgentId) : metadata, surface ? { sessionId: message.sessionId, messageId: message.messageId, surface } : undefined); }} /></fieldset>
  )}</div>;
}
