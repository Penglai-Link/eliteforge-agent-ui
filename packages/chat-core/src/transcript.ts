import {
  deriveReasoningPreview,
  formatTime,
  reasoningLastSentence,
  truncateLabel,
} from "./display";
import { historyEventRunId } from "./history";
import type {
  ChatAguiStreamEvent,
  ChatDebugOptions,
  ChatMessage,
  ReasoningEffort,
  TranscriptAguiEvent,
} from "./types";

export type ChatCompactionStatus = "requested" | "started" | "completed" | "failed" | "interrupted";

export interface ToolSchemaBudgetNotice {
  estimatedTokens: number;
  limitTokens: number;
  toolCount: number;
}

export type AguiRunNotice =
  | { kind: "compaction"; status: ChatCompactionStatus; code: string }
  | { kind: "integrationWarning"; id: string; code: string; message: string }
  | { kind: "runStopped"; code: string; message: string }
  | { kind: "runError"; code: string; message: string; toolSchemaBudget?: ToolSchemaBudgetNotice };

const compactionEventStatuses = new Map<string, ChatCompactionStatus>([
  ["agent.memory.context.compaction_requested", "requested"],
  ["agent.memory.compaction.started", "started"],
  ["agent.memory.compaction.completed", "completed"],
  ["agent.memory.compaction.failed", "failed"],
]);

function toolSchemaBudget(message: string): ToolSchemaBudgetNotice | undefined {
  const match = /estimatedTokens=(\d+),\s*limitTokens=(\d+),\s*toolCount=(\d+)/i.exec(message);
  if (!match) return undefined;
  const [estimatedTokens, limitTokens, toolCount] = match.slice(1).map(Number);
  if (![estimatedTokens, limitTokens, toolCount].every(Number.isSafeInteger)) return undefined;
  return { estimatedTokens, limitTokens, toolCount };
}

export function isAguiPresentationFailureEvent(event: TranscriptAguiEvent): boolean {
  if (!aguiEventType(event).toUpperCase().includes("RUN_ERROR")) return false;
  return ("code" in event && typeof event.code === "string" && event.code.startsWith("AGUI_"))
    || ("code" in event && event.code === "CHAT_STREAM_COMPLETION_UNAVAILABLE" && "productCompletionError" in event && event.productCompletionError !== null && typeof event.productCompletionError === "object");
}
export function isAguiCancellationEvent(event: TranscriptAguiEvent): boolean {
  return aguiEventType(event).toUpperCase() === "RUN_ERROR"
    && "code" in event && event.code === "AGENT_CANCELLED";
}
export function isAguiExecutionTerminalEvent(event: TranscriptAguiEvent): boolean {
  const type=aguiEventType(event).toUpperCase();
  return type.includes("RUN_FINISHED") || (type.includes("RUN_ERROR") && !isAguiPresentationFailureEvent(event));
}

// Lifecycle notices and presentation health are independent; replay retains their details.
export function buildAguiRunNotices(events: TranscriptAguiEvent[]): AguiRunNotice[] {
  let compaction: Extract<AguiRunNotice, { kind: "compaction" }> | undefined;
  let error: Extract<AguiRunNotice, { kind: "runError" }> | undefined;
  let stopped: Extract<AguiRunNotice, { kind: "runStopped" }> | undefined;
  let terminal = false;
  let presentationIncomplete = false;
  const warnings = new Map<string, Extract<AguiRunNotice, {kind: "integrationWarning"}>>();
  for (const event of events) {
    const type = aguiEventType(event).toUpperCase();
    const metadata = "metadata" in event && event.metadata && typeof event.metadata === "object"
      ? event.metadata as Record<string, unknown> : {};
    presentationIncomplete ||= (metadata.replayIncomplete === true || metadata.replayIncomplete === "true")
      || ("presentationIncomplete" in event && event.presentationIncomplete === true)
      || (type === "CUSTOM" && "name" in event && (event.name === "tron.presentation.incomplete" || event.name === "agent.presentation.incomplete"));

    if (type === "CUSTOM" && "name" in event && typeof event.name === "string") {
      if (event.name === "tron.mcp.runtime.warning") {
        const value = "value" in event && event.value && typeof event.value === "object" ? event.value as Record<string, unknown> : {};
        const tron = metadata.tron && typeof metadata.tron === "object" ? metadata.tron as Record<string, unknown> : {};
        const id = typeof tron.eventId === "string" ? tron.eventId : `${"runId" in event ? event.runId : ""}:mcp:${value.serverCode ?? ""}`;
        const message = [value.serverName, value.message].filter((part): part is string => typeof part === "string" && part.length > 0).join(": ");
        warnings.set(id,{kind:"integrationWarning",id,code:"MCP_RUNTIME_UNAVAILABLE",message});
      }
      const status = compactionEventStatuses.get(event.name);
      if (status) {
        const value = "value" in event && event.value && typeof event.value === "object"
          ? event.value as Record<string, unknown>
          : {};
        compaction = { kind: "compaction", status, code: typeof value.errorCode === "string" ? value.errorCode : "" };
      }
    }
    const presentationFailure = isAguiPresentationFailureEvent(event);
    presentationIncomplete ||= presentationFailure;
    if (isAguiExecutionTerminalEvent(event)) terminal = true;
    if (type === "RUN_ERROR" && !presentationFailure) {
      const code = "code" in event && typeof event.code === "string" ? event.code : "";
      const message = "message" in event && typeof event.message === "string" ? event.message : "";
      if (isAguiCancellationEvent(event)) {
        stopped = { kind: "runStopped", code, message };
      } else {
        error = {
          kind: "runError",
          code,
          message,
          ...(code.toLowerCase() === "tool_schema_over_budget" ? { toolSchemaBudget: toolSchemaBudget(message) } : {}),
        };
      }
    }
  }
  if (terminal && compaction && (compaction.status === "requested" || compaction.status === "started")) {
    compaction = { ...compaction, status: "interrupted" };
  }
  const presentationNotice: AguiRunNotice = { kind: "runError", code: "AGENT_AGUI_REPLAY_INCOMPLETE", message: "" };
  return [...(compaction ? [compaction] : []), ...warnings.values(), ...(error ? [error] : stopped ? [stopped] : []), ...(presentationIncomplete ? [presentationNotice] : [])];
}

