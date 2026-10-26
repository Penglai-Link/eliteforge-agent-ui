import { pendingBatchApprovalHistory } from "../../../contracts/batch-recovery";
import { historyUserInputRequests } from "./history";
import { describe, expect, it } from "vitest";
import { activeNativeUserInputRequests, nativeUserInputAnswer, nativeUserInputRequests } from "./nativeInteractions";
import type { ChatAguiStreamEvent } from "./types";
const pause: ChatAguiStreamEvent = { type: "RUN_FINISHED", threadId: "SESSION", runId: "PRODUCT", timestamp: 10, outcome: { type: "interrupt", interrupts: [{ id: "SDK-INTERACTION", reason: "approval_required", message: "Allow the operation?", responseSchema: { type: "boolean" } }] } };
describe("native interrupt presentation", () => {
  it.each([true, false])("returns raw approval %s with the original SDK interaction id", (value) => {
    const request = nativeUserInputRequests([pause], "SESSION")[0];
    expect(request.requestId).toBe("SDK-INTERACTION");
    const option = Object.entries(request.nativeInteraction!.optionPayloads).find(([, payload]) => payload === value)!;
    expect(nativeUserInputAnswer(request, [{ questionId: request.requestId, answerKind: "Option", optionId: option[0] }])).toEqual({ answers: [], resume: [{ interruptId: "SDK-INTERACTION", status: "resolved", payload: value }] });
  });
  it("stops showing a resolved pause after a native continuation starts", () => {
    expect(nativeUserInputRequests([pause, { type: "RUN_STARTED", threadId: "SESSION", runId: "NEXT" }], "SESSION")).toEqual([]);
  });
  it.each([
    { type: "RUN_ERROR", code: "AGUI_STREAM_OVERFLOW" },
    { type: "RUN_ERROR", code: "CHAT_STREAM_COMPLETION_UNAVAILABLE", productCompletionError: { code: "CHAT_STREAM_COMPLETION_UNAVAILABLE" }, presentationIncomplete: true },
  ] as ChatAguiStreamEvent[])("preserves native input after a presentation failure: $code", (failure) => {
    const requests = nativeUserInputRequests([pause, { ...failure, threadId: "SESSION", runId: "PRODUCT", timestamp: 11 }], "SESSION");
    expect(requests).toEqual(nativeUserInputRequests([pause], "SESSION"));
    expect(nativeUserInputAnswer(requests[0], [{ questionId: "SDK-INTERACTION", answerKind: "Option", optionId: "NATIVE-0" }]).resume).toEqual([{ interruptId: "SDK-INTERACTION", status: "resolved", payload: true }]);
  });
  it.each([
    { type: "RUN_ERROR", code: "MODEL_PROVIDER_FAILED" },
    { type: "RUN_ERROR", code: "MODEL_PROVIDER_FAILED", productCompletionError: { code: "CHAT_STREAM_COMPLETION_UNAVAILABLE" }, presentationIncomplete: true },
    { type: "RUN_STARTED", runId: "NEXT" },
  ] as ChatAguiStreamEvent[])("clears old input after real execution lifecycle: $type $code", (event) => {
    const presentationFailure: ChatAguiStreamEvent = { type: "RUN_ERROR", code: "AGUI_STREAM_OVERFLOW", threadId: "SESSION", runId: "PRODUCT", timestamp: 11 };
    expect(nativeUserInputRequests([pause, presentationFailure, { threadId: "SESSION", runId: "PRODUCT", ...event, timestamp: 12 }], "SESSION")).toEqual([]);
  });
  it("keeps a generic object answer intact and rejects malformed JSON locally", () => {
    const event: ChatAguiStreamEvent = { ...pause, outcome: { type: "interrupt", interrupts: [{ id: "INPUT", reason: "input_required", message: "Provide the inputs", responseSchema: { type: "object" } }] } };
    const request = nativeUserInputRequests([event], "SESSION")[0];
    const answer = { questionId: "INPUT", answerKind: "Other" as const, otherText: '{"answers":[true],"count":2}' };
    expect(nativeUserInputAnswer(request, [answer]).resume![0].payload).toEqual({ answers: [true], count: 2 });
    expect(() => nativeUserInputAnswer(request, [{ ...answer, otherText: "{" }])).toThrow("valid JSON");
  });
  it("leaves the legacy product question projection with its existing handler", () => {
    expect(nativeUserInputRequests([{ ...pause, outcome: { type: "interrupt", interrupts: [{ id: "LEGACY", reason: "input_required", metadata: { questions: [] } }] } }], "SESSION")).toEqual([]);
  });
});

it("terminal evidence removes stale approval history without clearing siblings on node or presentation errors", () => {
  const history = pendingBatchApprovalHistory();
  const pending = historyUserInputRequests(history);
  const error:ChatAguiStreamEvent = {type:"RUN_ERROR",code:"AGENT_RUN_FAILED",runId:"resume",threadId:"session",metadata:{framework:{runId:"logical-batch-run"}}};
  expect(activeNativeUserInputRequests(pending, [error], "session", history)).toEqual([]);
  expect(activeNativeUserInputRequests(pending, [{...error,code:"AGUI_STREAM_OVERFLOW"}], "session", history)).toHaveLength(2);
  expect(activeNativeUserInputRequests(pending, [{...error,metadata:{framework:{runId:"logical-batch-run",node:{invocationId:"node"}}}}], "session", history)).toHaveLength(2);
  history.records.interactions[0].response = false;
  expect(activeNativeUserInputRequests(pending, [], "session", history)).toHaveLength(1);
  history.runs[0].status = "Failed";
  expect(activeNativeUserInputRequests(pending, [], "session", history)).toEqual([]);
});
