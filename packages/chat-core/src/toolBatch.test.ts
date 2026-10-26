import { expect, it } from "vitest";
import { batchFixture, vendoredBatchFixture } from "../../../contracts/tool-batch";
import { parseToolBatchResult, parseToolApprovalDetails } from "./toolBatch";
import { toolResultPreview } from "./toolResults";
import { historyToolResult, historyUserInputRequests, type HistoryToolInvocation, type SessionHistory } from "./history";
import { nativeUserInputRequests, nativeUserInputAnswer } from "./nativeInteractions";
import { presentToolCall } from "./toolPresentation";
import { outcomeFixture, vendoredOutcomeFixture } from "../../../contracts/batch-outcomes";
import { recoveryFixture, vendoredRecoveryFixture, recoveryEvents } from "../../../contracts/batch-recovery";
import { buildAguiUserWorkCards, aguiWorkRailsByMessageCode } from "./transcript";
import { parseToolBatchSnapshot } from "./toolBatch";

it.each(Object.entries(recoveryFixture))("keeps model/live/history recovery outcomes consistent: %s", (name, outcome) => {
  expect(recoveryFixture).toEqual(vendoredRecoveryFixture);
  const cards = buildAguiUserWorkCards(recoveryEvents(name));
  expect(cards).toHaveLength(1);
  if (cards[0].kind !== "toolGroup") throw new Error("expected parent tool card");
  expect(cards[0].value.toolCards[0].ended).toBe(!outcome.snapshot);
  expect(toolResultPreview(cards[0].value.toolCards[0].result)).toEqual(toolResultPreview(historyToolResult(outcome.history as unknown as HistoryToolInvocation)));
  if (outcome.model) expect(outcome.model).toEqual(JSON.parse(outcome.live.content[0].text));
  if (outcome.snapshot) {
    expect(parseToolBatchSnapshot(outcome.snapshot)?.output.structured).toEqual(outcome.history.structured);
    expect(parseToolBatchSnapshot({...outcome.snapshot, toolCallId:"unrelated-parent"})).toBeNull();
  }
});

it("updates one parent across approval executions and ignores stale pause snapshots after completion", () => {
  const waiting = recoveryEvents("mixedWaiting");
  const rejected = recoveryEvents("mixedRejected", false);
  const completed = recoveryEvents("mixedCompleted", false);
  const events = [...waiting, ...rejected, ...completed, ...rejected];
  const rails = aguiWorkRailsByMessageCode([{messageId:"user",role:"USER"} as any], events, {}, 20);
  expect(rails.get("user")).toHaveLength(1);
  const cards = buildAguiUserWorkCards(events);
  expect(cards).toHaveLength(1);
  if (cards[0].kind !== "toolGroup") throw new Error("expected parent tool card");
  expect(cards[0].value.toolCards[0].ended).toBe(true);
  expect(JSON.parse(cards[0].value.toolCards[0].result).structured).toEqual(recoveryFixture.mixedCompleted.history.structured);
  const reconnected = buildAguiUserWorkCards(rejected);
  expect(reconnected).toHaveLength(1);
  if (reconnected[0].kind !== "toolGroup") throw new Error("expected reconnect card");
  expect(reconnected[0].value.toolCards[0].ended).toBe(false);
});

it.each(Object.entries(outcomeFixture))("keeps actual runtime live/history outcomes identical: %s", (name, outcome) => {
  expect(outcomeFixture).toEqual(vendoredOutcomeFixture);
  const live = toolResultPreview(JSON.stringify(outcome.live));
  const history = toolResultPreview(historyToolResult(outcome.history as unknown as HistoryToolInvocation));
  expect(history).toEqual(live);
  const expected = name === "parallelCancellation" ? ["Unknown", "Completed", "NotExecuted"] : ["Failed", "Failed", "Failed"];
  expect(live.items!.map(item => item.item.status)).toEqual(expected);
  for (const item of live.items!) {
    expect(item.item.parentInvocationId).toBe(outcome.history.id);
    expect(item.item.parentCallId).toBe(outcome.history.callId);
  }
  if (name === "parallelCancellation") {
    expect(toolResultPreview(live.items![1].value).texts).toContain("confirmed success");
  } else {
    expect(live.items!.every(item => toolResultPreview(item.value).texts.some(text => text.includes("authoriz")))).toBe(true);
    expect(JSON.stringify(history)).not.toContain("claimed success");
  }
});