export interface ReasoningWorkCard {
  content: string;
  ended: boolean;
  endMillis: number | null;
  firstMillis: number;
  id: string;
  runId: string;
  summary: string;
  toolCards: ToolWorkCard[];
}

export interface ToolWorkCard {
  args: unknown;
  ended: boolean;
  firstMillis: number;
  id: string;
  logs: string[];
  parentReasoningId: string | null;
  result: string;
  runId: string;
  started: boolean;
  toolCallId: string;
  toolName: string;
}

export interface ToolGroupWorkCard {
  firstMillis: number;
  id: string;
  runId: string;
  toolCards: ToolWorkCard[];
}

export type AguiUserWorkCard =
  | { kind: "reasoning"; value: ReasoningWorkCard }
  | { kind: "toolGroup"; value: ToolGroupWorkCard }
  | { kind: "tool"; value: ToolWorkCard };

export interface AguiWorkRun {
  events: TranscriptAguiEvent[];
  firstMillis: number;
  runId: string;
}

export interface TranscriptPresentation {
  debugEventsByRunCode: Map<string, TranscriptAguiEvent[]>;
  waitingForModelAnchorMessageCode: string;
  workRailsByMessageCode: Map<string, AguiWorkRun[]>;
}

export const chatScrollBottomThreshold = 96;
export const chatScrollJumpButtonThreshold = 160;
export const liveAguiStartToleranceMs = 5_000;

/** A new submission can receive replay noise before its own run starts. Use the
 * same timestamp tolerance as pending-turn replay, and never claim another
 * session's events as the current run. Answer continuations use their own anchor. */
export function belongsToNewChatTurn(event: ChatAguiStreamEvent, sessionId: string, createdAt: string) {
  const thread = aguiEventThreadId(event);
  if (thread && thread !== sessionId) return false;
  const timestamp = aguiEventMillis(event);
  const submitted = Date.parse(createdAt);
  return timestamp === null || !Number.isFinite(submitted) || timestamp >= submitted - liveAguiStartToleranceMs;
}

export const activeChatReplayPendingTurnMaxAgeMs = 30 * 60_000;

export function aguiEventType(event: TranscriptAguiEvent) {
  if (typeof event.type === "string") return event.type;
  if ("eventName" in event && typeof event.eventName === "string") return event.eventName;
  return "";
}

export function aguiEventTime(event: TranscriptAguiEvent) {
  if ("occurredAt" in event && typeof event.occurredAt === "string") return event.occurredAt;
  if ("timestamp" in event && typeof event.timestamp === "number") return new Date(event.timestamp).toISOString();
  return new Date().toISOString();
}

export function aguiEventRunId(event: TranscriptAguiEvent) {
  if ("runId" in event && typeof event.runId === "string") return event.runId;
  if ("runId" in event && typeof event.runId === "string") return event.runId;
  return "stream";
}

export function aguiEventThreadId(event: TranscriptAguiEvent) {
  return "threadId" in event && typeof event.threadId === "string" ? event.threadId : "";
}

export function aguiEventSummary(event: TranscriptAguiEvent) {
  if ("delta" in event && typeof event.delta === "string" && event.delta.trim()) return event.delta;
  if ("content" in event && typeof event.content === "string" && event.content.trim()) return event.content;
  if ("message" in event && typeof event.message === "string" && event.message.trim()) return event.message;
  if ("toolCallName" in event && typeof event.toolCallName === "string") return event.toolCallName;
  if ("metadata" in event && event.metadata && typeof event.metadata === "object") {
    const metadata = event.metadata as Record<string, string>;
    return metadata.summary ?? metadata.skillName ?? ("outcome" in event && typeof event.outcome === "string" ? event.outcome : "event received");
  }
  return "event received";
}

export function aguiEventMillis(event: TranscriptAguiEvent) {
  if ("timestamp" in event && typeof event.timestamp === "number") return event.timestamp;
  const parsed = Date.parse(aguiEventTime(event));
  return Number.isNaN(parsed) ? null : parsed;
}

const reasoningEffortValues = new Set<ReasoningEffort>([
  "None",
  "Minimal",
  "Low",
  "Medium",
  "High",
  "XHigh",
  "Max",
  "Ultra",
]);

