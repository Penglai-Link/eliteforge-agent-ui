import type { SessionHistory } from "../packages/chat-core/src/history";
import type { ChatAguiStreamEvent } from "../packages/chat-core/src/types";

// Search definitions and then execute: two internal steps, one continuous tool phase.
export const contiguousToolHistory: SessionHistory = {
  sessionId: "SESSION-1", version: "1", nextCursor: null, pendingInteractions: [], activeRuns: [],
  runs: [{ id: "native", sessionId: "SESSION-1", rootRunId: "native", parentRunId: null,
    status: "Completed", startedAtMs: 1000, finishedAtMs: 1600, error: null }],
  records: { steps: [], interactions: [], messages: [
    { id: "user", runId: "native", stepId: null, role: "User", content: [{ type: "Text", text: "List applications" }], structured: null, status: "Completed", createdAtMs: 1000 },
    { id: "search-step", runId: "native", stepId: "search-step", role: "Assistant", content: [{ type: "Reasoning", text: "Search for the definition" }], structured: null, status: "Completed", createdAtMs: 1100 },
    { id: "execute-step", runId: "native", stepId: "execute-step", role: "Assistant", content: [{ type: "Reasoning", text: "Execute the discovered tool" }], structured: null, status: "Completed", createdAtMs: 1300 },
    { id: "final", runId: "native", stepId: "final", role: "Assistant", content: [{ type: "Text", text: "No applications" }], structured: null, status: "Completed", createdAtMs: 1500 },
  ], toolInvocations: [
    { id: "search", callId: "search-provider", runId: "native", stepId: "search-step", messageId: "search-step", toolId: "search", toolName: "tool_search",
      arguments: { items: [{ tool: "app_page" }] }, content: [{ type: "Text", text: "definition" }], structured: null, status: "Completed", isError: false,
      resultReference: null, startedAtMs: 1110, finishedAtMs: 1200 },
    { id: "execute", callId: "execute-provider", runId: "native", stepId: "execute-step", messageId: "execute-step", toolId: "execute", toolName: "tool_execute",
      arguments: { items: [{ tool: "app_page", arguments: { items: [{ current: 1 }] } }] }, content: [{ type: "Text", text: "empty" }], structured: null, status: "Completed", isError: false,
      resultReference: null, startedAtMs: 1310, finishedAtMs: 1400 },
  ] },
};
export const contiguousToolEvents: ChatAguiStreamEvent[] = [
  { type: "RUN_STARTED", timestamp: 1000 },
  { type: "TOOL_CALL_START", timestamp: 1110, toolCallId: "search-provider", toolCallName: "tool_search", toolCallArgs: { items: [{ tool: "app_page" }] } },
  { type: "TOOL_CALL_RESULT", timestamp: 1200, toolCallId: "search-provider", content: "definition" },
  { type: "TOOL_CALL_START", timestamp: 1310, toolCallId: "execute-provider", toolCallName: "tool_execute", toolCallArgs: { items: [{ tool: "app_page", arguments: { items: [{ current: 1 }] } }] } },
  { type: "TOOL_CALL_RESULT", timestamp: 1400, toolCallId: "execute-provider", content: "empty" },
  { type: "RUN_FINISHED", timestamp: 1600 },
].map((event, index) => ({ ...event, runId: "execution", threadId: "SESSION-1", metadata: { framework: { runId: "native", sourceSequence: index + 1 } } }));
