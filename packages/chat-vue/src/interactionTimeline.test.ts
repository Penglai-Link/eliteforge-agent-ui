// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue";
import { expect, it } from "vitest";
import HistoryWorkRail from "./components/HistoryWorkRail.vue";
import AguiRunWorkRail from "./components/AguiRunWorkRail.vue";
import type { ChatMessage, ChatAguiStreamEvent, TranscriptWorkRun } from "@eliteforge/agent-ui-chat-core";

it("collapses history work on completion and allows reopening it", async () => {
  const message = { id: "a", messageId: "a", runId: "r", role: "ASSISTANT", history: {
    message: { content: [{ type: "Reasoning", text: "Thought" }], status: "Running", createdAtMs: 100 },
    tools: [], interactions: [], run: { status: "Running", startedAtMs: 100, finishedAtMs: null },
  } } as unknown as ChatMessage;
  const messages = ref([message]);
  const container = document.createElement("div");
  const app = createApp({ render: () => h(HistoryWorkRail, { messages: messages.value }) });
  try {
    app.mount(container);
    (container.querySelector("button") as HTMLButtonElement).click(); await nextTick();
    expect(container.querySelector("button")?.getAttribute("aria-expanded")).toBe("true");
    messages.value = [{ ...message, history: { ...message.history!, run: { ...message.history!.run!, status: "Completed", finishedAtMs: 200 } } }];
    await nextTick();
    expect(container.querySelector("button")?.getAttribute("aria-expanded")).toBe("false");
    (container.querySelector("button") as HTMLButtonElement).click(); await nextTick();
    expect(container.querySelector("button")?.getAttribute("aria-expanded")).toBe("true");
  } finally { app.unmount(); }
});

it("shows resumed execution as working instead of retaining the interrupt completion", async () => {
  const events = ref<ChatAguiStreamEvent[]>([{ type: "RUN_STARTED", runId: "r", timestamp: 100 }, { type: "RUN_FINISHED", runId: "r", timestamp: 200 }]);
  const container = document.createElement("div");
  const app = createApp({ render: () => h(AguiRunWorkRail, { events: events.value }) });
  try {
    app.mount(container);
    expect(container.textContent).toContain("Worked for");
    events.value.push({ type: "RUN_STARTED", runId: "r", timestamp: 300 }); await nextTick();
    expect(container.textContent).toContain("Working for");
    expect(container.textContent).not.toContain("Worked for");
    expect(container.querySelector("button")?.getAttribute("aria-expanded")).toBe("true");
    events.value.push({ type: "RUN_FINISHED", runId: "r", timestamp: 400 }); await nextTick();
    expect(container.querySelector("button")?.getAttribute("aria-expanded")).toBe("false");
  } finally { app.unmount(); }
});

it("shows a frozen completed segment and a new live segment after steer", async () => {
  const previousSegment: TranscriptWorkRun = {
    id: "user-start:run",
    runId: "run",
    events: [{ type: "RUN_STARTED", runId: "run", timestamp: 100 }],
    messages: [],
    items: [],
    completed: true,
    segmentFinishedAtMs: 500,
  };
  const currentSegment: TranscriptWorkRun = {
    id: "user-steer:run",
    runId: "run",
    events: [{ type: "CLIENT_WORK_SEGMENT_START", runId: "run", timestamp: 500 }],
    messages: [],
    items: [],
    completed: false,
    segmentStartedAtMs: 500,
  };
  const container = document.createElement("div");
  const app = createApp({ render: () => h("div", [
    h(AguiRunWorkRail, { events: previousSegment.events, timeline: previousSegment }),
    h(AguiRunWorkRail, { events: currentSegment.events, timeline: currentSegment }),
  ]) });
  try {
    app.mount(container);
    expect(container.textContent).toContain("Worked for");
    expect(container.textContent).toContain("Working for");
    expect(container.querySelectorAll(".ef-chat__rail-summary")).toHaveLength(2);
    expect(container.querySelectorAll('.ef-chat__rail-summary[aria-expanded="false"]')).toHaveLength(1);
    expect(container.querySelectorAll('.ef-chat__rail-summary[aria-expanded="true"]')).toHaveLength(1);
  } finally { app.unmount(); }
});

it("keeps the total duration above a localized action summary", async () => {
  const events: ChatAguiStreamEvent[] = [
    { type: "RUN_STARTED", runId: "r", timestamp: 100 },
    { type: "REASONING_START", runId: "r", timestamp: 101, messageId: "thought" },
    { type: "REASONING_MESSAGE_CONTENT", runId: "r", timestamp: 102, messageId: "thought", delta: "Update the project" },
    { type: "REASONING_END", runId: "r", timestamp: 103, messageId: "thought" },
    { type: "TOOL_CALL_START", runId: "r", timestamp: 104, toolCallId: "command", toolCallName: "bash_exec", toolCallArgs: { command: "pwd" } },
    { type: "TOOL_CALL_RESULT", runId: "r", timestamp: 105, toolCallId: "command", content: "/project" },
    { type: "TOOL_CALL_START", runId: "r", timestamp: 106, toolCallId: "write", toolCallName: "fs_write_text", toolCallArgs: { path: "src/app.ts", content: "updated" } },
    { type: "TOOL_CALL_RESULT", runId: "r", timestamp: 107, toolCallId: "write", content: "ok" },
    { type: "RUN_FINISHED", runId: "r", timestamp: 108 },
  ];
  const labels = {
    ariaLabel: "Agent work", preparing: "Preparing", responding: "Responding", thinking: "Thinking",
    workedFor: (duration: string) => `Worked for ${duration}`, workingFor: (duration: string) => `Working for ${duration}`,
    tool: { groupSummary: (summary: { commands: number; editedFiles: number }) => `Executed ${summary.commands} command, edited ${summary.editedFiles} file` },
  };
  const container = document.createElement("div");
  const app = createApp({ render: () => h(AguiRunWorkRail, { events, labels }) });
  try {
    app.mount(container);
    const overall = container.querySelector<HTMLButtonElement>(".ef-chat__rail-summary")!;
    expect(overall.textContent).toContain("Worked for");
    overall.click(); await nextTick();
    expect(container.textContent).toContain("Executed 1 command, edited 1 file");
  } finally { app.unmount(); }
});