export function aguiReasoningEffort(events: TranscriptAguiEvent[]) {
  for (const event of events) {
    const directValue = "reasoningEffort" in event ? event.reasoningEffort : undefined;
    if (typeof directValue === "string" && reasoningEffortValues.has(directValue as ReasoningEffort)) {
      return directValue as ReasoningEffort;
    }
    if ("metadata" in event && event.metadata && typeof event.metadata === "object") {
      const metadataValue = (event.metadata as Record<string, unknown>).reasoningEffort;
      if (typeof metadataValue === "string" && reasoningEffortValues.has(metadataValue as ReasoningEffort)) {
        return metadataValue as ReasoningEffort;
      }
    }
  }
  return null;
}

export function aguiEventToolCallId(event: TranscriptAguiEvent) {
  return "toolCallId" in event && typeof event.toolCallId === "string" ? event.toolCallId : "";
}

export function aguiEventToolName(event: TranscriptAguiEvent) {
  return explicitAguiEventToolName(event) ?? "tool";
}

function explicitAguiEventToolName(event: TranscriptAguiEvent) {
  if ("toolCallName" in event && typeof event.toolCallName === "string" && event.toolCallName.trim()) {
    return event.toolCallName;
  }
  return null;
}

function updateToolCardName(card: ToolWorkCard, event: TranscriptAguiEvent) {
  const toolName = explicitAguiEventToolName(event);
  if (toolName) card.toolName = toolName;
}

export function aguiEventToolArgs(event: TranscriptAguiEvent) {
  return "toolCallArgs" in event ? event.toolCallArgs : undefined;
}

export function aguiEventStableKey(event: TranscriptAguiEvent): string | null {
  const metadata = "metadata" in event && event.metadata && typeof event.metadata === "object"
    ? event.metadata as Record<string, unknown> : {};
  const tron = metadata.tron && typeof metadata.tron === "object"
    ? metadata.tron as Record<string, unknown> : {};
  if (typeof tron.eventId === "string" && tron.eventId) {
    return JSON.stringify(["protocol", aguiEventThreadId(event), tron.eventId]);
  }
  if ("id" in event && typeof event.id === "string" && event.id) {
    return JSON.stringify(["canonical", aguiEventThreadId(event), event.id]);
  }
  // Identical content can be two valid frames. Legacy frames without transport
  // identity are retained; only the very same in-memory object may be reused.
  return null;
}

export function mergeTranscriptAguiEvents<T extends TranscriptAguiEvent>(...sources: T[][]) {
  const seen = new Set<string>();
  const unkeyed = new WeakSet<object>();
  const merged: T[] = [];
  sources.flat().forEach((event) => {
    const key = aguiEventStableKey(event);
    if (key !== null) {
      if (seen.has(key)) return;
      seen.add(key);
    } else {
      if (unkeyed.has(event)) return;
      unkeyed.add(event);
    }
    merged.push(event);
  });
  return merged.sort((left, right) => (aguiEventMillis(left) ?? 0) - (aguiEventMillis(right) ?? 0));
}

function latestChatMessage(messages: ChatMessage[]) {
  return messages.length ? messages[messages.length - 1] : null;
}

function messageCreatedMillis(message: ChatMessage) {
  const parsed = Date.parse(message.createdAt);
  return Number.isNaN(parsed) ? null : parsed;
}

export function isRecentPendingUserTurn(messages: ChatMessage[], now = Date.now()) {
  const latestMessage = latestChatMessage(messages);
  if (!latestMessage || latestMessage.role !== "USER") return false;
  const createdMillis = messageCreatedMillis(latestMessage);
  if (createdMillis === null) return true;
  return now - createdMillis <= activeChatReplayPendingTurnMaxAgeMs;
}

function replayRunCodesForPendingUserTurn(
  events: TranscriptAguiEvent[],
  sessionId: string,
  messages: ChatMessage[],
) {
  const runCodes = new Set<string>();
  const latestMessage = latestChatMessage(messages);
  if (!latestMessage || latestMessage.role !== "USER") return runCodes;
  const latestUserMillis = messageCreatedMillis(latestMessage);
  const firstEventMillisByRun = new Map<string, number>();

  events.forEach((event) => {
    const threadId = aguiEventThreadId(event);
    if (threadId && threadId !== sessionId) return;
    const runId = aguiEventRunId(event);
    if (!runId || runId === "stream") return;
    const eventMillis = aguiEventMillis(event);
    if (eventMillis === null) return;
    const currentFirstMillis = firstEventMillisByRun.get(runId);
    if (currentFirstMillis === undefined || eventMillis < currentFirstMillis) {
      firstEventMillisByRun.set(runId, eventMillis);
    }
  });

  firstEventMillisByRun.forEach((firstEventMillis, runId) => {
    if (latestUserMillis === null || firstEventMillis >= latestUserMillis - liveAguiStartToleranceMs) {
      runCodes.add(runId);
    }
  });
  return runCodes;
}

export function openAguiProtocolRunCodes(events: TranscriptAguiEvent[], sessionId: string) {
  const terminalByRun = new Map<string, boolean>();
  events.forEach((event) => {
    const threadId = aguiEventThreadId(event);
    if (threadId && threadId !== sessionId) return;
    const runId = aguiEventRunId(event);
    if (!runId || runId === "stream") return;
    const type = aguiEventType(event).toUpperCase();
    if (type === "CUSTOM" && "name" in event && (event.name === "agent.presentation.incomplete" || event.name === "tron.presentation.incomplete")) return;
    if (!terminalByRun.has(runId)) terminalByRun.set(runId, false);
    if (isAguiExecutionTerminalEvent(event)) {
      terminalByRun.set(runId, true);
    }
  });
  return new Set(
    Array.from(terminalByRun.entries())
      .filter(([, terminal]) => !terminal)
      .map(([runId]) => runId),
  );
}

