import type { ChatMessage, ChatUserInputRequest, TranscriptAguiEvent } from "./types";
import { historyEventRunId, historyToolResult, type HistoryStatus } from "./history";
import { aguiWorkElapsedMilliseconds } from "./aguiWork";
import { historyCoversAguiWork, historyWorkCompleted } from "./historyWork";
import { currentAguiTerminalEvent } from "./aguiWork";
import { messageSenderIsHuman } from "./messageProvenance";
import { aguiEventMillis, aguiEventType, buildAguiUserWorkCards, mergeTranscriptAguiEvents,
  type ReasoningWorkCard, type ToolWorkCard, type TranscriptPresentation } from "./transcript";

export type WorkTimelineItem =
  | { kind: "message"; id: string; message: ChatMessage }
  | { kind: "reasoning"; id: string; value: ReasoningWorkCard }
  | { kind: "tool"; id: string; value: ToolWorkCard; historyStatus?: HistoryStatus };

export interface TranscriptWorkRun {
  id: string;
  runId: string;
  events: TranscriptAguiEvent[];
  messages: ChatMessage[];
  items: WorkTimelineItem[];
  completed: boolean;
  finalMessageId?: string;
}

export function workTimelineElapsedMilliseconds(run: TranscriptWorkRun, now = Date.now()) {
  if (run.events.length) return aguiWorkElapsedMilliseconds(run.events, now);
  const records = run.messages.flatMap(message => message.history?.run ? [message.history.run] : []);
  const starts = records.map(record => record.startedAtMs);
  const ends = records.flatMap(record => record.finishedAtMs === null ? [] : [record.finishedAtMs]);
  return starts.length ? Math.max(0, (run.completed && ends.length ? Math.max(...ends) : now) - Math.min(...starts)) : 0;
}

interface Group {
  id: string;
  nativeId: string;
  scope: string;
  anchor: string;
  before: boolean;
  messages: ChatMessage[];
  events: TranscriptAguiEvent[];
  wireIds: Set<string>;
}

/** One ordered process per execution and user boundary. Native identities bind
 * live frames to durable records; an accepted interaction remains outside it.
 * A text END only closes that step. Only execution success identifies a final.
 */
export function buildTranscriptWorkTimeline(messages: ChatMessage[], presentation: TranscriptPresentation,
  requests: ChatUserInputRequest[] = []) {
  const groups = new Map<string, Group>();
  const scopeByMessage = new Map<string, string>();
  const groupByMessage = new Map<string, Group>();
  let scope = "";
  for (const message of messages) {
    if (message.role === "USER" && messageSenderIsHuman(message)) scope = message.messageId;
    scopeByMessage.set(message.messageId, scope);
    const nativeId = message.history?.run?.id ?? message.runId;
    if (message.role !== "ASSISTANT" || !nativeId) continue;
    const id = `${scope}:${nativeId}`;
    let group = groups.get(id);
    if (!group) {
      group = { id, nativeId, scope, anchor: message.messageId, before: true, messages: [], events: [], wireIds: new Set() };
      groups.set(id, group);
    }
    group.messages.push(message);
    groupByMessage.set(message.messageId, group);
  }
  for (const [anchor, runs] of presentation.workRailsByMessageCode) for (const run of runs) for (const segment of executionSegments(run.events)) {
    const nativeId = historyEventRunId(segment[0] ?? { runId: run.runId });
    // Text identity is stronger than timestamp or a host's execution alias.
    const identified = segment.flatMap(event => "messageId" in event && typeof event.messageId === "string"
      ? [groupByMessage.get(event.messageId)] : []).find(Boolean);
    const start = aguiEventMillis(segment[0]);
    const precedingUser = start === null ? undefined : [...messages].reverse().find(message =>
      message.role === "USER" && messageSenderIsHuman(message) && Date.parse(message.createdAt) <= start);
    const eventScope = precedingUser?.messageId ?? scopeByMessage.get(anchor) ?? "";
    const id = `${eventScope}:${nativeId}`;
    let group = identified ?? groups.get(id);
    if (!group) {
      group = { id, nativeId, scope: eventScope, anchor: precedingUser?.messageId ?? anchor, before: false, messages: [], events: [], wireIds: new Set() };
      groups.set(id, group);
    }
    group.events = mergeTranscriptAguiEvents(group.events, segment);
    group.wireIds.add(run.runId);
  }
  const before = new Map<string, TranscriptWorkRun[]>();
  const after = new Map<string, TranscriptWorkRun[]>();
  const processMessageIds = new Set<string>();
  const managedMessageIds = new Set<string>();
  for (const group of groups.values()) {
    if (!group.events.length && !group.messages.some(message => message.history)) continue;
    const terminal = currentAguiTerminalEvent(group.events);
    const historyComplete = group.messages.length > 0 && group.messages.every(message => message.history)
      && historyWorkCompleted(group.messages)
      && (!group.events.length || historyCoversAguiWork(group.messages, group.events));
    const pending = requests.some(request => request.status === "Pending"
      && (request.runId === group.nativeId || group.wireIds.has(request.runId)
        || group.messages.some(message => message.messageId === request.assistantMessageId)));
    const outcome = terminal && "outcome" in terminal ? terminal.outcome as { type?: string } | undefined : undefined;
    const interrupted = outcome?.type === "interrupt"
      || group.messages.some(message => message.history?.run?.status === "Waiting");
    const completed = !pending && (Boolean(terminal) || historyComplete);
    const successful = completed && !interrupted && (terminal ? aguiEventType(terminal).toUpperCase() === "RUN_FINISHED"
      : group.messages.some(message => message.history?.run?.status === "Completed"));
    const final = successful ? [...group.messages].reverse().find(message =>
      message.content.trim() || message.a2ui || message.history?.message.structured != null) : undefined;
    const run: TranscriptWorkRun = { id: group.id, runId: [...group.wireIds][0] ?? group.nativeId,
      events: group.events, messages: group.messages, completed, finalMessageId: final?.messageId,
      items: buildItems(group.messages, group.events, final?.messageId, historyComplete) };
    for (const message of group.messages) {
      managedMessageIds.add(message.messageId);
      if (message !== final) processMessageIds.add(message.messageId);
    }
    const map = group.before ? before : after;
    const bucket = map.get(group.anchor) ?? [];
    bucket.push(run); map.set(group.anchor, bucket);
  }
  return { before, after, processMessageIds, managedMessageIds };
}

