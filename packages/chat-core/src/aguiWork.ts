import {
  aguiEventMillis,
  isAguiExecutionTerminalEvent,
  aguiEventType,
  buildAguiUserWorkCards,
  summarizeReasoning,
} from "./transcript";
import type { TranscriptAguiEvent } from "./types";

export function isAguiRunTerminal(events: TranscriptAguiEvent[]) {
  return currentAguiTerminalEvent(events) !== null;
}

/** An interrupt closes one execution segment; RUN_STARTED opens the next. */
export function currentAguiTerminalEvent(events: TranscriptAguiEvent[]) {
  for (const event of [...events].reverse()) {
    if (isAguiExecutionTerminalEvent(event)) return event;
    if (aguiEventType(event).toUpperCase() === "RUN_STARTED") return null;
  }
  return null;
}

export function aguiWorkElapsedMilliseconds(
  events: TranscriptAguiEvent[],
  now = Date.now(),
  waitingAtMs?: number,
) {
  // Resume starts a new active interval. Count each interval once and exclude
  // the gap between an interrupt and the next RUN_STARTED (human wait time).
  let total = 0;
  let start: number | null = null;
  let latest: number | null = null;
  let closed = false;
  for (const event of events) {
    const at = aguiEventMillis(event) ?? latest;
    if (at === null) continue;
    if (aguiEventType(event).toUpperCase() === "RUN_STARTED") {
      if (start !== null) total += Math.max(0, at - start);
      start = at;
      closed = false;
    } else if (start === null && !closed) start = at;
    latest = at;
    if (isAguiExecutionTerminalEvent(event)) {
      if (start !== null) total += Math.max(0, at - start);
      start = null;
      closed = true;
    }
  }
  if (start !== null) total += Math.max(0, (waitingAtMs ?? Math.max(latest ?? start, now)) - start);
  return total;
}

export type AguiWorkActivity = "PREPARING" | "THINKING" | "RESPONDING";

export interface AguiWorkSnapshot {
  activity: AguiWorkActivity;
  summary: string | null;
}

function currentReasoningSummary(events: TranscriptAguiEvent[]) {
  const reasoningCards = buildAguiUserWorkCards(events)
    .filter((card) => card.kind === "reasoning");
  const latestReasoning = reasoningCards.at(-1)?.value;
  // Raw reasoning belongs in the expandable reasoning card. Only structured
  // summaries may be promoted into the always-visible activity label.
  return latestReasoning?.summary.trim() ? summarizeReasoning(latestReasoning) : "";
}

export function currentAguiWorkSnapshot(events: TranscriptAguiEvent[]): AguiWorkSnapshot | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event || aguiEventType(event).toUpperCase() !== "ACTIVITY_SNAPSHOT") continue;
    const activity = String(("activity" in event ? event.activity : "") ?? "").toUpperCase();
    if (activity === "PREPARING" || activity === "THINKING" || activity === "RESPONDING") {
      if (activity === "THINKING") {
        return { activity, summary: currentReasoningSummary(events) || null };
      }
      return { activity, summary: null };
    }
  }
  const summary = currentReasoningSummary(events);
  return summary ? { activity: "THINKING", summary } : null;
}

export function currentAguiWorkActivity(events: TranscriptAguiEvent[]) {
  return currentAguiWorkSnapshot(events)?.activity ?? null;
}
