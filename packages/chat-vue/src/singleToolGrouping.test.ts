// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from "vue";
import { expect, it } from "vitest";
import { buildTranscriptPresentation, buildTranscriptWorkTimeline, historyMessages } from "@eliteforge/agent-ui-chat-core";
import AguiRunWorkRail from "./components/AguiRunWorkRail.vue";
import { subagentEvents, subagentRunningEvents, subagentHistory } from "../../../contracts/subagent-dispatch-title";
import { secondToolStart, singleRunningToolEvents, singleToolEvents, singleToolHistory } from "../../../contracts/single-tool-history";

it.each(["running", "completed", "history", "replay"] as const)("renders one tool directly without a group summary (%s)", async mode => {
  const events = mode === "history" ? [] : mode === "running" ? singleRunningToolEvents : singleToolEvents;
  const messages = historyMessages(singleToolHistory);
  const presentation = buildTranscriptPresentation({messages, liveAguiEvents: events, sessionId:"SESSION-1"});
  const timeline = mode === "history" || mode === "replay"
    ? [...buildTranscriptWorkTimeline(messages, presentation, [], {showReasoningCards:false}).before.values()].flat()[0] : undefined;
  const container = document.createElement("div");
  const app = createApp({render: () => h(AguiRunWorkRail, {events, timeline, showReasoningCards:false})});
  try {
    app.mount(container);
    const overall = container.querySelector<HTMLButtonElement>(".ef-chat__rail-summary")!;
    if (mode !== "running") {
      expect(overall.getAttribute("aria-expanded")).toBe("false");
      expect(container.querySelector(".ef-chat__tool-row")).toBeNull();
      overall.click(); await nextTick();
    }
    expect(container.querySelector('[aria-label="Tool run steps"]')).toBeNull();
    expect(container.querySelector(".ef-chat__rail-entry-toggle")).toBeNull();
    expect(container.querySelectorAll(".ef-chat__tool-row--standalone")).toHaveLength(1);
    expect(container.querySelector(".ef-chat__tool-title")?.textContent).toContain("Search tools");
    const tool = container.querySelector<HTMLButtonElement>(".ef-chat__tool-toggle")!;
    tool.click(); await nextTick();
    expect(tool.getAttribute("aria-expanded")).toBe("true");
    if (mode !== "running") expect(container.textContent).toContain("definition");
  } finally {app.unmount();}
});

it("adds a group only when a second tool starts", async () => {
  const events = ref(singleRunningToolEvents);
  const container = document.createElement("div");
  const app = createApp({render: () => h(AguiRunWorkRail, {events:events.value, showReasoningCards:false})});
  try {
    app.mount(container);
    expect(container.querySelector(".ef-chat__rail-entry-toggle")).toBeNull();
    expect(container.querySelectorAll(".ef-chat__tool-row--standalone")).toHaveLength(1);
    events.value = [...events.value, secondToolStart]; await nextTick();
    expect(container.querySelector(".ef-chat__rail-entry-toggle")?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelectorAll(".ef-chat__tool-row")).toHaveLength(2);
    expect(container.querySelector(".ef-chat__tool-row--standalone")).toBeNull();
  } finally {app.unmount();}
});


it.each(["running", "completed", "history", "replay"] as const)("shows the delegated agent in the collapsed tool title (%s)", async mode => {
  const events = mode === "history" ? [] : mode === "running" ? subagentRunningEvents : subagentEvents;
  const messages = historyMessages(subagentHistory);
  const presentation = buildTranscriptPresentation({messages, liveAguiEvents:events, sessionId:"SESSION-1"});
  const timeline = mode === "history" || mode === "replay"
    ? [...buildTranscriptWorkTimeline(messages, presentation, [], {showReasoningCards:false}).before.values()].flat()[0] : undefined;
  const container = document.createElement("div");
  const app = createApp({render: () => h(AguiRunWorkRail, {events, timeline, locale:"zh-CN", showReasoningCards:false})});
  try {
    app.mount(container);
    const overall = container.querySelector<HTMLButtonElement>(".ef-chat__rail-summary")!;
    if (overall.getAttribute("aria-expanded") === "false") { overall.click(); await nextTick(); }
    const tool = container.querySelector<HTMLButtonElement>(".ef-chat__tool-toggle")!;
    expect(tool.getAttribute("aria-expanded")).toBe("false");
    expect(tool.textContent).toContain("分派子代理 fast-coding-luna");
  } finally { app.unmount(); }
});