function executionSegments(events: TranscriptAguiEvent[]) {
  const segments: TranscriptAguiEvent[][] = [];
  for (const event of events) {
    if (!segments.length || aguiEventType(event).toUpperCase() === "RUN_STARTED" && segments.at(-1)!.length)
      segments.push([]);
    segments.at(-1)!.push(event);
  }
  return segments;
}

function buildItems(messages: ChatMessage[], events: TranscriptAguiEvent[], finalId: string | undefined, historyComplete: boolean) {
  const ranked: Array<{ item: WorkTimelineItem; time: number; order: number }> = [];
  const add = (item: WorkTimelineItem, time: number, order = 0) => ranked.push({ item, time, order });
  const at = (index: number) => aguiEventMillis(events[index]) ?? index;
  // Synthetic positions retain source order even when many frames share a clock
  // tick. They are only sort keys, never displayed as elapsed time.
  // Live AG-UI frames can contain progress/reasoning that history does not
  // persist. Keep them alongside durable history and use tool call IDs below
  // to avoid rendering the same invocation twice.
  const cards = buildAguiUserWorkCards(events.map((event, index) => ({ ...event, timestamp: index + 1 })));
  const eventToolIds = new Set<string>();
  for (const card of cards) {
    if (card.kind === "reasoning") {
      const index = card.value.firstMillis - 1;
      // Empty reasoning containers sometimes exist solely to own tool calls.
      if (card.value.summary.trim() || card.value.content.trim() || !card.value.ended)
        add({ kind: "reasoning", id: card.value.id, value: card.value }, at(index), index);
    } else for (const tool of card.kind === "toolGroup" ? card.value.toolCards : [card.value]) {
      if (!tool.started) continue;
      eventToolIds.add(tool.toolCallId);
      const index = tool.firstMillis - 1;
      add({ kind: "tool", id: tool.id, value: tool }, at(index), index);
    }
  }
  for (const message of messages) {
    const view = message.history;
    const textIndex = events.findIndex(event => aguiEventType(event).toUpperCase().startsWith("TEXT_MESSAGE_")
      && "messageId" in event && event.messageId === message.messageId);
    const time = textIndex >= 0 && !historyComplete ? at(textIndex)
      : view?.step?.startedAtMs ?? Date.parse(message.createdAt);
    const order = textIndex >= 0 && !historyComplete ? textIndex : 0;
    const reasoning = view?.message.content.filter(block => block.type === "Reasoning").map(block => "text" in block ? block.text : "").join("") ?? "";
    const hasEventReasoning = events.some(event =>
      aguiEventType(event).toUpperCase().startsWith("REASONING_") && "messageId" in event
        && (event.messageId === message.messageId || event.messageId === `${message.messageId}/reasoning`));
    if (reasoning && !hasEventReasoning) {
      const id = `${message.messageId}:reasoning`;
      add({ kind: "reasoning", id, value: { id, runId: message.runId ?? "", content: reasoning, summary: reasoning,
        ended: view?.message.status !== "Running", firstMillis: time, endMillis: view?.step?.finishedAtMs ?? null, toolCards: [] } }, time, order - 0.5);
    }
    if (message.messageId !== finalId && (message.content.trim() || message.a2ui
      || view?.message.structured != null || view?.message.content.some(block => !["Text", "Reasoning"].includes(block.type))))
      add({ kind: "message", id: message.messageId, message }, time, order);
    for (const tool of view?.tools ?? []) {
      if (eventToolIds.has(tool.id) || eventToolIds.has(tool.callId)) continue;
      eventToolIds.add(tool.id);
      add({ kind: "tool", id: tool.id, historyStatus: tool.status, value: { id: tool.id, runId: tool.runId, toolCallId: tool.id,
        toolName: tool.toolName, args: tool.arguments, result: historyToolResult(tool), logs: [], parentReasoningId: null,
        firstMillis: tool.startedAtMs ?? time, started: tool.status === "Running", ended: ["Completed", "Failed"].includes(tool.status) } },
      tool.startedAtMs ?? time, order + 0.5);
    }
  }
  return ranked.sort((a, b) => a.time - b.time || a.order - b.order).map(entry => entry.item);
}