function knownTranscriptRunCodes(
  messages: ChatMessage[],
  liveAnchorMessageCodes: Record<string, string>,
  replayRunCodes: Set<string>,
) {
  const runCodes = new Set<string>();
  messages.forEach((message) => {
    if (message.runId) runCodes.add(message.runId);
  });
  Object.keys(liveAnchorMessageCodes).forEach((runId) => {
    if (runId && runId !== "stream") runCodes.add(runId);
  });
  replayRunCodes.forEach((runId) => runCodes.add(runId));
  return runCodes;
}

export function filterTranscriptAguiEventsForSession(
  events: TranscriptAguiEvent[],
  sessionId: string,
  messages: ChatMessage[],
  liveAnchorMessageCodes: Record<string, string>,
) {
  const runCodes = knownTranscriptRunCodes(
    messages,
    liveAnchorMessageCodes,
    replayRunCodesForPendingUserTurn(events, sessionId, messages),
  );
  if (!sessionId || !runCodes.size) return [];
  return events.filter((event) => {
    const threadId = aguiEventThreadId(event);
    if (threadId && threadId !== sessionId) return false;
    return runCodes.has(aguiEventRunId(event)) || runCodes.has(historyEventRunId(event));
  });
}

function stringifyPreview(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatJsonBlockValue(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return stringifyPreview(value);
}

export function appendReasoningDelta(content: string, delta: string) {
  if (!content) return delta;
  if (!delta) return content;
  if (/\s$/.test(content) || /^[\s.,;:!?)]/.test(delta)) return `${content}${delta}`;
  return `${content} ${delta}`;
}

const toolTargetKeys = ["command", "cmd", "file", "fileName", "filePath", "path", "target", "query", "topic", "pattern", "url", "uri"];

function valueAtKnownKey(value: unknown, depth = 0): string {
  if (depth > 3 || value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = valueAtKnownKey(item, depth + 1);
      if (found) return found;
    }
    return "";
  }

  const record = value as Record<string, unknown>;
  for (const key of toolTargetKeys) {
    const direct = record[key];
    if (typeof direct === "string" && direct.trim()) return direct;
  }
  for (const child of Object.values(record)) {
    const found = valueAtKnownKey(child, depth + 1);
    if (found) return found;
  }
  return "";
}

function toolActionLabel(toolName: string, args: unknown) {
  const normalizedTool = toolName.toLowerCase();
  const target = valueAtKnownKey(args).toLowerCase();
  if (normalizedTool.includes("edit") || normalizedTool.includes("write") || normalizedTool.includes("patch")) return "Edit";
  if (target.includes("/") || target.includes(".")) {
    if (!normalizedTool.includes("exec") && !normalizedTool.includes("run") && !normalizedTool.includes("shell")) return "Edit";
  }
  return "Run";
}

export function toolSummaryLabel(toolName: string, args: unknown) {
  const displayName = toolDisplayName(toolName, args);
  return `${toolActionLabel(displayName, args)} ${displayName}`;
}

function commandArgumentPreview(value: string, shellScript = false) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "''";
  if (shellScript || /^[A-Za-z0-9_@%+=:,./-]+$/.test(normalized)) return normalized;
  if (!normalized.includes("'")) return `'${normalized}'`;
  return JSON.stringify(normalized);
}

/**
 * Builds a compact, human-readable command line for command tools. This is a
 * display preview only; it must never be executed or used to reconstruct args.
 */
export function toolCommandLinePreview(toolName: string, args: unknown, maxLength = 180) {
  if (toolName.trim().toLowerCase() !== "bash_exec") return "";
  const payload = parseToolPayload(args);
  const command = typeof payload?.command === "string" ? payload.command.trim() : "";
  if (!command) return "";
  const rawArgs = Array.isArray(payload?.args)
    ? payload.args.filter((value): value is string => typeof value === "string")
    : [];
  const parts = [command];
  rawArgs.forEach((value, index) => {
    parts.push(commandArgumentPreview(value, rawArgs[index - 1] === "-c"));
  });
  return truncateLabel(parts.join(" "), maxLength);
}

/** Compact summary for a tool row inside a grouped run. */
export function toolCompactLabel(toolName: string, args: unknown, displayName = humanizeToolName(toolName)) {
  const command = toolCommandLinePreview(toolName, args);
  if (command) return `Shell ${command}`;
  const target = valueAtKnownKey(args);
  return target ? `${displayName} ${target}` : displayName;
}

export function toolDisplayName(toolName: string, args: unknown = undefined) {
  const normalizedName = toolName.trim();
  const domainCode = domainCodeFromToolPayload(normalizedName) || domainCodeFromToolPayload(args);

  if (normalizedName === "discovery_expand_tool_domain" || domainCode) {
    return humanizeToolName(domainCode || normalizedName);
  }
  return humanizeToolName(normalizedName);
}

function domainCodeFromToolPayload(value: unknown) {
  const payload = parseToolPayload(value);
  if (!payload || typeof payload.domainCode !== "string") return "";
  return payload.domainCode.trim();
}

