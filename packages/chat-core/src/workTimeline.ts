import { newerBatchRevision } from "./toolBatch";
import type { ChatAguiStreamEvent, ChatMessage, ChatUserInputRequest, TranscriptAguiEvent } from "./types";
import { historyEventRunId, historyToolResult, type HistoryStatus } from "./history";
import { aguiWorkElapsedMilliseconds } from "./aguiWork";
import { historyCoversAguiWork, historyWorkCompleted } from "./historyWork";
import { currentAguiTerminalEvent } from "./aguiWork";
import { messageSenderIsHuman } from "./messageProvenance";
import { aguiEventMillis, aguiEventType, buildAguiUserWorkCards, mergeTranscriptAguiEvents,
  type ReasoningWorkCard, type ToolGroupWorkCard, type ToolWorkCard, type TranscriptPresentation } from "./transcript";

export type WorkTimelineItem =
  | { kind: "message"; id: string; message: ChatMessage }
  | { kind: "reasoning"; id: string; value: ReasoningWorkCard }
  | { kind: "toolGroup"; id: string; value: ToolGroupWorkCard; historyStatuses?: Record<string, HistoryStatus> }
  | { kind: "tool"; id: string; value: ToolWorkCard; historyStatus?: HistoryStatus };

export interface TranscriptWorkRun {
  id: string;
  runId: string;
  events: TranscriptAguiEvent[];
  messages: ChatMessage[];
  items: WorkTimelineItem[];
  completed: boolean;
  waitingAtMs?: number;
  segmentStartedAtMs?: number;
  segmentFinishedAtMs?: number;
  finalMessageId?: string;
  /** Execution records contributing to this user turn, each counted once. */
  segments?: TranscriptWorkRun[];
  runIds?: string[];
  /** Only the last visible segment owns run-wide notices and debug details. */
  includeRunMetadata?: boolean;
}

export function workTimelineElapsedMilliseconds(run: TranscriptWorkRun, now = Date.now()): number {
  if (run.segments) return run.segments.reduce((total, segment) => total + workTimelineElapsedMilliseconds(segment, now), 0);
  const eventTimes = run.events.map(aguiEventMillis).filter((value): value is number => value !== null);
  const records = run.messages.flatMap(message => message.history?.run ? [message.history.run] : []);
  const starts = records.map(record => record.startedAtMs);
  const ends = records.flatMap(record => record.finishedAtMs === null ? [] : [record.finishedAtMs]);
  const runStartedAt = run.events.find(event => aguiEventType(event).toUpperCase() === "RUN_STARTED");
  const terminal = currentAguiTerminalEvent(run.events);
  const start = run.segmentStartedAtMs
    ?? (runStartedAt ? aguiEventMillis(runStartedAt) : null)
    ?? (eventTimes.length ? Math.min(...eventTimes) : null)
    ?? (starts.length ? Math.min(...starts) : null);
  if (start === null) return 0;
  const end = run.segmentFinishedAtMs
    ?? (terminal ? aguiEventMillis(terminal) : null)
    ?? run.waitingAtMs
    ?? (run.completed && ends.length ? Math.max(...ends) : null)
    ?? (eventTimes.length ? Math.max(now, ...eventTimes) : now);
  if (run.events.length) {
    const events = run.events.filter(event => {
      const at = aguiEventMillis(event);
      return at === null || (at >= start && at <= end);
    });
    // A steering boundary can bisect an active interval without a RUN_STARTED.
    if (run.segmentStartedAtMs !== undefined) events.unshift({ type: "RUN_STARTED", timestamp: start, runId: run.runId });
    return aguiWorkElapsedMilliseconds(events, end, end);
  }
  return Math.max(0, end - start);
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
  segmentStartedAtMs?: number;
  segmentFinishedAtMs?: number;
}

const workSegmentEndEvent = "CLIENT_WORK_SEGMENT_END";
const workSegmentStartEvent = "CLIENT_WORK_SEGMENT_START";

