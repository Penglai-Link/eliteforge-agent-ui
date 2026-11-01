import type { ChatMessage } from "./types";

function timestampOf(message: ChatMessage) {
  const timestamp = Date.parse(message.createdAt);
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function compareMessageIds(left: ChatMessage, right: ChatMessage) {
  const leftId = String(left.id);
  const rightId = String(right.id);
  const decimalIdPattern = /^\d+$/;

  if (decimalIdPattern.test(leftId) && decimalIdPattern.test(rightId)) {
    if (leftId.length !== rightId.length) return leftId.length - rightId.length;
  }

  const idOrder = leftId.localeCompare(rightId);
  if (idOrder !== 0) return idOrder;
  return left.messageId.localeCompare(right.messageId);
}

export function sortChatMessagesChronologically(
  messages: readonly ChatMessage[],
) {
  return [...messages].sort((left, right) => {
    const timestampOrder = timestampOf(left) - timestampOf(right);
    if (timestampOrder) return timestampOrder;
    const leftStep = left.history?.step;
    const rightStep = right.history?.step;
    if (left.history?.message.runId === right.history?.message.runId && leftStep && rightStep) {
      const stepOrder = leftStep.sequence - rightStep.sequence || leftStep.attempt - rightStep.attempt;
      if (stepOrder) return stepOrder;
      if (leftStep.id === rightStep.id) {
        const leftIndex = left.history?.message.outputIndex;
        const rightIndex = right.history?.message.outputIndex;
        if (typeof leftIndex === "number" && typeof rightIndex === "number" && leftIndex !== rightIndex) return leftIndex - rightIndex;
      }
    }
    if (left.role === "USER" && right.role === "ASSISTANT") return -1;
    if (right.role === "USER" && left.role === "ASSISTANT") return 1;
    return compareMessageIds(left, right);
  });
}

export function mergeChatMessagesChronologically(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
  removedMessageCodes: readonly string[] = [],
) {
  const removed = new Set(removedMessageCodes);
  const byMessageCode = new Map<string, ChatMessage>();

  for (const message of [...current, ...incoming]) {
    if (!removed.has(message.messageId)) {
      const previous = byMessageCode.get(message.messageId);
      if (previous?.role === "ASSISTANT" && message.role === "ASSISTANT") {
        // History and live delivery can arrive in either order. Keep a known
        // phase and never replace a streamed prefix with a shorter snapshot.
        const content = previous.content.startsWith(message.content) ? previous.content : message.content;
        byMessageCode.set(message.messageId, { ...message, content, phase: message.phase ?? previous.phase });
      } else {
        byMessageCode.set(message.messageId, message);
      }
    }
  }

  return sortChatMessagesChronologically([...byMessageCode.values()]);
}