function parseToolPayload(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function humanizeToolName(value: string) {
  return value
    .trim()
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "tool";
}

function activityLines(event: TranscriptAguiEvent) {
  const delta = "delta" in event ? event.delta : undefined;
  if (typeof delta === "string") return delta.trim() ? [delta] : [];
  if (!Array.isArray(delta)) return [];

  return delta
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const value = (item as { value?: unknown }).value;
        return typeof value === "string" ? value : stringifyPreview(value);
      }
      return stringifyPreview(item);
    })
    .filter(Boolean);
}

function reasoningCardKey(event: TranscriptAguiEvent) {
  return `${aguiEventRunId(event)}:reasoning`;
}

function createReasoningCard(
  cards: Map<string, ReasoningWorkCard>,
  activeCardIdsByRun: Map<string, string>,
  latestCardIdsByRun: Map<string, string>,
  sequenceByRun: Map<string, number>,
  event: TranscriptAguiEvent,
) {
  const runId = aguiEventRunId(event);
  const sequence = (sequenceByRun.get(runId) ?? 0) + 1;
  sequenceByRun.set(runId, sequence);
  const key = `${reasoningCardKey(event)}:${sequence}`;
  const card = {
    content: "",
    ended: false,
    endMillis: null,
    firstMillis: aguiEventMillis(event) ?? Date.now(),
    id: key,
    runId,
    summary: "",
    toolCards: [],
  };
  cards.set(key, card);
  activeCardIdsByRun.set(runId, key);
  latestCardIdsByRun.set(runId, key);
  return card;
}

function activeReasoningCard(
  cards: Map<string, ReasoningWorkCard>,
  activeCardIdsByRun: Map<string, string>,
  event: TranscriptAguiEvent,
) {
  const activeCardId = activeCardIdsByRun.get(aguiEventRunId(event));
  if (!activeCardId) return null;
  return cards.get(activeCardId) ?? null;
}

function ensureReasoningCard(
  cards: Map<string, ReasoningWorkCard>,
  activeCardIdsByRun: Map<string, string>,
  latestCardIdsByRun: Map<string, string>,
  sequenceByRun: Map<string, number>,
  event: TranscriptAguiEvent,
  options?: { forceNew?: boolean },
) {
  if (!options?.forceNew) {
    const existing = activeReasoningCard(cards, activeCardIdsByRun, event);
    if (existing) return existing;
  }
  return createReasoningCard(cards, activeCardIdsByRun, latestCardIdsByRun, sequenceByRun, event);
}

function endReasoningCard(
  cards: Map<string, ReasoningWorkCard>,
  activeCardIdsByRun: Map<string, string>,
  latestCardIdsByRun: Map<string, string>,
  sequenceByRun: Map<string, number>,
  event: TranscriptAguiEvent,
) {
  const card = ensureReasoningCard(cards, activeCardIdsByRun, latestCardIdsByRun, sequenceByRun, event);
  card.ended = true;
  card.endMillis = aguiEventMillis(event) ?? card.endMillis;
  if (aguiEventType(event).toUpperCase() === "REASONING_END") {
    activeCardIdsByRun.delete(aguiEventRunId(event));
  }
  return card;
}

function ensureToolCard(
  cards: Map<string, ToolWorkCard>,
  reasoningCards: Map<string, ReasoningWorkCard>,
  latestReasoningCardIdsByRun: Map<string, string>,
  event: TranscriptAguiEvent,
) {
  const toolCallId = aguiEventToolCallId(event);
  if (!toolCallId) return null;
  const key = `${aguiEventRunId(event)}:${toolCallId}`;
  const existing = cards.get(key);
  if (existing) return existing;
  const toolName = aguiEventToolName(event);
  const parentReasoningId = latestReasoningCardIdsByRun.get(aguiEventRunId(event)) ?? null;
  const card = {
    args: aguiEventToolArgs(event),
    ended: false,
    firstMillis: aguiEventMillis(event) ?? Date.now(),
    id: key,
    logs: [],
    parentReasoningId,
    result: "",
    runId: aguiEventRunId(event),
    started: false,
    toolCallId,
    toolName,
  };
  cards.set(key, card);
  if (parentReasoningId) {
    const reasoningCard = reasoningCards.get(parentReasoningId);
    if (reasoningCard) reasoningCard.toolCards.push(card);
  }
  return card;
}

