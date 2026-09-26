import type {
  ChatActiveRunState,
  ChatActiveRunResult,
  ChatMessage,
  ChatSendResult,
  ChatSession,
  ChatSteerResult,
  ChatUserInputRequest,
} from "./types";

function toScreamingSnakeCase(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return "";
  if (/^[A-Z0-9_]+$/.test(normalized)) return normalized;
  return normalized
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

function normalizeUnixMilliseconds(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && value.trim() !== "") return numericValue;
    const parsedValue = Date.parse(value);
    if (Number.isFinite(parsedValue)) return parsedValue;
  }
  return 0;
}

export function normalizeChatSession(session: ChatSession): ChatSession {
  return {
    ...session,
    lastRunStatus: session.lastRunStatus ? toScreamingSnakeCase(session.lastRunStatus) : session.lastRunStatus,
    status: toScreamingSnakeCase(session.status) as ChatSession["status"],
  };
}

export function normalizeChatMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    channel: toScreamingSnakeCase(message.channel) as ChatMessage["channel"],
    role: toScreamingSnakeCase(message.role) as ChatMessage["role"],
  };
}

export function normalizeChatSendResult(result: ChatSendResult): ChatSendResult {
  return {
    ...result,
    messages: result.messages.map(normalizeChatMessage),
    run: {
      ...result.run,
      status: toScreamingSnakeCase(result.run.status) as ChatSendResult["run"]["status"],
    },
    session: normalizeChatSession(result.session),
    userInputRequest: result.userInputRequest
      ? normalizeChatUserInputRequest(result.userInputRequest)
      : result.userInputRequest,
  };
}

export function normalizeChatUserInputRequest(
  request: ChatUserInputRequest,
): ChatUserInputRequest {
  const status = String(request.status ?? "").toLowerCase();
  return {
    ...request,
    requestedAt: normalizeUnixMilliseconds(request.requestedAt),
    answeredAt:
      request.answeredAt === null || request.answeredAt === undefined
        ? request.answeredAt
        : normalizeUnixMilliseconds(request.answeredAt),
    status: status === "answered" ? "Answered" : "Pending",
    questions: (request.questions ?? []).map((question) => ({
      ...question,
      options: (question.options ?? []).map((option) => ({ ...option })),
    })),
  };
}

export function normalizeChatSteerResult(result: ChatSteerResult): ChatSteerResult {
  return {
    ...result,
    message: normalizeChatMessage(result.message),
  };
}

export function normalizeChatActiveRunResult(
  result: ChatActiveRunResult,
): ChatActiveRunResult {
  return {
    ...result,
    activeRun: result.activeRun
      ? {
          ...result.activeRun,
          state: toScreamingSnakeCase(result.activeRun.state) as ChatActiveRunState,
        }
      : null,
  };
}