export function createSteerWorkSegmentEvents(input: {
  at: number;
  fromMessageId: string;
  nativeRunId: string;
  runId: string;
  threadId: string;
  toMessageId: string;
}): ChatAguiStreamEvent[] {
  const common = {
    threadId: input.threadId,
    runId: input.runId,
    timestamp: input.at,
    fromMessageId: input.fromMessageId,
    toMessageId: input.toMessageId,
    metadata: { execution: { runId: input.nativeRunId } },
  };
  return [
    { ...common, type: workSegmentEndEvent },
    { ...common, type: workSegmentStartEvent },
  ];
}

interface SteerSegmentBoundary {
  at: number;
  fromMessageId: string;
  toMessageId: string;
}

function isWorkSegmentEvent(event: TranscriptAguiEvent, type: string) {
  return aguiEventType(event).toUpperCase() === type;
}

function workSegmentEvents(
  events: TranscriptAguiEvent[],
  nativeId: string,
  boundaries: SteerSegmentBoundary[],
): TranscriptAguiEvent[] {
  if (!boundaries.length) return events;
  const template = events[0];
  const markers: ChatAguiStreamEvent[] = [];
  for (const boundary of boundaries) {
    const candidates = createSteerWorkSegmentEvents({
      ...boundary,
      threadId: template && "threadId" in template && typeof template.threadId === "string" ? template.threadId : "",
      runId: template && "runId" in template && typeof template.runId === "string" ? template.runId : nativeId,
      nativeRunId: nativeId,
    });
    for (const marker of candidates) {
      if (events.some(event => aguiEventType(event).toUpperCase() === marker.type
        && "fromMessageId" in event && event.fromMessageId === boundary.fromMessageId
        && "toMessageId" in event && event.toMessageId === boundary.toMessageId)) continue;
      markers.push(marker);
    }
  }
  markers.sort((left, right) => aguiEventMillis(left)! - aguiEventMillis(right)!);
  if (!markers.length) return events;
  const result: TranscriptAguiEvent[] = [];
  let markerIndex = 0;
  for (const event of events) {
    const eventAt = aguiEventMillis(event);
    while (markerIndex < markers.length && eventAt !== null && aguiEventMillis(markers[markerIndex]!)! <= eventAt) {
      result.push(markers[markerIndex++]!);
    }
    result.push(event);
  }
  result.push(...markers.slice(markerIndex));
  return result;
}

function steerSegmentBoundaries(
  messages: ChatMessage[],
  nativeId: string,
  runIds: Set<string>,
  events: TranscriptAguiEvent[],
): SteerSegmentBoundary[] {
  const humanIndexes = messages.flatMap((message, index) =>
    message.role === "USER" && messageSenderIsHuman(message) && !message.interactionResponse ? [index] : []);
  const boundaries: SteerSegmentBoundary[] = [];
  for (let humanPosition = 1; humanPosition < humanIndexes.length; humanPosition += 1) {
    const targetIndex = humanIndexes[humanPosition]!;
    const previousIndex = humanIndexes[humanPosition - 1]!;
    const target = messages[targetIndex]!;
    const previous = messages[previousIndex]!;
    // Accepted interaction answers already have an explicit RUN_STARTED anchor
    // path and are not ordinary user steering boundaries.
    if (target.interactionResponse || !target.runId || !runIds.has(target.runId)) continue;
    const at = Date.parse(target.createdAt);
    if (!Number.isFinite(at)) continue;
    const priorSameRunUser = humanIndexes.slice(0, humanPosition).some(index => {
      const runId = messages[index]?.runId;
      return Boolean(runId && runIds.has(runId));
    });
    const assistantActivityBetween = messages.slice(previousIndex + 1, targetIndex).some(message =>
      message.role === "ASSISTANT" && (message.history?.run?.id ?? message.runId) === nativeId);
    const eventActivityBetween = events.some(event => {
      if (historyEventRunId(event) !== nativeId) return false;
      const eventAt = aguiEventMillis(event);
      const previousAt = Date.parse(previous.createdAt);
      return eventAt !== null && Number.isFinite(previousAt) && eventAt > previousAt && eventAt < at;
    });
    if (!priorSameRunUser && !assistantActivityBetween && !eventActivityBetween) continue;
    boundaries.push({ at, fromMessageId: previous.messageId, toMessageId: target.messageId });
  }
  return boundaries;
}

/** One ordered process per ordinary user message, including interaction resumes.
 * Native identities bind live frames to durable records. A steer closes only
 * its UI segment, not the underlying run. A text END only closes that step.
 */