export function buildAguiUserWorkCards(events: TranscriptAguiEvent[]): AguiUserWorkCard[] {
  const reasoningCards = new Map<string, ReasoningWorkCard>();
  const activeReasoningCardIdsByRun = new Map<string, string>();
  const latestReasoningCardIdsByRun = new Map<string, string>();
  const reasoningSequenceByRun = new Map<string, number>();
  const toolCards = new Map<string, ToolWorkCard>();

  events.forEach((event) => {
    const type = aguiEventType(event).toUpperCase();

    if (type === "REASONING_START") {
      ensureReasoningCard(reasoningCards, activeReasoningCardIdsByRun, latestReasoningCardIdsByRun, reasoningSequenceByRun, event, { forceNew: true });
      return;
    }
    if (type === "REASONING_MESSAGE_START") {
      const activeCard = activeReasoningCard(
        reasoningCards,
        activeReasoningCardIdsByRun,
        event,
      );
      ensureReasoningCard(
        reasoningCards,
        activeReasoningCardIdsByRun,
        latestReasoningCardIdsByRun,
        reasoningSequenceByRun,
        event,
        { forceNew: Boolean(activeCard?.ended || activeCard?.content.trim()) },
      );
      return;
    }
    if (type === "REASONING_MESSAGE_CONTENT") {
      const card = ensureReasoningCard(reasoningCards, activeReasoningCardIdsByRun, latestReasoningCardIdsByRun, reasoningSequenceByRun, event);
      const delta = "delta" in event && typeof event.delta === "string" ? event.delta : "";
      card.summary = appendReasoningDelta(card.summary, delta);
      return;
    }
    if (type === "REASONING_TEXT_CONTENT") {
      const card = ensureReasoningCard(reasoningCards, activeReasoningCardIdsByRun, latestReasoningCardIdsByRun, reasoningSequenceByRun, event);
      const delta = "delta" in event && typeof event.delta === "string" ? event.delta : "";
      card.content = appendReasoningDelta(card.content, delta);
      return;
    }
    if (type === "REASONING_END" || type === "REASONING_MESSAGE_END") {
      endReasoningCard(reasoningCards, activeReasoningCardIdsByRun, latestReasoningCardIdsByRun, reasoningSequenceByRun, event);
      return;
    }

    if (["SUBAGENT_STARTED", "SUBAGENT_FINISHED", "SUBAGENT_ERROR"].includes(type)
      && "subagentRunId" in event && typeof event.subagentRunId === "string") {
      // Presentation only: preserve the native source event and reuse existing
      // delegated-work cards without emitting a second tool protocol lifecycle.
      const card = ensureToolCard(toolCards, reasoningCards, latestReasoningCardIdsByRun, {
        ...event, toolCallId: "subagent:" + event.subagentRunId,
        toolCallName: "toolName" in event && typeof event.toolName === "string" ? event.toolName : "Agent",
      });
      if (!card) return;
      card.started ||= type === "SUBAGENT_STARTED";
      card.ended ||= type !== "SUBAGENT_STARTED";
      if ("description" in event && typeof event.description === "string") card.result = event.description;
      if ("message" in event && typeof event.message === "string") card.result = event.message;
      return;
    }

    if (type === "TOOL_CALL_START" || type === "TOOL_CALL_ARGS") {
      const card = ensureToolCard(toolCards, reasoningCards, latestReasoningCardIdsByRun, event);
      if (!card) return;
      card.started = card.started || type === "TOOL_CALL_START";
      updateToolCardName(card, event);
      const args = aguiEventToolArgs(event);
      if (args !== undefined) card.args = args;
      const argumentDelta = "delta" in event && typeof event.delta === "string"
        ? event.delta
        : null;
      if (type === "TOOL_CALL_ARGS" && argumentDelta !== null) {
        const previous = typeof card.args === "string"
          ? card.args
          : card.args == null
            ? ""
            : JSON.stringify(card.args);
        const combined = `${previous}${argumentDelta}`;
        try {
          card.args = JSON.parse(combined);
        } catch {
          card.args = combined;
        }
      }
      return;
    }
    if (type === "ACTIVITY_SNAPSHOT" && "activityType" in event && event.activityType === "tron.tool.progress") {
      const content = "content" in event && event.content && typeof event.content === "object" ? event.content as Record<string, unknown> : {};
      if (typeof content.toolCallId !== "string" || typeof content.line !== "string") return;
      const card = ensureToolCard(toolCards, reasoningCards, latestReasoningCardIdsByRun, {
        ...event, toolCallId: content.toolCallId,
        toolCallName: typeof content.toolName === "string" ? content.toolName : "tool",
      });
      if (card) card.logs.push(content.line);
      return;
    }
    if (type === "ACTIVITY_DELTA") {
      const card = ensureToolCard(toolCards, reasoningCards, latestReasoningCardIdsByRun, event);
      if (!card) return;
      card.logs.push(...activityLines(event));
      return;
    }
    if (type === "TOOL_CALL_RESULT") {
      const card = ensureToolCard(toolCards, reasoningCards, latestReasoningCardIdsByRun, event);
      if (!card) return;
      updateToolCardName(card, event);
      const result = "content" in event && typeof event.content === "string" ? event.content : "";
      card.result = result || aguiEventSummary(event);
      card.ended = true;
      return;
    }
    if (type === "TOOL_CALL_END") {
      const card = ensureToolCard(toolCards, reasoningCards, latestReasoningCardIdsByRun, event);
      // Framework's END closes the argument stream before execution. Legacy
      // host frames used END as their final execution marker and remain readable.
      const native = "metadata" in event && event.metadata && typeof event.metadata === "object"
        && "framework" in event.metadata;
      if (card && !native) card.ended = true;
    }
  });

  const toolGroupCards = new Map<string, ToolGroupWorkCard>();
  Array.from(toolCards.values())
    .filter((value) => value.started)
    .forEach((toolCard) => {
      const groupKey = `${toolCard.runId}:tool-group:${toolCard.parentReasoningId ?? "unassigned"}`;
      const existing = toolGroupCards.get(groupKey);
      if (existing) {
        existing.toolCards.push(toolCard);
        existing.firstMillis = Math.min(existing.firstMillis, toolCard.firstMillis);
        return;
      }
      toolGroupCards.set(groupKey, {
        firstMillis: toolCard.firstMillis,
        id: groupKey,
        runId: toolCard.runId,
        toolCards: [toolCard],
      });
    });

  return [
    ...Array.from(reasoningCards.values())
      .filter((value) => value.content.trim() || value.summary.trim() || value.toolCards.length > 0 || !value.ended)
      .map((value) => ({ kind: "reasoning" as const, value })),
    ...Array.from(toolGroupCards.values())
      .map((value) => ({
        kind: value.toolCards.length === 1 && value.toolCards[0].parentReasoningId === null
          ? "tool"
          : "toolGroup",
        value: value.toolCards.length === 1 && value.toolCards[0].parentReasoningId === null
          ? value.toolCards[0]
          : value,
      } as AguiUserWorkCard)),
  ].sort((left, right) => left.value.firstMillis - right.value.firstMillis);
}

