import type { ChatAguiStreamEvent, ChatMessage, ChatSession } from "./types";
import { historyEventRunId } from "./history";
import { aguiEventStableKey } from "./transcript";
import { mergeChatMessagesChronologically } from "./chatMessages";

interface StreamMessage {
  message: ChatMessage;
  wireRunId: string;
  ended: boolean;
}

export interface AssistantMessageUpdate {
  message: ChatMessage;
  delta?: string;
  ended: boolean;
}

/** One protocol message is one card, from its first token through history recovery.
 * The text-only onDelta transport remains a fallback for adapters without IDs.
 */
export class AssistantMessageStream {
  private readonly messages = new Map<string, StreamMessage>();
  private readonly seen = new Set<string>();
  private readonly unkeyed = new WeakSet<object>();
  private readonly ignored = new Set<string>();
  private hasIdentity = false;
  private lastCreatedAt = 0;
  private activeId: string | null = null;

  constructor(private readonly session: Pick<ChatSession, "sessionId" | "displayName">) {}

  get identified() { return this.hasIdentity; }
  get activeMessageId() { return this.activeId; }
  get messageIds() { return [...this.messages.keys()]; }

  receive(event: ChatAguiStreamEvent): AssistantMessageUpdate | null {
    if (event.threadId && event.threadId !== this.session.sessionId) return null;
    const type = event.type.toUpperCase();
    if (!["TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END"].includes(type)
        || !event.messageId) return null;
    this.hasIdentity = true;
    if (type === "TEXT_MESSAGE_START" && event.role && event.role !== "assistant") this.ignored.add(event.messageId);
    if (this.ignored.has(event.messageId)) return null;
    const key = aguiEventStableKey(event);
    if (key ? this.seen.has(key) : this.unkeyed.has(event)) return null;
    if (key) this.seen.add(key); else this.unkeyed.add(event);
    let state = this.messages.get(event.messageId);
    if (!state) {
      if (type === "TEXT_MESSAGE_END") return null;
      const timestamp = typeof event.timestamp === "number" ? event.timestamp
        : typeof event.timestamp === "string" ? Date.parse(event.timestamp) : Date.now();
      const createdAt = Math.max(Number.isFinite(timestamp) ? timestamp : Date.now(), this.lastCreatedAt + 1);
      this.lastCreatedAt = createdAt;
      state = { wireRunId: event.runId ?? "", ended: false, message: {
        id: event.messageId, messageId: event.messageId, sessionId: this.session.sessionId,
        runId: historyEventRunId(event), role: "ASSISTANT", channel: "conversation",
        actor: this.session.displayName ?? "Assistant", content: "", createdAt: new Date(createdAt).toISOString(),
      } };
      this.messages.set(event.messageId, state);
    }
    // Duplicate starts and late frames must never reopen or rewrite a settled card.
    if (state.ended) return null;
    const delta = type === "TEXT_MESSAGE_CONTENT" && typeof event.delta === "string" ? event.delta : undefined;
    if (delta) state.message = { ...state.message, content: state.message.content + delta };
    state.ended = type === "TEXT_MESSAGE_END";
    if (!state.ended) this.activeId = event.messageId;
    else if (this.activeId === event.messageId) this.activeId = null;
    return { message: state.message, delta, ended: state.ended };
  }

  /** Product completion may use another ID for the final assistant message.
   * Match only the last message of that admitted run, never an earlier step.
   */
  settle(current: readonly ChatMessage[], incoming: readonly ChatMessage[], removed: string[] = []) {
    const lastByRun = new Map<string, StreamMessage>();
    for (const state of this.messages.values()) {
      if (state.message.content.trim()) lastByRun.set(state.wireRunId, state);
    }
    const acknowledged = incoming.map(message => {
      if (message.role !== "ASSISTANT" || this.messages.has(message.messageId)) return message;
      const last = lastByRun.get(message.runId ?? "");
      if (!last || message.content.trim() !== last.message.content.trim()) return message;
      return { ...message, id: last.message.id, messageId: last.message.messageId,
        runId: last.message.runId, createdAt: last.message.createdAt };
    });
    return mergeChatMessagesChronologically(current, acknowledged, removed)
      .filter(message => !this.messages.has(message.messageId) || Boolean(message.content.trim()) || Boolean(message.a2ui));
  }
}
