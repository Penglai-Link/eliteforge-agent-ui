import { A2UIClient, type ActionMessage, type ActionMetadata, type Surface } from "@personai/agent-ui-a2ui-core";
import type { ChatMessage, ChatAguiStreamEvent } from "./types";
export interface ChatA2uiSurface {
  surfaceId: string; surfaceInstanceId: string; revision: number; mode: "Display" | "SubmitOnce" | "Reusable";
  ownerAgentId: string; runId: string; messageId: string; createdAtMs: number; snapshot: Surface;
}
export interface ChatA2uiState { sessionId: string; revision: number; surfaces: ChatA2uiSurface[] }
export interface ChatA2uiActionInput { actionId: string; surfaceInstanceId: string; expectedRevision: number; message: ActionMessage; metadata: ActionMetadata }
export interface ChatA2uiActionContext { sessionId: string; messageId: string; surface: ChatA2uiSurface }
export type ChatA2uiActionHandler = (message: ActionMessage, metadata: ActionMetadata, context?: ChatA2uiActionContext) => void;
export class ChatA2uiSession {
  readonly client = new A2UIClient();
  private records = new Map<string, ChatA2uiSurface>();
  private stateRevision = -1;
  private actionAttempts = new Map<string, ChatA2uiActionInput>();
  prepareAction(message: ActionMessage, metadata: ActionMetadata, surface: ChatA2uiSurface): ChatA2uiActionInput {
    const key = JSON.stringify([surface.surfaceInstanceId, surface.revision, message.action.name, message.action.context, metadata]);
    const previous = this.actionAttempts.get(key); if(previous) return previous;
    const input = {actionId: crypto.randomUUID(), surfaceInstanceId: surface.surfaceInstanceId, expectedRevision:surface.revision, message, metadata}; this.actionAttempts.set(key,input); return input;
  }
  completeAction(id: string) {for(const [key,input] of this.actionAttempts) if(input.actionId === id) this.actionAttempts.delete(key);}

  constructor(readonly sessionId: string) {}
  hydrate(state: ChatA2uiState) {
    if (state.sessionId !== this.sessionId) throw new Error("A2UI session mismatch");
    if (state.revision <= this.stateRevision) return;
    const local = this.client.exportSnapshot();
    const previous = this.records;
    const snapshots = state.surfaces.map(s => {
      const old = previous.get(s.surfaceId); const draft = local.surfaces[s.surfaceId];
      return old?.surfaceInstanceId === s.surfaceInstanceId && draft ? {...s.snapshot, dataModel: reconcileDraft(old.snapshot.dataModel, draft.dataModel, s.snapshot.dataModel)} : s.snapshot;
    });
    this.client.importSnapshot({ version: "v0.9.1", surfaces: Object.fromEntries(snapshots.map(s => [s.surfaceId, s])) });
    this.records = new Map(state.surfaces.map(s => [s.surfaceId, structuredClone(s)]));
    this.stateRevision = state.revision;
  }
  /** Returns false on a gap so the owner can reload a canonical snapshot. */
  applyEvent(event: ChatAguiStreamEvent): boolean {
    if (event.type !== "CUSTOM" || event.name !== "agent.a2ui") return true;
    if (event.threadId && event.threadId !== this.sessionId) return true;
    const data = event.value as { revision: number; surface: ChatA2uiSurface; messages: unknown[]; deleted?: boolean };
    if (!data || !Number.isSafeInteger(data.revision) || !data.surface || !Array.isArray(data.messages)) return false;
    if (data.revision <= this.stateRevision) return true;
    if (this.stateRevision >= 0 && data.revision !== this.stateRevision + 1) return false;
    const existing = this.records.get(data.surface.surfaceId);
    if (existing && existing.surfaceInstanceId !== data.surface.surfaceInstanceId && !data.messages.some((m: any) => m.createSurface)) return false;
    for (const message of data.messages) this.client.apply(message);
    if (data.deleted) this.records.delete(data.surface.surfaceId);
    else this.records.set(data.surface.surfaceId, structuredClone(data.surface));
    this.stateRevision = data.revision;
    return true;
  }
  getSurface(id: string) { return this.records.get(id); }
  messages(): ChatMessage[] {
    const grouped = new Map<string, ChatA2uiSurface[]>();
    for (const surface of this.records.values()) { const items = grouped.get(surface.messageId) ?? []; items.push(surface); grouped.set(surface.messageId, items); }
    return [...grouped].map(([id, surfaces]) => ({ id, messageId: id, sessionId: this.sessionId, runId: surfaces[0].runId, role: "ASSISTANT", channel: "a2ui", actor: surfaces[0].ownerAgentId || "Assistant", content: "", createdAt: new Date(surfaces[0].createdAtMs).toISOString(), a2ui: { messages: [], surfaceIds: surfaces.map(s => s.surfaceId) } }));
  }
  metadata(ownerAgentId?: string): ActionMetadata {
    const surfaces = Object.fromEntries([...this.records.values()].filter(s => s.snapshot.sendDataModel && (!ownerAgentId || s.ownerAgentId === ownerAgentId)).map(s => [s.surfaceId, this.client.exportSnapshot().surfaces[s.surfaceId]?.dataModel]));
    return Object.keys(surfaces).length ? { a2uiClientDataModel: { surfaces } } : {};
  }
}

function reconcileDraft(base: any, draft: any, next: any): any {
  if (JSON.stringify(next) === JSON.stringify(base)) return draft;
  if (base && draft && next && [base,draft,next].every(v => typeof v === "object" && !Array.isArray(v))) {
    return Object.fromEntries(Object.keys(next).map(key => [key, reconcileDraft(base[key],draft[key],next[key])]));
  }
  return next;
}