export function buildTranscriptWorkTimeline(messages: ChatMessage[], presentation: TranscriptPresentation,
  requests: ChatUserInputRequest[] = [], options: { showReasoningCards?: boolean } = {}) {
  const groups = new Map<string, Group>();
  const scopeByMessage = new Map<string, string>();
  const groupByMessage = new Map<string, Group>();
  const eventsByNativeId = new Map<string, TranscriptAguiEvent[]>();
  const aliasesByNativeId = new Map<string, Set<string>>();
  const registerRun = (nativeId: string, runId?: string | null, event?: TranscriptAguiEvent) => {
    if (!nativeId) return;
    const aliases = aliasesByNativeId.get(nativeId) ?? new Set<string>([nativeId]);
    if (runId) aliases.add(runId);
    aliasesByNativeId.set(nativeId, aliases);
    if (event) {
      const runEvents = eventsByNativeId.get(nativeId) ?? [];
      runEvents.push(event);
      eventsByNativeId.set(nativeId, runEvents);
    }
  };
  for (const message of messages) {
    if (message.role !== "ASSISTANT") continue;
    const nativeId = message.history?.run?.id ?? message.runId ?? "";
    registerRun(nativeId, message.runId);
  }
  for (const runs of presentation.workRailsByMessageCode.values()) for (const run of runs) {
    for (const event of run.events) registerRun(historyEventRunId(event), run.runId, event);
  }
  const boundariesByNativeId = new Map<string, SteerSegmentBoundary[]>();
  for (const [nativeId, aliases] of aliasesByNativeId) {
    const events = eventsByNativeId.get(nativeId) ?? [];
    const boundaries = steerSegmentBoundaries(messages, nativeId, aliases, events);
    for (const event of events) {
      if (!isWorkSegmentEvent(event, workSegmentStartEvent)
        || !("fromMessageId" in event) || typeof event.fromMessageId !== "string"
        || !("toMessageId" in event) || typeof event.toMessageId !== "string") continue;
      const at = aguiEventMillis(event);
      if (at === null) continue;
      const existing = boundaries.find(boundary => boundary.fromMessageId === event.fromMessageId && boundary.toMessageId === event.toMessageId);
      if (existing) existing.at = at;
      else boundaries.push({ at, fromMessageId: event.fromMessageId, toMessageId: event.toMessageId });
    }
    boundariesByNativeId.set(nativeId, boundaries.sort((left, right) => left.at - right.at));
  }
  let scope = "";
  for (const message of messages) {
    if (message.role === "USER" && messageSenderIsHuman(message) && !message.interactionResponse) scope = message.messageId;
    scopeByMessage.set(message.messageId, scope);
    const nativeId = message.history?.run?.id ?? message.runId;
    if (message.role !== "ASSISTANT" || !nativeId) continue;
    const id = `${scope}:${nativeId}`;
    let group = groups.get(id);
    const segmentBoundaries = boundariesByNativeId.get(nativeId) ?? [];
    if (!group) {
      const startedBoundary = segmentBoundaries.find(boundary => boundary.toMessageId === scope);
      const endedBoundary = segmentBoundaries.find(boundary => boundary.fromMessageId === scope);
      group = { id, nativeId, scope, anchor: message.messageId, before: true, messages: [], events: [], wireIds: new Set(),
        ...(startedBoundary ? { segmentStartedAtMs: startedBoundary.at } : {}),
        ...(endedBoundary ? { segmentFinishedAtMs: endedBoundary.at } : {}) };
      groups.set(id, group);
    }
    group.messages.push(message);
    groupByMessage.set(message.messageId, group);
  }
  for (const [anchor, runs] of presentation.workRailsByMessageCode) for (const run of runs) {
    const nativeId = historyEventRunId(run.events[0] ?? { runId: run.runId });
    const segmentBoundaries = boundariesByNativeId.get(nativeId) ?? [];
    const orderedEvents = workSegmentEvents(run.events, nativeId, segmentBoundaries);
    for (const segment of executionSegments(orderedEvents)) {
      const segmentNativeId = historyEventRunId(segment[0] ?? { runId: run.runId });
      const endedBoundary = [...segment].reverse().find(event => isWorkSegmentEvent(event, workSegmentEndEvent));
      const startedBoundary = segment.find(event => isWorkSegmentEvent(event, workSegmentStartEvent));
      const boundaryMessageId = endedBoundary && "fromMessageId" in endedBoundary && typeof endedBoundary.fromMessageId === "string"
        ? endedBoundary.fromMessageId
        : startedBoundary && "toMessageId" in startedBoundary && typeof startedBoundary.toMessageId === "string"
          ? startedBoundary.toMessageId : "";
      // Text identity is stronger than timestamp or a host's execution alias.
      const identified = segment.flatMap(event => "messageId" in event && typeof event.messageId === "string"
        ? [groupByMessage.get(event.messageId)] : []).find(Boolean);
      const start = aguiEventMillis(segment[0]);
      // Accepted answers are client-side boundaries. Their timestamp can be a
      // little later than the server's RUN_STARTED frame, especially on resume.
      const explicitUser = messages.find(message => message.messageId === anchor
        && message.interactionResponse && message.role === "USER" && messageSenderIsHuman(message));
      const precedingUser = explicitUser ?? (start === null ? undefined : [...messages].reverse().find(message =>
        message.role === "USER" && messageSenderIsHuman(message) && Date.parse(message.createdAt) <= start));
      const eventScope = boundaryMessageId || scopeByMessage.get(precedingUser?.messageId ?? anchor) || "";
      const id = `${eventScope}:${segmentNativeId}`;
      let group = boundaryMessageId ? groups.get(id) : identified ?? groups.get(id);
      if (!group) {
        group = { id, nativeId: segmentNativeId, scope: eventScope, anchor: boundaryMessageId || (precedingUser?.messageId ?? anchor),
          before: false, messages: [], events: [], wireIds: new Set() };
        groups.set(id, group);
      }
      if (startedBoundary) group.segmentStartedAtMs ??= aguiEventMillis(startedBoundary) ?? undefined;
      if (endedBoundary) group.segmentFinishedAtMs = aguiEventMillis(endedBoundary) ?? group.segmentFinishedAtMs;
      group.events = mergeTranscriptAguiEvents(group.events, segment);
      group.wireIds.add(run.runId);
    }
  }
  const before = new Map<string, TranscriptWorkRun[]>();
  const after = new Map<string, TranscriptWorkRun[]>();
  const processMessageIds = new Set<string>();
  const managedMessageIds = new Set<string>();
  // Invocation state spans approval/steering boundaries; only its placement is
  // segment-local. Resolve the whole run before rendering any one segment.
  const tools = resolvedTools(messages, mergeTranscriptAguiEvents(...eventsByNativeId.values()));
  const emittedTools = new Set<string>();
  const turns = new Map<string, { group: Group; runs: TranscriptWorkRun[] }>();
  const firstMillis = (group: Group) => Math.min(
    ...group.events.map(event => aguiEventMillis(event) ?? Infinity),
    ...group.messages.map(message => Date.parse(message.createdAt)),
  );
  for (const group of [...groups.values()].sort((a, b) => firstMillis(a) - firstMillis(b))) {
    if (!group.events.length && !group.messages.some(message => message.history)) continue;
    const terminal = currentAguiTerminalEvent(group.events);
    const historyComplete = group.messages.length > 0 && group.messages.every(message => message.history)
      && historyWorkCompleted(group.messages)
      && (!group.events.length || historyCoversAguiWork(group.messages, group.events));
    const lastMessageIndex = Math.max(-1, ...group.messages.map(message => messages.indexOf(message)));
    const nextUser = messages.slice(lastMessageIndex + 1).find(message => message.role === "USER" && messageSenderIsHuman(message));
    const answeredBoundary = Boolean(nextUser?.interactionResponse
      && (nextUser.runId === group.nativeId || group.wireIds.has(nextUser.runId ?? "")));
    const segmentEndedBySteer = group.segmentFinishedAtMs !== undefined;
    const pendingRequest = !answeredBoundary ? requests.find(request => request.status === "Pending"
      && (request.runId === group.nativeId || group.wireIds.has(request.runId)
        || group.messages.some(message => message.messageId === request.assistantMessageId))) : undefined;
    const pending = Boolean(pendingRequest);
    // A history-only request may have no creation timestamp; in that case use
    // the latest known work record instead of allowing wall time to keep growing.
    const eventTimes = group.events.map(aguiEventMillis).filter((value): value is number => value !== null);
    const startEvent = [...group.events].reverse().find(event => aguiEventType(event).toUpperCase() === "RUN_STARTED");
    const start = group.segmentStartedAtMs ?? (startEvent ? aguiEventMillis(startEvent) : null)
      ?? Math.min(...group.messages.flatMap(message => message.history?.run ? [message.history.run.startedAtMs] : []), ...eventTimes);
    const requestedAt = pendingRequest?.requestedAt;
    const knownTimes = [...eventTimes, ...group.messages.flatMap(message => [Date.parse(message.createdAt), ...(message.history?.tools ?? []).flatMap(tool => [tool.startedAtMs, tool.finishedAtMs])])]
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const outcome = terminal && "outcome" in terminal ? terminal.outcome as { type?: string } | undefined : undefined;
    const interrupted = outcome?.type === "interrupt"
      || !terminal && group.messages.some(message => message.history?.run?.status === "Waiting");
    const waitingAtMs = pending || interrupted ? (terminal ? aguiEventMillis(terminal) : null)
      ?? (typeof requestedAt === "number" && Number.isFinite(requestedAt) && requestedAt > start ? requestedAt : null)
      ?? (knownTimes.length ? Math.max(...knownTimes) : Number.isFinite(start) ? start : 0) : undefined;
    const completed = segmentEndedBySteer || !pending && !interrupted && (Boolean(terminal) || historyComplete);
    const successful = completed && !segmentEndedBySteer && !interrupted && (terminal ? aguiEventType(terminal).toUpperCase() === "RUN_FINISHED"
      : group.messages.some(message => message.history?.run?.status === "Completed"));
    const candidate = (message: ChatMessage) => Boolean(message.content.trim() || message.a2ui || message.history?.message.structured != null);
    const final = successful ? [...group.messages].reverse().find(message => message.phase === "final_answer" && candidate(message))
      ?? [...group.messages].reverse().find(message => message.phase == null && candidate(message)) : undefined;

    const run: TranscriptWorkRun = { id: group.id, runId: [...group.wireIds][0] ?? group.nativeId,
      events: group.events, messages: group.messages, completed, ...(waitingAtMs !== undefined ? { waitingAtMs } : {}), finalMessageId: final?.messageId,
      ...(group.segmentStartedAtMs !== undefined ? { segmentStartedAtMs: group.segmentStartedAtMs } : {}),
      ...(group.segmentFinishedAtMs !== undefined ? { segmentFinishedAtMs: group.segmentFinishedAtMs } : {}),
      items: [] };
    const turn = turns.get(group.scope) ?? { group, runs: [] };
    turn.runs.push(run);
    turns.set(group.scope, turn);
  }
  for (const [scope, { group, runs }] of turns) {
    const last = runs.at(-1)!;
    const events = mergeTranscriptAguiEvents(...runs.map(run => run.events));
    const messageIds = new Set(runs.flatMap(run => run.messages.map(message => message.messageId)));
    const turnMessages = messages.filter(message => messageIds.has(message.messageId)
      || Boolean(message.interactionResponse && scopeByMessage.get(message.messageId) === scope));
    const finalMessageId = last.completed ? last.finalMessageId : undefined;
    const items = buildItems(turnMessages, events, !events.length, tools, emittedTools, group.nativeId,
      options.showReasoningCards !== false).map(entry => entry.item)
      .filter(item => item.kind !== "message" || item.message.messageId !== finalMessageId);
    for (const message of turnMessages) {
      managedMessageIds.add(message.messageId);
      if (message.messageId !== finalMessageId) processMessageIds.add(message.messageId);
    }
    const run: TranscriptWorkRun = {
      id: `turn:${scope || group.id}`, runId: last.runId,
      runIds: [...new Set(runs.flatMap(run => [run.runId, ...run.events.map(historyEventRunId)]))],
      segments: runs, events, messages: turnMessages, items,
      completed: last.completed, waitingAtMs: last.waitingAtMs, finalMessageId,
    };
    // One stable card belongs to the original user message. Interaction receipts
    // and intermediate assistant replies are its contents, never new anchors.
    if (scope && messages.some(message => message.messageId === scope)) after.set(scope, [run]);
    else before.set(turnMessages[0]?.messageId ?? group.anchor, [run]);
  }
  return { before, after, processMessageIds, managedMessageIds };
}

