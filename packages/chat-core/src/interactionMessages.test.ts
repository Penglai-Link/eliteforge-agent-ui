import { expect, it } from "vitest";
import { interactionMessages } from "./interactionMessages";
import { currentAguiTerminalEvent, aguiWorkElapsedMilliseconds } from "./aguiWork";
import { historyWorkGroups, historyCoversAguiWork } from "./historyWork";
import { aguiWorkRailsByMessageCode } from "./transcript";
import type { ChatMessage, ChatUserInputRequest, ChatAguiStreamEvent } from "./types";

const question: ChatMessage = { id: "ask", messageId: "ask", sessionId: "s", runId: "r", role: "ASSISTANT", channel: "chat", actor: "Assistant", content: "Choose", createdAt: new Date(100).toISOString() };
const request: ChatUserInputRequest = { requestId: "q", sessionId: "s", runId: "r", assistantMessageId: "ask", intro: "Choose", requestedAt: 100, answeredAt: 200, status: "Answered", questions: [{ questionId: "color", question: "Color?", options: [{ optionId: "blue", label: "Blue" }] }], answers: [{ questionId: "color", answerKind: "Option", optionId: "blue" }] };
it("keeps accepted responses between the question and continuation, once across refreshes", () => {
  const final = { ...question, id: "final", messageId: "final", content: "Done", createdAt: new Date(300).toISOString() };
  const messages = interactionMessages([question, final], [request]);
  expect(messages.map(message => message.messageId)).toEqual(["ask", "interaction:q", "final"]);
  expect(messages[1].role).toBe("USER");
  expect(messages[1].interactionResponse?.rows).toEqual([{ label: "Color?", value: "Blue" }]);
  expect(interactionMessages(messages, [request])).toEqual(messages);
  expect(interactionMessages([question], [{ ...request, status: "Pending" }])).toEqual([question]);
});
it("uses an existing legacy response instead of duplicating it", () => {
  const legacy = { ...question, id: "answer", messageId: "answer", role: "USER" as const, content: "The user answered the questions you asked: Blue" };
  const messages = interactionMessages([question, legacy], [request]);
  expect(messages).toHaveLength(2);
  expect(messages[1].interactionResponse?.requestId).toBe("q");
});
it("anchors resumed work after the accepted user response", () => {
  const messages = interactionMessages([question], [request]);
  const rails = aguiWorkRailsByMessageCode(messages, [{ type: "RUN_STARTED", runId: "r", timestamp: 201 }], { r: "interaction:q" }, 5);
  expect([...rails.keys()]).toEqual(["interaction:q"]);
});
it("does not retain the interrupt outcome during resumed execution or count late events as work", () => {
  const events: ChatAguiStreamEvent[] = [{ type: "RUN_STARTED", timestamp: 100 }, { type: "RUN_FINISHED", timestamp: 200, outcome: { type: "interrupt", interrupts: [] } }, { type: "RUN_STARTED", timestamp: 500 }];
  expect(currentAguiTerminalEvent(events)).toBeNull();
  expect(aguiWorkElapsedMilliseconds(events, 700)).toBe(200);
  const finished = [...events, { type: "RUN_FINISHED", timestamp: 800 }, { type: "CUSTOM", timestamp: 900 }];
  expect(currentAguiTerminalEvent(finished)?.timestamp).toBe(800);
  expect(aguiWorkElapsedMilliseconds(finished, 1000)).toBe(300);
});
it("splits historical work at user answers, preserving their visible order", () => {
  const work = { ...question, history: { message: { content: [{ type: "Reasoning", text: "Thought" }] }, tools: [] } } as unknown as ChatMessage;
  const final = { ...work, id: "final", messageId: "final" };
  const groups = historyWorkGroups(interactionMessages([work, final], [request]));
  expect([...groups.keys()]).toEqual(["ask", "final"]);
});

it("uses completed native history instead of duplicate live work without hiding a new segment", () => {
  const message = { ...question, history: { run: { id: "native", status: "Completed", finishedAtMs: 200 } } } as ChatMessage;
  const events: ChatAguiStreamEvent[] = [{ type: "RUN_STARTED", runId: "alias", timestamp: 100, metadata: { framework: { runId: "native" } } }];
  expect(historyCoversAguiWork([message], events)).toBe(true);
  expect(historyCoversAguiWork([message], [...events, { ...events[0], timestamp: 300 }])).toBe(false);
});
