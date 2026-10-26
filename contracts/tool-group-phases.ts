import type { TranscriptAguiEvent } from "../packages/chat-core/src/transcript";

// Equal timestamps exercise event ordering, including hidden/empty reasoning.
const base = { runId: "RUN-1", threadId: "SESSION-1", timestamp: 1000 };
export const executingTools: TranscriptAguiEvent[] = [
  { ...base, type: "RUN_STARTED" },
  { ...base, type: "REASONING_START", messageId: "thought-1" },
  { ...base, type: "REASONING_END", messageId: "thought-1" },
  { ...base, type: "TOOL_CALL_START", toolCallId: "a", toolCallName: "fs_read_text", toolCallArgs: { path: "one.ts" } },
  { ...base, type: "TOOL_CALL_START", toolCallId: "b", toolCallName: "fs_read_text", toolCallArgs: { path: "two.ts" } },
];
export const finishedTools: TranscriptAguiEvent[] = [...executingTools,
  { ...base, type: "TOOL_CALL_RESULT", toolCallId: "a", content: "one" },
  { ...base, type: "TOOL_CALL_RESULT", toolCallId: "b", content: "two" },
];
export const nextThought: TranscriptAguiEvent[] = [...finishedTools,
  { ...base, type: "REASONING_START", messageId: "thought-2" },
];
export const nextTools: TranscriptAguiEvent[] = [...nextThought,
  { ...base, type: "REASONING_END", messageId: "thought-2" },
  { ...base, type: "TOOL_CALL_START", toolCallId: "c", toolCallName: "fs_read_text", toolCallArgs: { path: "three.ts" } },
  { ...base, type: "TOOL_CALL_START", toolCallId: "d", toolCallName: "fs_read_text", toolCallArgs: { path: "four.ts" } },
];
export const completedTools: TranscriptAguiEvent[] = [...nextTools,
  { ...base, type: "TOOL_CALL_RESULT", toolCallId: "c", content: "three" },
  { ...base, type: "TOOL_CALL_RESULT", toolCallId: "d", content: "four" },
  { ...base, type: "RUN_FINISHED" },
];
