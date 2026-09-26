import {
  buildMockStreamingEvents,
} from "./transcript";
import type {
  ChatAdapter,
  ChatAguiEvent,
  ChatAguiStreamEvent,
  ChatMessage,
  ChatSendResult,
  ChatSession,
  CreateChatSessionInput,
  SendChatMessageInput,
} from "./types";

function nowIso() {
  return new Date().toISOString();
}

export function createMockChatAdapter(options: { eventDelayMs?: number } = {}): ChatAdapter {
  const sessions = new Map<string, ChatSession>();
  const messagesBySession = new Map<string, ChatMessage[]>();
  const protocolEventsBySession = new Map<string, ChatAguiStreamEvent[]>();

  return {
    capabilities: {
      supportsAbort: true,
      supportsActiveRun: false,
      supportsAgui: true,
      supportsProtocolReplay: true,
      supportsSteer: false,
      supportsStop: false,
      supportsStreaming: true,
    },
    async createSession(input: CreateChatSessionInput) {
      const sessionId = `SESSION-${sessions.size + 1}`;
      const session: ChatSession = {
        createdAt: nowIso(),
        id: sessions.size + 1,
        lastRunId: null,
        lastRunStatus: null,
        sessionId,
        status: "ACTIVE",
        title: input.title ?? "New chat",
        updatedAt: nowIso(),
      };
      sessions.set(sessionId, session);
      messagesBySession.set(sessionId, []);
      protocolEventsBySession.set(sessionId, []);
      return session;
    },
    async deleteSession(sessionId: string) {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error("Chat session was not found");
      }
      sessions.delete(sessionId);
      messagesBySession.delete(sessionId);
      protocolEventsBySession.delete(sessionId);
      return session;
    },
    async loadAguiEvents() {
      return [] satisfies ChatAguiEvent[];
    },
    async loadMessages(sessionId: string) {
      return [...(messagesBySession.get(sessionId) ?? [])];
    },
    async loadProtocolEvents(sessionId: string) {
      return [...(protocolEventsBySession.get(sessionId) ?? [])];
    },
    async streamMessage(session, input, handlers, signal) {
      if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      const runId = `RUN-${Date.now()}`;
      const assistantContent = `Echo: ${input.content}`;
      const existing = messagesBySession.get(session.sessionId) ?? [];
      const userMessage: ChatMessage = {
        actor: "User",
        channel: "conversation",
        content: input.content,
        createdAt: nowIso(),
        id: existing.length + 1,
        messageId: `${runId}-USER`,
        role: "USER",
        runId: null,
        sessionId: session.sessionId,
      };
      const assistantMessage: ChatMessage = {
        actor: session.displayName ?? "Assistant",
        channel: "conversation",
        content: assistantContent,
        createdAt: nowIso(),
        id: existing.length + 2,
        messageId: `${runId}-ASSISTANT`,
        role: "ASSISTANT",
        runId,
        sessionId: session.sessionId,
      };
      const result: ChatSendResult = {
        messages: [userMessage, assistantMessage],
        run: {
          finalOutput: assistantContent,
          runId,
          status: "COMPLETED",
          stepCount: 2,
        },
        session: {
          ...session,
          lastRunId: runId,
          lastRunStatus: "COMPLETED",
          updatedAt: nowIso(),
        },
      };
      const events = buildMockStreamingEvents(session.sessionId, runId, assistantMessage.messageId, assistantContent);
      for (const event of events) {
        if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
        if (options.eventDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.eventDelayMs));
          if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
        }
        handlers?.onAguiEvent?.(event);
        if (event.type === "TEXT_MESSAGE_CONTENT" && typeof event.delta === "string") {
          handlers?.onDelta?.(event.delta);
        }
      }
      sessions.set(session.sessionId, result.session);
      messagesBySession.set(session.sessionId, [...existing, ...result.messages]);
      protocolEventsBySession.set(session.sessionId, [...(protocolEventsBySession.get(session.sessionId) ?? []), ...events]);
      return result;
    },
  };
}
