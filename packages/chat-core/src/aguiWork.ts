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
) {
  const reverseStart = [...events].reverse().findIndex(event => aguiEventType(event).toUpperCase() === "RUN_STARTED");
  const start = reverseStart < 0 ? -1 : events.length - 1 - reverseStart;
  const segment = start < 0 ? events : events.slice(start);
  const timestamps = segment
    .map(aguiEventMillis)
    .filter((value): value is number => typeof value === "number");
  if (!timestamps.length) return 0;

  const first = Math.min(...timestamps);
  const latest = Math.max(...timestamps);
  const terminal = currentAguiTerminalEvent(segment);
  const end = terminal ? aguiEventMillis(terminal) ?? latest : Math.max(latest, now);
  return Math.max(0, end - first);
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
