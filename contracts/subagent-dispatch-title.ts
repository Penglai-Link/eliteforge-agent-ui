import { singleToolEvents, singleToolHistory } from "./single-tool-history";
import type { SessionHistory } from "../packages/chat-core/src/history";

// The runtime sends the same agentCode through live events and persisted history.
export const subagentArgs = { items: [{ agentCode: "fast-coding-luna", task: "Only reply OK" }] };
export const subagentEvents = singleToolEvents.map(event => event.type === "TOOL_CALL_START"
  ? { ...event, toolCallName: "agent_spawn", toolCallArgs: subagentArgs } : event);
export const subagentRunningEvents = subagentEvents.filter(event => !["RUN_FINISHED", "TOOL_CALL_RESULT"].includes(event.type));
export const subagentHistory: SessionHistory = {
  ...singleToolHistory,
  records: {
    ...singleToolHistory.records,
    toolInvocations: singleToolHistory.records.toolInvocations.map(tool => ({
      ...tool, toolName: "agent_spawn", arguments: subagentArgs,
    })),
  },
};