function executionSegments(events: TranscriptAguiEvent[]) {
  const segments: TranscriptAguiEvent[][] = [];
  let current: TranscriptAguiEvent[] = [];
  for (const event of events) {
    const type = aguiEventType(event).toUpperCase();
    if (type === workSegmentEndEvent) {
      current.push(event);
      if (current.length) segments.push(current);
      current = [];
      continue;
    }
    if (type === workSegmentStartEvent) {
      if (current.length) segments.push(current);
      current = [event];
      continue;
    }
    if (type === "RUN_STARTED" && current.length
      && !current.some(event => isWorkSegmentEvent(event, workSegmentStartEvent))) {
      segments.push(current);
      current = [];
    }
    current.push(event);
  }
  if (current.length) segments.push(current);
  return segments;
}

type ResolvedTool = { value: ToolWorkCard; historyStatus?: HistoryStatus };
const toolKey = (runId: string, invocationId: string) => `${runId}:${invocationId}`;

function resolvedTools(messages: ChatMessage[], events: TranscriptAguiEvent[]): Map<string, ResolvedTool> {
  const tools = new Map<string, ResolvedTool>();
  for (const card of buildAguiUserWorkCards(events)) {
    if (card.kind === "reasoning") continue;
    for (const value of card.kind === "toolGroup" ? card.value.toolCards : [card.value]) {
      tools.set(value.id, { value });
    }
  }
  for (const message of messages) for (const tool of message.history?.tools ?? []) {
    const key = toolKey(tool.runId, tool.id);
    const existing = tools.get(key) ?? tools.get(toolKey(tool.runId, tool.callId));
    const ended = ["Completed", "Failed", "Interrupted", "Unknown"].includes(tool.status);
    // Terminal records repair missed RESULT frames. Nonterminal history and
    // snapshots share a durable parent revision, independent of transport order.
    // Neither partial history nor replay can roll back a confirmed live result.
    if (!existing || ended || (!existing.value.ended && newerBatchRevision(tool.batchRevision, existing.value.batchRevision))) {
      tools.set(key, { historyStatus: tool.status, value: {
        ...existing?.value,
        batchRevision: tool.batchRevision,
        id: key, runId: existing?.value.runId ?? tool.runId, stepId: message.messageId,
        toolCallId: tool.id, toolName: tool.toolName, args: tool.arguments,
        result: historyToolResult(tool), logs: existing?.value.logs ?? [],
        parentReasoningId: existing?.value.parentReasoningId ?? null,
        firstMillis: existing?.value.firstMillis ?? tool.startedAtMs ?? Date.parse(message.createdAt),
        started: !["Planned", "Approved"].includes(tool.status), ended,
      } });
    } else tools.set(key, existing);
    tools.set(toolKey(tool.runId, tool.callId), tools.get(key)!);
  }
  return tools;
}

