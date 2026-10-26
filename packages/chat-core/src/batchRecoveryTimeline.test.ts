import { newerBatchRevision } from "./toolBatch";
import { expect, it } from "vitest";
import { mixedApprovalTimeline, recoveredBatchTimeline, recoveryFixture, recoveryEvents } from "../../../contracts/batch-recovery";
import { buildTranscriptWorkTimeline } from "./workTimeline";
import { buildTranscriptPresentation } from "./transcript";
import type { ChatMessage, ChatAguiStreamEvent } from "./types";

function toolsFor(input: {messages:ChatMessage[];events:ChatAguiStreamEvent[]}) {
  const presentation = buildTranscriptPresentation({messages:input.messages,protocolEvents:input.events,sessionId:"session"});
  const timeline = buildTranscriptWorkTimeline(input.messages,presentation);
  const runs = [...timeline.before.values(),...timeline.after.values()].flat();
  return runs.flatMap(run => run.items.flatMap(item => item.kind === "tool" ? [item.value]
    : item.kind === "toolGroup" ? item.value.toolCards : []));
}

it("keeps exactly one final parent across mixed approval answer boundaries", () => {
  const tools = toolsFor(mixedApprovalTimeline());
  expect(tools).toHaveLength(1);
  expect(tools[0].ended).toBe(true);
  expect(JSON.parse(tools[0].result).structured).toEqual(recoveryFixture.mixedCompleted.history.structured);
});

it.each(["mixedCompleted", "cancelContinue", "processorFailure", "progressCompleted"])("repairs retained waiting snapshots from final history: %s", name => {
  const tools = toolsFor(recoveredBatchTimeline(name));
  expect(tools).toHaveLength(1);
  expect(tools[0].ended).toBe(true);
  expect(JSON.parse(tools[0].result).structured).toEqual(recoveryFixture[name].history.structured);
});

it("retains new live completion when history is still waiting, and preserves progress logs", () => {
  const input = recoveredBatchTimeline("mixedWaiting");
  input.events.push({...input.events[0],type:"ACTIVITY_SNAPSHOT",activityType:"tron.tool.progress",timestamp:1200,
    content:{toolCallId:recoveryFixture.mixedWaiting.history.id,line:"working"}},
    ...recoveryEvents("mixedCompleted",false).map(event=>({...event,timestamp:1300})));
  const tools = toolsFor(input);
  expect(tools).toHaveLength(1);
  expect(tools[0].ended).toBe(true);
  expect(tools[0].logs).toEqual(["working"]);
  expect(JSON.parse(tools[0].result).structured).toEqual(recoveryFixture.mixedCompleted.history.structured);
});

// History and snapshots carry the same parent-local version across executions.
it.each(["partialCompleted", "mixedRejected"])("newer nonterminal history replaces retained waiting snapshot: %s", name => {
  const input = recoveredBatchTimeline(name);
  input.messages[1].history!.run!.status = name === "mixedRejected" ? "Waiting" : "Running";
  input.messages[1].history!.run!.finishedAtMs = null;
  const tools = toolsFor(input);
  expect(tools).toHaveLength(1);
  expect(tools[0].ended).toBe(false);
  expect(tools[0].batchRevision).toBe(recoveryFixture[name].history.batchRevision);
  expect(JSON.parse(tools[0].result).structured).toEqual(recoveryFixture[name].history.structured);
});

it("older nonterminal history cannot roll back a newer live partial result", () => {
  const input = recoveredBatchTimeline("mixedWaiting");
  input.messages[1].history!.run!.status = "Running";
  input.messages[1].history!.run!.finishedAtMs = null;
  input.events.push(...recoveryEvents("partialCompleted",false).map(event=>({...event,timestamp:1200})));
  const tools = toolsFor(input);
  expect(tools).toHaveLength(1);
  expect(JSON.parse(tools[0].result).structured).toEqual(recoveryFixture.partialCompleted.history.structured);
});

it("late older snapshots cannot roll back a newer snapshot across approval segments", () => {
  const input = mixedApprovalTimeline();
  input.events = input.events.filter(event => event.timestamp! < 4900);
  input.events.push(...recoveryEvents("partialCompleted", false).map(event=>({...event,timestamp:5000})),
    ...recoveryEvents("mixedWaiting", false).map(event=>({...event,timestamp:5100})));
  const tools = toolsFor(input);
  expect(tools).toHaveLength(1);
  expect(JSON.parse(tools[0].result).structured).toEqual(recoveryFixture.partialCompleted.history.structured);
});

it("compares decimal batch revisions without losing integer precision", () => {
  expect(newerBatchRevision("9007199254740993", "9007199254740992")).toBe(true);
  expect(newerBatchRevision("9", "10")).toBe(false);
  expect(newerBatchRevision("10", "10")).toBe(false);
  expect(newerBatchRevision(undefined, "10")).toBe(false);
});
