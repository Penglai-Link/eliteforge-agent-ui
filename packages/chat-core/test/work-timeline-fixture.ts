import { AssistantMessageStream, historyMessages, type ChatAguiStreamEvent, type ChatMessage, type SessionHistory } from "../src";

const start = Date.now();
let seq = 0;
const event = (type: string, data: Partial<ChatAguiStreamEvent> = {}): ChatAguiStreamEvent => ({
  type, runId: "preview-execution", threadId: "timeline", timestamp: start + seq * 10,
  metadata: { framework: { runId: "preview-native", sourceSequence: ++seq } }, ...data,
});
const thought = (id: string, text: string) => [event("REASONING_START", { messageId: `${id}/reasoning` }),
  event("REASONING_MESSAGE_CONTENT", { messageId: `${id}/reasoning`, delta: text }), event("REASONING_END", { messageId: `${id}/reasoning` })];
const text = (id: string, delta: string) => [event("TEXT_MESSAGE_START", { messageId: id, role: "assistant" }), event("TEXT_MESSAGE_CONTENT", { messageId: id, delta })];
export const workTimelineStages = [
  [event("RUN_STARTED"), ...thought("step-1", "先检查目录结构。"), ...text("step-1", "步骤1的输出：目录检查已开始。")],
  [event("TEXT_MESSAGE_END", { messageId: "step-1" }), event("TOOL_CALL_START", { toolCallId: "tool-1", toolCallName: "bash_exec", toolCallArgs: { command: "pwd" }, parentMessageId: "step-1" }),
    event("TOOL_CALL_RESULT", { toolCallId: "tool-1", content: "/workspace/Tron" }),
    ...thought("step-2", "继续检查模块边界。"), ...text("step-2", "步骤2的输出：模块边界已确认。")],
  [event("TEXT_MESSAGE_END", { messageId: "step-2" }), ...thought("final", "资料已经齐全，整理最终回答。"), ...text("final", "最终回答：目录和模块边界检查完成。")],
  [event("TEXT_MESSAGE_END", { messageId: "final" }), event("RUN_FINISHED", { outcome: { type: "success" } })],
];
export const workTimelineUser: ChatMessage = { id: "user", messageId: "user", sessionId: "timeline", role: "USER", actor: "User", channel: "conversation",
  content: "检查项目结构", createdAt: new Date(start - 1).toISOString() };
export function workTimelinePreview(stage: number, restored = false) {
  const events = workTimelineStages.slice(0, stage).flat();
  const stream = new AssistantMessageStream({ sessionId: "timeline", displayName: "main-agent" });
  const messages = new Map<string, ChatMessage>([["user", workTimelineUser]]);
  for (const event of events) { const update = stream.receive(event); if (update) messages.set(update.message.messageId, update.message); }
  if (!restored) return { messages: [...messages.values()], liveAguiEvents: events, liveAguiAnchorMessageCodes: { "preview-execution": "user" }, streamingAssistantMessageCode: stream.activeMessageId, sending: stage < 4 };
  const page: SessionHistory = { sessionId: "timeline", version: "1", nextCursor: null, pendingInteractions: [], activeRuns: [],
    runs: [{ id: "preview-native", sessionId: "timeline", parentRunId: null, rootRunId: "preview-native", status: "Completed", startedAtMs: start, finishedAtMs: start + 1000, error: null }],
    records: { interactions: [], steps: ["step-1", "step-2", "final"].map((id, sequence) => ({ id, runId: "preview-native", sequence, attempt: 1, name: "main-agent", model: null, nodeInvocationId: null, status: "Completed", usage: null,
      startedAtMs: events.find(event => event.messageId === `${id}/reasoning`)!.timestamp!, finishedAtMs: start + 900 })),
    messages: [...messages.values()].map(message => ({ id: message.messageId, runId: "preview-native", stepId: message.role === "USER" ? null : message.messageId,
      role: message.role === "USER" ? "User" : "Assistant", status: "Completed", structured: null, createdAtMs: Date.parse(message.createdAt),
      content: [...events.filter(event => event.type === "REASONING_MESSAGE_CONTENT" && event.messageId === `${message.messageId}/reasoning`).map(event => ({ type: "Reasoning" as const, text: String(event.delta) })), { type: "Text", text: message.content }],
    })), toolInvocations: [{ id: "tool-1", callId: "call-1", runId: "preview-native", stepId: "step-1", messageId: "step-1", toolId: "bash_exec", toolName: "bash_exec", arguments: { command: "pwd" }, status: "Completed", content: [{ type: "Text", text: "/workspace/Tron" }], structured: null, isError: false, resultReference: null,
      startedAtMs: events.find(event => event.type === "TOOL_CALL_START")!.timestamp!, finishedAtMs: events.find(event => event.type === "TOOL_CALL_RESULT")!.timestamp! }] } };
  return { messages: historyMessages(page), liveAguiEvents: [], streamingAssistantMessageCode: null, sending: false };
}