function isVisibleTranscriptMessage(message: ChatMessage) {
  return Boolean(message.content.trim() || message.a2ui || message.history?.message.structured != null
    || message.history?.message.content.some(block => !["Text", "Reasoning"].includes(block.type)));
}

type PlacedWorkItem = { item: WorkTimelineItem; afterMessageId: string | null };

function buildItems(messages: ChatMessage[], events: TranscriptAguiEvent[], historyComplete: boolean,
  tools: Map<string, ResolvedTool>, emittedTools: Set<string>, nativeId: string, showReasoningCards: boolean) {
  const ranked: Array<{ item: WorkTimelineItem; time: number; order: number }> = [];
  const add = (item: WorkTimelineItem, time: number, order = 0) => ranked.push({ item, time, order });
  let previousTime = -Infinity;
  const sortTimes = events.map((event, index) => previousTime = Math.max(previousTime, aguiEventMillis(event) ?? index));
  const at = (index: number) => sortTimes[index] ?? index;
  // Synthetic positions retain source order even when many frames share a clock
  // tick. They are only sort keys, never displayed as elapsed time.
  // Live AG-UI frames can contain progress/reasoning that history does not
  // persist. Keep them alongside durable history and use tool call IDs below
  // to avoid rendering the same invocation twice.
  const cards = buildAguiUserWorkCards(events.map((event, index) => ({ ...event, timestamp: index + 1 })));
  const currentPhaseTools = new Set(cards.flatMap(card => card.kind === "toolGroup" && card.value.isCurrentPhase
    ? card.value.toolCards.map(tool => tool.id) : []));
  for (const card of cards) {
    if (card.kind === "reasoning") {
      const index = card.value.firstMillis - 1;
      // Empty reasoning containers sometimes exist solely to own tool calls.
      if (card.value.summary.trim() || card.value.content.trim() || !card.value.ended)
        add({ kind: "reasoning", id: card.value.id, value: card.value }, at(index), index);
    } else for (const tool of card.kind === "toolGroup" ? card.value.toolCards : [card.value]) {
      if (!tool.started) continue;
      const index = tool.firstMillis - 1;
      const toolRunId = events[index] ? historyEventRunId(events[index]!) : nativeId;
      const resolved = tools.get(toolKey(toolRunId, tool.toolCallId)) ?? tools.get(tool.id);
      const key = resolved?.value.id ?? toolKey(toolRunId, tool.toolCallId);
      if (emittedTools.has(key)) continue;
      emittedTools.add(key);
      add({ kind: "tool", id: tool.id, value: resolved ? { ...tool, ...resolved.value,
        parentReasoningId: tool.parentReasoningId } : tool,
        historyStatus: resolved?.historyStatus }, at(index), index);
    }
  }
  for (const message of messages) {
    const view = message.history;
    const textIndex = events.findIndex(event => aguiEventType(event).toUpperCase().startsWith("TEXT_MESSAGE_")
      && "messageId" in event && event.messageId === message.messageId);
    const time = textIndex >= 0 && !historyComplete ? at(textIndex)
      : view?.step?.startedAtMs ?? Date.parse(message.createdAt);
    const order = textIndex >= 0 && !historyComplete ? textIndex : 0;
    if (isVisibleTranscriptMessage(message) || message.interactionResponse) {
      const messageTime = textIndex >= 0 ? at(textIndex) : view?.message.createdAtMs ?? Date.parse(message.createdAt);
      add({ kind: "message", id: message.messageId, message }, messageTime, order);
    }
    const reasoning = view?.message.content.filter(block => block.type === "Reasoning").map(block => "text" in block ? block.text : "").join("") ?? "";
    const hasEventReasoning = events.some(event =>
      aguiEventType(event).toUpperCase().startsWith("REASONING_") && "messageId" in event
        && (event.messageId === message.messageId || event.messageId === `${message.messageId}/reasoning`));
    if (reasoning && !hasEventReasoning) {
      const id = `${message.messageId}:reasoning`;
      add({ kind: "reasoning", id, value: { id, runId: message.runId ?? "", content: reasoning, summary: reasoning,
        ended: view?.message.status !== "Running", firstMillis: time, endMillis: view?.step?.finishedAtMs ?? null, toolCards: [] } }, time, order - 0.5);
    }
    for (const tool of view?.tools ?? []) {
      const resolved = tools.get(toolKey(tool.runId, tool.id))!;
      if (emittedTools.has(resolved.value.id)) continue;
      emittedTools.add(resolved.value.id);
      add({ kind: "tool", id: tool.id, ...resolved },
      tool.startedAtMs ?? time, order + 0.5);
    }
  }
  const replyMessages = messages.filter(isVisibleTranscriptMessage);
  const replyBeforeMessage = (messageId: string, includeMessage: boolean) => {
    const index = messages.findIndex(message => message.messageId === messageId);
    if (index < 0) return null;
    return messages.slice(0, index + (includeMessage ? 1 : 0)).reverse().find(isVisibleTranscriptMessage)?.messageId ?? null;
  };
  const afterMessageId = (entry: typeof ranked[number]) => {
    const item = entry.item;
    if (item.kind === "message") return replyBeforeMessage(item.message.messageId, false);
    if (item.kind === "tool") {
      const start = events.find(event => aguiEventType(event).toUpperCase() === "TOOL_CALL_START"
        && "toolCallId" in event && event.toolCallId === item.value.toolCallId);
      const parent = start && "parentMessageId" in start && typeof start.parentMessageId === "string"
        ? start.parentMessageId : item.value.stepId;
      if (parent && messages.some(message => message.messageId === parent)) return replyBeforeMessage(parent, true);
    }
    if (item.kind === "reasoning" && item.id.endsWith(":reasoning")) {
      const parent = item.id.slice(0, -":reasoning".length);
      if (messages.some(message => message.messageId === parent)) return replyBeforeMessage(parent, false);
    }
    // Live and replay events carry an authoritative sequence, even when their
    // timestamps are identical. History-only data falls back to creation time.
    const replyEvents = replyMessages.map(message => ({ message, index: events.findIndex(event =>
      aguiEventType(event).toUpperCase() === "TEXT_MESSAGE_START" && "messageId" in event && event.messageId === message.messageId) }));
    if (events.length && replyEvents.some(phase => phase.index >= 0) && entry.order > 0) {
      return replyEvents.filter(phase => phase.index >= 0 && phase.index < entry.order).at(-1)?.message.messageId ?? null;
    }
    return replyMessages.filter(message => Date.parse(message.createdAt) <= entry.time).at(-1)?.messageId ?? null;
  };
  ranked.sort((a, b) => a.time - b.time || a.order - b.order);
  // History receipts can lack answeredAt and inherit the assistant message's
  // timestamp, which precedes its tool call. Preserve the causal relationship
  // using the durable invocation identity instead of inventing a response time.
  for (const receipt of [...ranked]) {
    if (receipt.item.kind !== "message" || !receipt.item.message.interactionResponse) continue;
    const message = receipt.item.message;
    const response = message.interactionResponse!;
    const tool = ranked.find(entry => entry.item.kind === "tool"
      && response.toolCallId != null
      && (entry.item.value.toolCallId === response.toolCallId || entry.item.id === response.toolCallId));
    if (!tool) continue;
    const receiptIndex = ranked.indexOf(receipt);
    const toolIndex = ranked.indexOf(tool);
    if (receiptIndex < toolIndex) {
      ranked.splice(receiptIndex, 1);
      ranked.splice(ranked.indexOf(tool) + 1, 0, receipt);
    }
  }
  const ordered: PlacedWorkItem[] = ranked
    .filter(entry => showReasoningCards || entry.item.kind !== "reasoning")
    .map(entry => ({ item: entry.item, afterMessageId: afterMessageId(entry) }));
  const grouped: PlacedWorkItem[] = [];
  for (let index = 0; index < ordered.length;) {
    if (ordered[index]?.item.kind !== "tool") {
      grouped.push(ordered[index]!);
      index += 1;
      continue;
    }
    const tools: Extract<WorkTimelineItem, { kind: "tool" }>[] = [];
    const firstEntry = ordered[index]!;
    const firstTool = firstEntry.item as Extract<WorkTimelineItem, { kind: "tool" }>;
    // A model/tool step is an execution detail, not a displayed phase boundary.
    // Keep consecutive search and execution calls together across history steps.
    const firstScope = firstTool.value.parentReasoningId;
    while (index < ordered.length) {
      const next = ordered[index];
      if (next?.item.kind !== "tool" || next.afterMessageId !== firstEntry.afterMessageId
        || (showReasoningCards && next.item.value.parentReasoningId !== firstScope)) break;
      tools.push(next.item);
      index += 1;
    }
    const first = tools[0]!;
    const id = `tool-group:${first.value.runId}:${tools.map(tool => tool.id).join(":")}`;
    const historyStatuses = Object.fromEntries(tools.flatMap(tool => tool.historyStatus ? [[tool.id, tool.historyStatus]] : []));
    grouped.push({ afterMessageId: firstEntry.afterMessageId, item: { kind: "toolGroup", id, ...(Object.keys(historyStatuses).length ? { historyStatuses } : {}),
      value: { id, runId: first.value.runId, isCurrentPhase: tools.some(tool => currentPhaseTools.has(tool.id)),
        firstMillis: first.value.firstMillis, toolCards: tools.map(tool => tool.value) } } });
  }
  return grouped;
}
