import type { ChatAguiStreamEvent, ChatMessage, ChatSession } from "./types";
import { historyEventRunId } from "./history";
import { aguiEventStableKey } from "./transcript";
import { mergeChatMessagesChronologically } from "./chatMessages";
import { metadataRecordWith } from "./eventMetadata";

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
  private readonly finalMessageIdsByRun = new Map<string, string[]>();

  constructor(private readonly session: Pick<ChatSession, "sessionId" | "displayName">) {}

  get identified() { return this.hasIdentity; }
  get activeMessageId() { return this.activeId; }
  get messageIds() { return [...this.messages.keys()]; }

  receive(event: ChatAguiStreamEvent): AssistantMessageUpdate | null {
    if (event.threadId && event.threadId !== this.session.sessionId) return null;
    const type = event.type.toUpperCase();
    if (type === "RUN_FINISHED" && event.runId) {
      const ids = metadataRecordWith(event.metadata, (record) => Array.isArray(record.finalMessageIds))?.finalMessageIds;
      if (Array.isArray(ids) && ids.every(id => typeof id === "string") && ids.length) {
        this.finalMessageIdsByRun.set(event.runId, ids);
      }
      return null;
    }
    if (type === "CUSTOM" && typeof event.name === "string" && event.name.endsWith(".message.metadata")) {
      const value = event.value as { messageId?: unknown; phase?: unknown } | undefined;
      if (typeof value?.messageId !== "string" || typeof value.phase !== "string") return null;
      const state = this.messages.get(value.messageId);
      if (!state) return null;
      state.message = { ...state.message, phase: value.phase };
      return { message: state.message, ended: state.ended };
    }
    if (!["TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END"].includes(type)
        || !event.messageId) return null;
    this.hasIdentity = true;
    if (type === "TEXT_MESSAGE_START" && event.role && event.role !== "assistant") this.ignored.add(event.messageId);
    if (this.ignored.has(event.messageId)) return null;
    const metadata = metadataRecordWith(event.metadata, (record) => Boolean(record.message) && typeof record.message === "object");
    const phase = (metadata?.message as { phase?: unknown } | undefined)?.phase;
    const existing = this.messages.get(event.messageId);
    if (type === "TEXT_MESSAGE_END" && existing?.ended && typeof phase === "string" && existing.message.phase == null) {
      existing.message = { ...existing.message, phase };
      return { message: existing.message, ended: true };
    }
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
        ...(typeof phase === "string" ? { phase } : {}),
        actor: this.session.displayName ?? "Assistant", content: "", createdAt: new Date(createdAt).toISOString(),
      } };
      this.messages.set(event.messageId, state);
    }
    // Duplicate starts and late frames must never reopen or rewrite a settled card.
    if (state.ended) return null;
    if (typeof phase === "string") state.message = { ...state.message, phase };
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
  settle(current: readonly ChatMessage[], incoming: readonly ChatMessage[], removed: string[] = [],
    completion?: { runId: string; finalMessageIds?: string[] }) {
    if (completion?.finalMessageIds?.length) this.finalMessageIdsByRun.set(completion.runId, completion.finalMessageIds);
    const lastByRun = new Map<string, StreamMessage>();
    for (const state of this.messages.values()) {
      if (state.message.content.trim()) lastByRun.set(state.wireRunId, state);
    }
    const aggregateIndexes = new Set<number>();
    for (const [runId, ids] of this.finalMessageIdsByRun) {
      if (!ids.every(id => this.messages.has(id))) continue;
      let index = -1;
      for (let candidate = incoming.length - 1; candidate >= 0; candidate -= 1) {
        const message = incoming[candidate]!;
        if (message.runId === runId && message.role === "ASSISTANT" && !message.history && !message.a2ui
          && !this.messages.has(message.messageId)) { index = candidate; break; }
      }
      if (index >= 0) aggregateIndexes.add(index);
    }
    const acknowledged = incoming.filter((_, index) => !aggregateIndexes.has(index)).map(message => {
      if (message.role !== "ASSISTANT" || this.messages.has(message.messageId)) return message;
      if (this.finalMessageIdsByRun.has(message.runId ?? "")) return message;
      const last = lastByRun.get(message.runId ?? "");
      if (!last || message.content.trim() !== last.message.content.trim()) return message;
      return { ...message, id: last.message.id, messageId: last.message.messageId,
        runId: last.message.runId, createdAt: last.message.createdAt };
    });
    return mergeChatMessagesChronologically(current, acknowledged, removed)
      .filter(message => !this.messages.has(message.messageId) || Boolean(message.content.trim()) || Boolean(message.a2ui));
  }
}