it("consumes the framework-generated wire fixture without contract drift", () => {
  expect(batchFixture).toEqual(vendoredBatchFixture);
  const batch = parseToolBatchResult(batchFixture.complete.structured)!;
  expect(batch.results.map(r => r.status)).toEqual(["Completed", "Failed"]);
  const preview = toolResultPreview(JSON.stringify(batchFixture.complete));
  const first = toolResultPreview(preview.items![0].value);
  expect(first.texts).toContain("Generated image and source evidence");
  expect(first.images.map(i => i.url)).toEqual(["data:image/png;base64,YWJj", "https://example.com/image.png"]);
  expect(first.links.map(l => l.url)).toEqual(["https://example.com/download", "https://example.com/source"]);
  expect(JSON.parse(preview.items![0].value).content).toEqual(batch.results[0].content);
  expect(toolResultPreview(preview.items![1].value).texts).toContain("read failed: permission denied");
});
it("projects interrupted live and persisted batches identically", () => {
  const live = toolResultPreview(JSON.stringify(batchFixture.interrupted));
  const history = toolResultPreview(historyToolResult({ ...batchFixture.interrupted, content: [] } as HistoryToolInvocation));
  expect(history).toEqual(live);
  expect(live.items!.map(i => i.item.status)).toEqual(["Completed", "Unknown", "NotExecuted"]);
  expect(toolResultPreview(live.items![0].value).images).toHaveLength(2);
});
it("retains child approval details across live events, history and resume", () => {
  const details = parseToolApprovalDetails(batchFixture.approval)!;
  const interaction = { id: "approval-child", runId: "run", invocationId: details.batch!.invocationId, presentation: batchFixture.approval, responseSchema: { type: "boolean" }, prompt: [], expiresAtMs: null };
  const live = nativeUserInputRequests([{ type: "RUN_FINISHED", threadId: "s", runId: "run", outcome: { type: "interrupt", interrupts: [{ id: interaction.id, toolCallId: details.batch!.parentInvocationId, reason: "approval_required", responseSchema: interaction.responseSchema, metadata: { interaction } }] } }] as any, "s")[0];
  const history = historyUserInputRequests({ sessionId: "s", runs: [], pendingInteractions: [interaction], records: { toolInvocations: [] } } as unknown as SessionHistory)[0];
  expect(live.nativeInteraction?.details).toEqual(details);
  expect(history.nativeInteraction?.details).toEqual(details);
  expect(nativeUserInputAnswer(live, [{ questionId: interaction.id, answerKind: "Option", optionId: "NATIVE-0" }])).toEqual({ answers: [], resume: [{ interruptId: interaction.id, status: "resolved", payload: true }] });
});
it("rejects ambiguous batch identities and keeps ordinary search results separate", () => {
  const batch = batchFixture.complete.structured;
  expect(parseToolBatchResult({ results: batch.results })).toBeNull();
  expect(parseToolBatchResult({ ...batch, results: [batch.results[0], batch.results[0]] })).toBeNull();
  expect(parseToolBatchResult({ ...batch, results: [batch.results[0], { ...batch.results[0], index: 1 }] })).toBeNull();
  expect(parseToolBatchResult({ ...batch, results: [batch.results[0], { ...batch.results[1], parentCallId: "other" }] })).toBeNull();
  expect(toolResultPreview(JSON.stringify({results:[{url:"https://example.com",title:"Search hit"}]})).links).toHaveLength(1);
});
it("keeps singleton batch targets visible", () => {
  expect(presentToolCall("tool_execute", { tool: "fs_read_text", arguments: { items: [{ path: "a.txt" }] } }, { locale: "en-US" }).title).toBe("Read file a.txt");
});
