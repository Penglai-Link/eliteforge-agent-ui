import type { ChatMessage, TranscriptAguiEvent } from "./types";
import { historyEventRunId } from "./history";
import { aguiEventMillis, aguiEventType, isAguiExecutionTerminalEvent } from "./transcript";
import { messageSenderIsHuman } from "./messageProvenance";

/** Fold work together, while preserving user answers as transcript boundaries. */
export function historyWorkGroups(messages: readonly ChatMessage[]) {
  const groups = new Map<string, ChatMessage[]>();
  let anchor = "";
  let runId: string | null | undefined;
  for (const message of messages) {
    if (message.role === "USER" && messageSenderIsHuman(message)) { anchor = ""; continue; }
    if (!anchor || runId !== message.runId) { anchor = message.messageId; runId = message.runId; }
    if (!message.history?.tools.length && !message.history?.message.content.some(block => block.type === "Reasoning" && block.text.trim())) continue;
    const group = groups.get(anchor) ?? [];
    group.push(message);
    groups.set(anchor, group);
  }
  return groups;
}

export function historyWorkCompleted(messages: readonly ChatMessage[]) {
  return messages.every(message => {
    const view = message.history;
    return view?.run ? !["Running", "Waiting", "Planned"].includes(view.run.status)
      : view?.message.status !== "Running" && view?.message.status !== "Waiting";
  });
}

/** Settled history replaces the corresponding live work, but never a new segment. */
export function historyCoversAguiWork(messages: readonly ChatMessage[], events: readonly TranscriptAguiEvent[]) {
  const runIds = new Set(events.map(historyEventRunId));
  const run = messages.find(message => message.role === "ASSISTANT" && message.history?.run && runIds.has(message.history.run.id))?.history?.run;
  if (!run || ["Running", "Waiting", "Planned"].includes(run.status)) return false;
  const lifecycle = [...events].reverse().find(event => aguiEventType(event).toUpperCase() === "RUN_STARTED" || isAguiExecutionTerminalEvent(event));
  if (!lifecycle || isAguiExecutionTerminalEvent(lifecycle)) return true;
  const startedAt = aguiEventMillis(lifecycle);
  return startedAt != null && run.finishedAtMs != null && startedAt <= run.finishedAtMs;
}
