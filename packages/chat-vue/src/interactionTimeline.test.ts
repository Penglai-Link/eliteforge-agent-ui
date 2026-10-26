// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue";
import { expect, it } from "vitest";
import HistoryWorkRail from "./components/HistoryWorkRail.vue";
import AguiRunWorkRail from "./components/AguiRunWorkRail.vue";
import { buildTranscriptWorkTimeline } from "@eliteforge/agent-ui-chat-core";
import { buildTranscriptPresentation, historyMessages } from "@eliteforge/agent-ui-chat-core";
import { contiguousToolHistory, contiguousToolEvents } from "../../../contracts/tool-group-contiguous-history";
import type { ChatMessage, ChatAguiStreamEvent, TranscriptWorkRun } from "@eliteforge/agent-ui-chat-core";

it.each([false, true])("keeps search and execution under one collapsed history summary (replay=%s)", async replay => {
  const messages = historyMessages(contiguousToolHistory);
  const events = replay ? contiguousToolEvents : [];
  const view = buildTranscriptPresentation({ messages, liveAguiEvents: events, sessionId: "SESSION-1" });
  const timeline = [...buildTranscriptWorkTimeline(messages, view, [], { showReasoningCards: false }).before.values()].flat()[0];
  const container = document.createElement("div");
  const app = createApp({ render: () => h(AguiRunWorkRail, { events, timeline }) });
  try {
    app.mount(container);
    container.querySelector<HTMLButtonElement>(".ef-chat__rail-summary")!.click(); await nextTick();
    const groups = container.querySelectorAll<HTMLButtonElement>('[aria-label="Tool run steps"] > .ef-chat__rail-entry-toggle');
    expect(groups).toHaveLength(1);
    expect(groups[0].textContent?.trim()).toBe("Searched 1 time · Performed 1 other action");
    expect(groups[0].getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelectorAll(".ef-chat__tool-row")).toHaveLength(0);
    groups[0].click(); await nextTick();
    expect(container.querySelectorAll(".ef-chat__tool-row")).toHaveLength(2);
  } finally { app.unmount(); }
});

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
  const events = ref<ChatAguiStreamEvent[]>([
    { type: "RUN_STARTED", runId: "r", timestamp: 100 },
    { type: "TOOL_CALL_START", runId: "r", timestamp: 110, toolCallId: "call", toolCallName: "tool_search", toolCallArgs: {} },
    { type: "TOOL_CALL_RESULT", runId: "r", timestamp: 120, toolCallId: "call", content: "ok" },
    { type: "RUN_FINISHED", runId: "r", timestamp: 200 },
  ]);
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
  const detail = (id: string): TranscriptWorkRun["items"][number] => ({
    kind: "reasoning", id, value: { id, runId: "run", content: "", summary: "Thinking", ended: true,
      firstMillis: 100, endMillis: 200, toolCards: [] },
  });
  const previousSegment: TranscriptWorkRun = {
    id: "user-start:run",
    runId: "run",
    events: [{ type: "RUN_STARTED", runId: "run", timestamp: 100 }],
    messages: [],
    items: [detail("previous")],
    completed: true,
    segmentFinishedAtMs: 500,
  };
  const currentSegment: TranscriptWorkRun = {
    id: "user-steer:run",
    runId: "run",
    events: [{ type: "CLIENT_WORK_SEGMENT_START", runId: "run", timestamp: 500 }],
    messages: [],
    items: [detail("current")],
    completed: false,
    segmentStartedAtMs: 500,
  };
  const container = document.createElement("div");
  const app = createApp({ render: () => h("div", [
    h(AguiRunWorkRail, { events: previousSegment.events, timeline: previousSegment, showReasoningCards: true }),
    h(AguiRunWorkRail, { events: currentSegment.events, timeline: currentSegment, showReasoningCards: true }),
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


import { executingTools, finishedTools, nextThought, nextTools, completedTools } from "../../../contracts/tool-group-phases";
it.each([true, false])("expands current tools and folds by phase and completion (reasoning=%s)", async showReasoningCards => {
  const events=ref(executingTools);
  const container=document.createElement("div");
  const timeline=()=> {
    const user={id:"user",messageId:"user",sessionId:"SESSION-1",role:"USER",actor:"User",channel:"conversation",content:"Inspect files",createdAt:new Date(900).toISOString()} as ChatMessage;
    const value=buildTranscriptWorkTimeline([user],{waitingForModelAnchorMessageCode:"",debugEventsByRunCode:new Map(),
      workRailsByMessageCode:new Map([["user",[{runId:"RUN-1",firstMillis:1000,events:events.value}]]])}, [], { showReasoningCards });
    return [...value.before.values(),...value.after.values()].flat()[0];
  };
  const app=createApp({render:()=>h(AguiRunWorkRail,{events:events.value,showReasoningCards,timeline:timeline()})});
  try {
    app.mount(container);
    const groups=()=>Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-label="Tool run steps"] > .ef-chat__rail-entry-toggle'));
    const states=()=>groups().map(button=>button.getAttribute("aria-expanded"));
    expect(states()).toEqual(["true"]);
    events.value=finishedTools; await nextTick(); expect(states()).toEqual(["true"]);
    groups()[0].click(); await nextTick();
    events.value=[...finishedTools]; await nextTick(); expect(states()).toEqual(["false"]);
    groups()[0].click(); await nextTick();
    events.value=nextThought; await nextTick(); expect(states()).toEqual(["false"]);
    events.value=nextTools; await nextTick(); expect(states()).toEqual(showReasoningCards ? ["false","true"] : ["true"]);
    events.value=completedTools; await nextTick();
    const overall=container.querySelector<HTMLButtonElement>(".ef-chat__rail-summary")!;
    expect(overall.getAttribute("aria-expanded")).toBe("false"); expect(groups()).toHaveLength(0);
    overall.click(); await nextTick(); expect(states()).toEqual(showReasoningCards ? ["false","false"] : ["false"]);
    groups()[0].click(); await nextTick();expect(container.querySelectorAll(".ef-chat__tool-row")).toHaveLength(showReasoningCards ? 2 : 4);
  } finally {app.unmount();}
});
