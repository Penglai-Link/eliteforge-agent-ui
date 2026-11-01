import type { SessionHistory } from "../packages/chat-core/src/history";
import type { ChatAguiStreamEvent } from "../packages/chat-core/src/types";

export const phaseToolHistory: SessionHistory = {
  sessionId: "SESSION-1", version: "1", nextCursor: null, pendingInteractions: [], activeRuns: [],
  runs: [{ id: "native", sessionId: "SESSION-1", parentRunId: null, rootRunId: "native", status: "Completed", startedAtMs: 1000, finishedAtMs: 2000, error: null }],
  records: { steps: [], interactions: [], messages: [
    { id: "user", runId: "native", stepId: null, role: "User", content: [{ type: "Text", text: "Inspect" }], structured: null, status: "Completed", createdAtMs: 1000 },
    { id: "progress-1", runId: "native", stepId: "step", role: "Assistant", phase: "commentary", outputIndex: 0, content: [{ type: "Text", text: "Checking tools" }], structured: null, status: "Completed", createdAtMs: 1100 },
    { id: "progress-2", runId: "native", stepId: "step", role: "Assistant", phase: "commentary", outputIndex: 2, content: [{ type: "Text", text: "Preparing answer" }], structured: null, status: "Completed", createdAtMs: 1100 },
    { id: "final", runId: "native", stepId: "step", role: "Assistant", phase: "final_answer", outputIndex: 3, content: [{ type: "Text", text: "Finished" }], structured: null, status: "Completed", createdAtMs: 1100 },
  ], toolInvocations: [{ id: "tool", callId: "call", runId: "native", stepId: "step", messageId: "progress-1",
    toolId: "search", toolName: "tool_search", arguments: {}, content: [], structured: null, status: "Completed",
    isError: false, resultReference: null, startedAtMs: 1200, finishedAtMs: 1300 }] },
};

let sequence = 0;
const event = (type: string, data: Partial<ChatAguiStreamEvent> = {}): ChatAguiStreamEvent => ({
  type, timestamp: 1100, threadId: "SESSION-1", runId: "execution",
  metadata: { framework: { runId: "native", sourceSequence: ++sequence } }, ...data,
});
export const phaseToolEvents = [event("RUN_STARTED"), event("TEXT_MESSAGE_START", { messageId: "progress-1" }),
  event("TEXT_MESSAGE_END", { messageId: "progress-1" }),
  event("TOOL_CALL_START", { toolCallId: "tool", toolCallName: "tool_search", parentMessageId: "progress-1" }),
  event("TOOL_CALL_RESULT", { toolCallId: "tool", content: "ok" }),
  event("TEXT_MESSAGE_START", { messageId: "progress-2" }), event("TEXT_MESSAGE_END", { messageId: "progress-2" }),
  event("TEXT_MESSAGE_START", { messageId: "final" }), event("TEXT_MESSAGE_END", { messageId: "final" }), event("RUN_FINISHED")];
