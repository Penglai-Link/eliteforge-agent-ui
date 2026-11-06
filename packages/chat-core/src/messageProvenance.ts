import type { ChatAguiStreamEvent, ChatMessage, MessageProvenance } from "./types";

/** Attribution comes from the host; a USER role can be sent by an agent. */
export function messageActorName(message: ChatMessage, currentUserDisplayName?: string): string {
  const senderKind = message.provenance?.sender.kind.toLowerCase();
  if (senderKind === "human" || senderKind === "user") {
    return currentUserDisplayName
      || message.provenance?.sender.displayName
      || message.provenance?.sender.id
      || message.actor;
  }
  return message.provenance?.sender.displayName
    ?? (message.provenance ? message.actor : message.role === "USER" ? currentUserDisplayName || message.actor : message.actor);
}

export function messageSenderIsHuman(message: ChatMessage): boolean {
  const kind = message.provenance?.sender.kind.toLowerCase();
  return kind ? kind === "human" || kind === "user" : message.role === "USER";
}

export function messageSenderAvatar(message: ChatMessage): string | undefined {
  const url = message.provenance?.sender.avatarUrl;
  return url && /^(https?:\/\/|\/(?!\/)|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(url) ? url : undefined;
}

/** Apply replay/live attribution only to the matching session and message. */
export function applyMessageProvenance(messages: readonly ChatMessage[], events: readonly ChatAguiStreamEvent[]): ChatMessage[] {
  const byIdentity = new Map<string, MessageProvenance>();
  for (const event of events) {
    if (event.type !== "CUSTOM" || typeof event.name !== "string" || !event.name.endsWith(".message.provenance") || !event.threadId) continue;
    const value = event.value as { messageId?: unknown; provenance?: MessageProvenance } | undefined;
    const sender = value?.provenance?.sender;
    if (typeof value?.messageId !== "string" || !sender || typeof sender.kind !== "string") continue;
    byIdentity.set(`${event.threadId}:${value.messageId}`, value.provenance!);
  }
  return messages.map(message => {
    if (message.provenance?.source === "ChildRunCompletion") return message;
    const provenance = byIdentity.get(`${message.sessionId}:${message.messageId}`);
    return provenance ? { ...message, provenance } : message;
  });
}
