import { contiguousToolEvents, contiguousToolHistory } from "./tool-group-contiguous-history";
import type { SessionHistory } from "../packages/chat-core/src/history";
import type { ChatAguiStreamEvent } from "../packages/chat-core/src/types";

// One invocation can search multiple entries. Batch items are not separate tools.
const arguments_ = { items: [{ tool: "app_page" }, { tool: "workspace_page" }] };
export const singleToolHistory: SessionHistory = {
  ...contiguousToolHistory,
  records: {
    ...contiguousToolHistory.records,
    messages: contiguousToolHistory.records.messages.filter(message => message.id !== "execute-step"),
    toolInvocations: [{ ...contiguousToolHistory.records.toolInvocations[0]!, arguments: arguments_ }],
  },
};
export const singleToolEvents = contiguousToolEvents
  .filter(event => event.toolCallId !== "execute-provider")
  .map(event => event.type === "TOOL_CALL_START" ? { ...event, toolCallArgs: arguments_ } : event);
export const singleRunningToolEvents = singleToolEvents.filter(event => !["RUN_FINISHED", "TOOL_CALL_RESULT"].includes(event.type));
export const secondToolStart: ChatAguiStreamEvent = {
  ...singleRunningToolEvents[1]!, type: "TOOL_CALL_START", timestamp: 1310,
  toolCallId: "other", toolCallName: "fs_read_text", toolCallArgs: { path: "README.md" },
  metadata: { framework: { runId: "native", sourceSequence: 99 } },
};
