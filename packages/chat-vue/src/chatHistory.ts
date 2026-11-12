import {
  truncateLabel,
  type ChatMessage,
  type TranscriptPresentation,
} from "@personai/agent-ui-chat-core";

export interface ChatHistoryTurn {
  assistantPreview: string;
  hasAssistantReply: boolean;
  hasWorkActivity: boolean;
  id: string;
  messageCodes: string[];
  userMessageCode: string;
  userPreview: string;
}

function messagePreview(content: string, maxLength = 96) {
  return truncateLabel(content.replace(/\s+/g, " ").trim(), maxLength);
}

// A lightweight text excerpt: previews never render links, images or diagrams.
function markdownPreview(content: string, maxLength = 240) {
  const plain = content
    .replace(/^ {0,3}(?:`{3,}|~{3,}).*$/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^ {0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+[.)]\s+)/gm, "")
    .replace(/(\*\*|__|~~|`)(.*?)\1/g, "$2");
  return messagePreview(plain, maxLength);
}

export function buildChatHistoryTurns(
  messages: ChatMessage[],
  presentation: TranscriptPresentation,
) {
  const turns: ChatHistoryTurn[] = [];
  let currentTurn: ChatHistoryTurn | null = null;

  function pushCurrentTurn() {
    if (!currentTurn) return;
    turns.push(currentTurn);
    currentTurn = null;
  }

  messages.forEach((message) => {
    if (message.role === "USER" && !message.interactionResponse) {
      pushCurrentTurn();
      currentTurn = {
        assistantPreview: "",
        hasAssistantReply: false,
        hasWorkActivity: false,
        id: `turn-${message.messageId}`,
        messageCodes: [message.messageId],
        userMessageCode: message.messageId,
        userPreview: messagePreview(message.content || (message.annotations ?? []).map(item => item.comment).join("; "), 72) || message.provenance?.sender.displayName || message.actor || "User",
      };
      return;
    }

    if (!currentTurn && (message.content.trim() || message.a2ui || message.history)) currentTurn = { assistantPreview: "", hasAssistantReply: false, hasWorkActivity: false, id: `turn-${message.messageId}`, messageCodes: [], userMessageCode: message.messageId, userPreview: message.provenance?.sender.displayName || message.actor || "Assistant" };
    if (!currentTurn) return;

    currentTurn.messageCodes.push(message.messageId);

    if (message.role === "ASSISTANT" && (message.content.trim() || message.a2ui)) {
      currentTurn.hasAssistantReply = true;
      currentTurn.assistantPreview = markdownPreview(message.content);
    }
  });

  pushCurrentTurn();

  const workMessageCodes = new Set<string>();

  if (presentation.waitingForModelAnchorMessageCode) {
    workMessageCodes.add(presentation.waitingForModelAnchorMessageCode);
  }

  presentation.workRailsByMessageCode.forEach((runs, messageId) => {
    if (runs.length) workMessageCodes.add(messageId);
  });

  turns.forEach((turn) => {
    turn.hasWorkActivity = turn.messageCodes.some((messageId) =>
      workMessageCodes.has(messageId),
    );
  });

  return turns.filter((turn) => turn.userPreview);
}