function aguiRunsWithWorkDetails(events: TranscriptAguiEvent[], limit: number) {
  const runs = new Map<string, AguiWorkRun>();
  events.forEach((event) => {
    const runId = aguiEventRunId(event);
    if (!runId) return;
    const firstMillis = aguiEventMillis(event) ?? Date.now();
    const existing = runs.get(runId);
    if (existing) {
      existing.events.push(event);
      existing.firstMillis = Math.min(existing.firstMillis, firstMillis);
      return;
    }
    runs.set(runId, {
      events: [event],
      firstMillis,
      runId,
    });
  });

  return Array.from(runs.values())
    .filter((run) => (
      buildAguiUserWorkCards(run.events).length > 0
      || run.events.some(event => aguiEventType(event).toUpperCase().startsWith("TEXT_MESSAGE_"))
      || buildAguiRunNotices(run.events).length > 0
      || !run.events.some((event) => {
        return isAguiExecutionTerminalEvent(event);
      })
    ))
    .sort((left, right) => left.firstMillis - right.firstMillis)
    .slice(-limit);
}

function userMessageCodeBeforeIndex(messages: ChatMessage[], startIndex: number) {
  for (let index = startIndex; index >= 0; index -= 1) {
    if (messages[index].role === "USER") return messages[index].messageId;
  }
  return "";
}

function anchorMessageCodeForAguiRun(
  messages: ChatMessage[],
  runId: string,
  liveAnchorMessageCodes: Record<string, string>,
  events: TranscriptAguiEvent[] = [],
) {
  const liveAnchorMessageCode = liveAnchorMessageCodes[runId] ?? "";
  if (liveAnchorMessageCode && messages.some((message) => message.messageId === liveAnchorMessageCode)) {
    return liveAnchorMessageCode;
  }
  const nativeIds = new Set(events.map(historyEventRunId));
  const textIds = new Set(events.flatMap(event => "messageId" in event ? [event.messageId] : []));
  const assistantIndex = messages.findIndex((message) => (
    message.role === "ASSISTANT" && (message.runId === runId || nativeIds.has(message.runId ?? "") || textIds.has(message.messageId))
  ));
  if (assistantIndex === 0) return messages[0].messageId;
  if (assistantIndex > 0) {
    const previousMessage = messages[assistantIndex - 1];
    if (previousMessage.role === "ASSISTANT") return previousMessage.messageId;
    return userMessageCodeBeforeIndex(messages, assistantIndex - 1);
  }
  return userMessageCodeBeforeIndex(messages, messages.length - 1);
}

export function aguiWorkRailsByMessageCode(
  messages: ChatMessage[],
  events: TranscriptAguiEvent[],
  liveAnchorMessageCodes: Record<string, string>,
  recentWorkRunLimit: number,
) {
  const rails = new Map<string, AguiWorkRun[]>();
  aguiRunsWithWorkDetails(events, recentWorkRunLimit).forEach((run) => {
    const messageId = anchorMessageCodeForAguiRun(messages, run.runId, liveAnchorMessageCodes, run.events);
    if (!messageId) return;
    const current = rails.get(messageId) ?? [];
    current.push(run);
    rails.set(messageId, current);
  });
  return rails;
}

export function buildTranscriptPresentation(args: {
  debugOptions?: ChatDebugOptions;
  liveAguiAnchorMessageCodes?: Record<string, string>;
  liveAguiEvents?: ChatAguiStreamEvent[];
  liveAguiPendingAnchorMessageCode?: string;
  liveAguiPending?: boolean;
  messages: ChatMessage[];
  protocolEvents?: ChatAguiStreamEvent[];
  sessionId: string;
}) {
  const liveEvents = args.liveAguiEvents ?? [];
  const protocolEvents = args.protocolEvents ?? [];
  const mergedEvents = mergeTranscriptAguiEvents(protocolEvents, liveEvents);
  const liveAnchorMessageCodes = replayNoticeAnchorMessageCodes(mergedEvents, args.sessionId, args.messages);
  Object.entries(args.liveAguiAnchorMessageCodes ?? {}).forEach(([runId, messageId]) => {
    if (args.messages.some((message) => message.messageId === messageId)) {
      liveAnchorMessageCodes[runId] = messageId;
    }
  });
  const recentTurnLimit = args.debugOptions?.recentTurnLimit ?? 5;
  const debugEventTypes = args.debugOptions?.debugEventTypes ?? [];
  const transcriptAguiEvents = args.liveAguiPending && !protocolEvents.length && !liveEvents.length
    ? []
    : filterTranscriptAguiEventsForSession(
      mergedEvents,
      args.sessionId,
      args.messages,
      liveAnchorMessageCodes,
    );
  const waitingForModelAnchorMessageCode = (() => {
    if (!args.liveAguiPending || !args.sessionId) return "";
    const pendingAnchor = args.liveAguiPendingAnchorMessageCode ?? "";
    if (pendingAnchor && args.messages.some((message) => message.messageId === pendingAnchor)) {
      return pendingAnchor;
    }
    if (transcriptAguiEvents.some((event) => aguiEventType(event).toUpperCase() === "RUN_STARTED")) {
      return "";
    }
    for (let index = args.messages.length - 1; index >= 0; index -= 1) {
      const message = args.messages[index];
      if (message.sessionId === args.sessionId && message.role === "USER") {
        return message.messageId;
      }
    }
    return "";
  })();
  const workRailsByMessageCode = aguiWorkRailsByMessageCode(
    args.messages,
    transcriptAguiEvents,
    liveAnchorMessageCodes,
    recentTurnLimit,
  );
  const debugEventsByRunCode = new Map<string, TranscriptAguiEvent[]>();
  if (debugEventTypes.length) {
    transcriptAguiEvents.forEach((event) => {
      const type = aguiEventType(event).toUpperCase();
      if (!debugEventTypes.includes(type)) return;
      const runId = aguiEventRunId(event);
      const current = debugEventsByRunCode.get(runId) ?? [];
      current.push(event);
      debugEventsByRunCode.set(runId, current);
    });
  }
  return {
    debugEventsByRunCode,
    waitingForModelAnchorMessageCode,
    workRailsByMessageCode,
  } satisfies TranscriptPresentation;
}

function replayNoticeAnchorMessageCodes(
  events: TranscriptAguiEvent[],
  sessionId: string,
  messages: ChatMessage[],
) {
  const anchors: Record<string, string> = {};
  const runs = new Map<string, TranscriptAguiEvent[]>();
  events.forEach((event) => {
    // Unknown replay runs need an explicit session match, not only a timestamp.
    if (!sessionId || aguiEventThreadId(event) !== sessionId) return;
    const runId = aguiEventRunId(event);
    if (!runId || runId === "stream") return;
    const runEvents = runs.get(runId) ?? [];
    runEvents.push(event);
    runs.set(runId, runEvents);
  });
  runs.forEach((runEvents, runId) => {
    if (!buildAguiRunNotices(runEvents).length) return;
    const startedAt = aguiEventMillis(runEvents[0]);
    if (startedAt === null) return;
    // A failed run may have no assistant message and user messages have no runId.
    // Restore its original turn (including answer continuations), not the latest user turn.
    const anchor = [...messages].reverse().find((message) => (
      message.sessionId === sessionId
      && (messageCreatedMillis(message) ?? Infinity) <= startedAt
    ));
    if (anchor) anchors[runId] = anchor.messageId;
  });
  return anchors;
}

export function buildMockStreamingEvents(
  sessionId: string,
  runId: string,
  assistantMessageId: string,
  assistantContent: string,
) {
  const startedAt = Date.now();
  const reasoningContent = "Reviewing session context and preparing a response.";
  const toolCallId = `${runId}-tool-1`;
  const chunks = assistantContent.match(/.{1,18}/g) ?? [assistantContent];
  const events: ChatAguiStreamEvent[] = [
    { type: "RUN_STARTED", threadId: sessionId, runId: runId, timestamp: startedAt },
    { type: "REASONING_START", threadId: sessionId, runId: runId, messageId: `${runId}-reasoning`, timestamp: startedAt + 1 },
    { type: "REASONING_MESSAGE_START", threadId: sessionId, runId: runId, messageId: `${runId}-reasoning`, timestamp: startedAt + 2 },
    { type: "REASONING_MESSAGE_CONTENT", threadId: sessionId, runId: runId, messageId: `${runId}-reasoning`, delta: reasoningContent, timestamp: startedAt + 3 },
    { type: "REASONING_MESSAGE_END", threadId: sessionId, runId: runId, messageId: `${runId}-reasoning`, timestamp: startedAt + 4 },
    { type: "REASONING_END", threadId: sessionId, runId: runId, messageId: `${runId}-reasoning`, timestamp: startedAt + 5 },
    { type: "TOOL_CALL_START", threadId: sessionId, runId: runId, toolCallId, toolCallName: "context.inspect", toolCallArgs: {}, timestamp: startedAt + 6 },
    { type: "TOOL_CALL_RESULT", threadId: sessionId, runId: runId, toolCallId, toolCallName: "context.inspect", content: "Context loaded.", timestamp: startedAt + 7 },
    { type: "TOOL_CALL_END", threadId: sessionId, runId: runId, toolCallId, timestamp: startedAt + 8 },
    { type: "TEXT_MESSAGE_START", threadId: sessionId, runId: runId, messageId: assistantMessageId, role: "assistant", timestamp: startedAt + 9 },
    ...chunks.map((delta, index) => ({
      type: "TEXT_MESSAGE_CONTENT" as const,
      threadId: sessionId,
      runId: runId,
      messageId: assistantMessageId,
      delta,
      timestamp: startedAt + 10 + index,
    })),
    { type: "TEXT_MESSAGE_END", threadId: sessionId, runId: runId, messageId: assistantMessageId, timestamp: startedAt + 11 + chunks.length },
  ];
  return events;
}

export function summarizeReasoning(card: ReasoningWorkCard) {
  return deriveReasoningPreview(card.summary);
}

export function describeDebugEvent(event: TranscriptAguiEvent) {
  return `${aguiEventType(event)} · ${formatTime(aguiEventTime(event))} · ${aguiEventSummary(event)}`;
}
