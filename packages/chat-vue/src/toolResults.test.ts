// @vitest-environment jsdom
import { createApp, h, nextTick } from "vue";
import { expect, it } from "vitest";
import ToolResultView from "./components/ToolResultView.vue";
import { historyToolResult, type HistoryToolInvocation } from "@eliteforge/agent-ui-chat-core";
import { outcomeFixture } from "../../../contracts/batch-outcomes";
import { recoveryFixture, recoveryEvents, mixedApprovalTimeline, recoveredBatchTimeline } from "../../../contracts/batch-recovery";
import ChatPanel from "./components/ChatPanel.vue";
import { buildAguiUserWorkCards } from "@eliteforge/agent-ui-chat-core";
it.each(["approvals", "history", "partialCompleted", "mixedRejected"])("merges one batch in the complete Vue timeline: %s", async mode => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {configurable:true, value:() => {}});
  const input = mode === "approvals" ? mixedApprovalTimeline() : recoveredBatchTimeline(mode === "history" ? "mixedCompleted" : mode);
  const expected = recoveryFixture[mode === "approvals" || mode === "history" ? "mixedCompleted" : mode];
  if (["partialCompleted", "mixedRejected"].includes(mode)) {
    input.messages[1].history!.run!.status = mode === "mixedRejected" ? "Waiting" : "Running";
    input.messages[1].history!.run!.finishedAtMs = null;
  }
  const container = document.createElement("div");
  const app = createApp({render: () => h(ChatPanel, {draft:"", messages:input.messages, protocolEvents:input.events,
    session:{id:1,sessionId:"session",title:"Batch",status:"ACTIVE",createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString()}})});
  try {
    app.mount(container);
    for (const rail of container.querySelectorAll<HTMLButtonElement>("button.ef-chat__rail-summary")) {
      if (rail.getAttribute("aria-expanded") === "false") { rail.click(); await nextTick(); }
    }
    for (const group of container.querySelectorAll<HTMLButtonElement>("button.ef-chat__rail-entry-toggle")) {
      if (group.getAttribute("aria-expanded") === "false") { group.click(); await nextTick(); }
    }
    const toggles = container.querySelectorAll<HTMLButtonElement>("button.ef-chat__tool-toggle");
    expect(toggles).toHaveLength(1);
    toggles[0].click(); await nextTick();
    expect(Array.from(container.querySelectorAll("[data-batch-status]")).map(e=>e.getAttribute("data-batch-status")))
      .toEqual(expected.history.structured.results.map((row:any)=>row.status));
    if (mode !== "mixedRejected") expect(container.textContent).toContain("confirmed success");
  } finally { app.unmount(); }
});
it.each(["mixedWaiting", "mixedRejected"])("keeps a partial batch parent open in Vue: %s", async name => {
  const card = buildAguiUserWorkCards(recoveryEvents(name))[0];
  if (card.kind !== "toolGroup") throw new Error("missing parent card");
  const container = document.createElement("div");
  const app = createApp({render: () => h(ToolCard, {card:card.value.toolCards[0]})});
  try {
    app.mount(container);
    expect(container.querySelector(".ef-chat__tool-badge--done, .ef-chat__tool-badge--failed")).toBeNull();
    (container.querySelector("button.ef-chat__tool-toggle") as HTMLButtonElement).click();
    await nextTick();
    expect(container.querySelectorAll("[data-batch-index]")).toHaveLength(3);
  } finally { app.unmount(); }
});
it.each(Object.entries(recoveryFixture))("renders recovery snapshots and history identically: %s", (name, outcome) => {
  const card = buildAguiUserWorkCards(recoveryEvents(name))[0];
  if (card.kind !== "toolGroup") throw new Error("missing parent card");
  const views = [card.value.toolCards[0].result, historyToolResult(outcome.history as unknown as HistoryToolInvocation)].map(value => {
    const container = document.createElement("div");
    const app = createApp({render: () => h(ToolResultView, {value, locale:"zh-CN"})});
    try {
      app.mount(container);
      expect(Array.from(container.querySelectorAll("[data-batch-status]")).map(e => e.getAttribute("data-batch-status")))
        .toEqual(outcome.history.structured.results.map((r: any) => r.status));
      return Array.from(container.querySelectorAll("[data-batch-index]")).map(e => e.innerHTML);
    } finally { app.unmount(); }
  });
  expect(views[0]).toHaveLength(3);
  expect(views[1]).toEqual(views[0]);
});

it.each(Object.entries(outcomeFixture))("renders the same runtime outcomes before and after history reload: %s", (name, outcome) => {
  const views = [JSON.stringify(outcome.live), historyToolResult(outcome.history as unknown as HistoryToolInvocation)].map(value => {
    const container = document.createElement("div");
    const app = createApp({ render: () => h(ToolResultView, { value, locale: "zh-CN" }) });
    try {
      app.mount(container);
      const expected = name === "parallelCancellation" ? ["Unknown", "Completed", "NotExecuted"] : ["Failed", "Failed", "Failed"];
      expect(Array.from(container.querySelectorAll("[data-batch-status]")).map(e => e.getAttribute("data-batch-status"))).toEqual(expected);
      if (name === "parallelCancellation") expect(container.textContent).toContain("confirmed success");
      else expect(container.textContent).not.toContain("claimed success");
      return Array.from(container.querySelectorAll("[data-batch-index]")).map(item => item.innerHTML);
    } finally { app.unmount(); }
  });
  expect(views[1]).toEqual(views[0]);
});
it("renders native media and detection results", () => {
  const container = document.createElement("div");
  const app = createApp({ render: () => h(ToolResultView, { value: JSON.stringify({ content: [{ type: "media", media: { mime_type: "image/png", source: { type: "base64", value: "YWJj" } } }], structured: { result: { ai_confidence: 0.9 } } }) }) });
  try {
    app.mount(container);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,YWJj");
    expect(container.textContent).toContain("ai_confidence: 0.9");
  } finally { app.unmount(); }
});

import ToolCard from "./components/ToolCard.vue";
import type { ToolWorkCard } from "@eliteforge/agent-ui-chat-core";
it.each([false, true])("labels a completed tool run as an action, including nested rows (%s)", (nested) => {
  const container = document.createElement("div");
  const card: ToolWorkCard = {
    id: "tool", runId: "run", toolCallId: "call", toolName: "fs_read_text",
    args: { path: "README.md" }, ended: true, started: true, firstMillis: 1,
    result: '{"status":"done"}', logs: [], parentReasoningId: null,
  };
  const app = createApp({ render: () => h(ToolCard, { card, nested, statusLabel: "Completed" }) });
  try {
    app.mount(container);
    expect(container.querySelector(".ef-chat__tool-title")?.textContent).toContain("Read");
  } finally { app.unmount(); }
});

it("localizes tool card titles from the host locale and keeps host names first", () => {
  const card: ToolWorkCard = {
    id: "cmd", runId: "run", toolCallId: "cmd", toolName: "bash_exec",
    args: { command: "cargo test" }, ended: true, started: true, firstMillis: 1,
    result: "", logs: [], parentReasoningId: null,
  };
  const labels = {
    ariaLabel: "Agent work", preparing: "Preparing", responding: "Responding", thinking: "Thinking",
    workedFor: (duration: string) => `Worked for ${duration}`, workingFor: (duration: string) => `Working for ${duration}`,
  };
  const container = document.createElement("div");
  const app = createApp({ render: () => h(ToolCard, { card, locale: "zh-CN" }) });
  try {
    app.mount(container);
    expect(container.querySelector(".ef-chat__tool-title")?.textContent).toContain("执行命令 cargo test");
    expect(container.textContent).not.toContain("bash_exec");
  } finally { app.unmount(); }

  const hostContainer = document.createElement("div");
  const hostApp = createApp({ render: () => h(ToolCard, { card, locale: "zh-CN", labels: { ...labels, tool: { resolveName: () => "自定义工具" } } }) });
  try {
    hostApp.mount(hostContainer);
    expect(hostContainer.querySelector(".ef-chat__tool-title")?.textContent).toContain("自定义工具 cargo test");
  } finally { hostApp.unmount(); }

  const echoContainer = document.createElement("div");
  const echoApp = createApp({ render: () => h(ToolCard, { card, locale: "zh-CN", labels: { ...labels, tool: { resolveName: (runtimeName: string) => runtimeName } } }) });
  try {
    echoApp.mount(echoContainer);
    expect(echoContainer.querySelector(".ef-chat__tool-title")?.textContent).toContain("执行命令 cargo test");
    expect(echoContainer.textContent).not.toContain("bash_exec");
  } finally { echoApp.unmount(); }
});

import { batchFixture } from "../../../contracts/tool-batch";
it("renders framework batch outcomes and previews in Vue", () => {
  const container = document.createElement("div");
  const app = createApp({render: () => h(ToolResultView, {value: JSON.stringify(batchFixture.interrupted), locale: "zh-CN"})});
  try {
    app.mount(container);
    expect(Array.from(container.querySelectorAll("[data-batch-status]")).map(e => e.getAttribute("data-batch-status"))).toEqual(["Completed", "Unknown", "NotExecuted"]);
    for (const label of ["第 1 项 · 已完成", "第 2 项 · 结果未知", "第 3 项 · 未执行"]) expect(container.textContent).toContain(label);
    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(container.querySelector('a[href="https://example.com/source"]')).toBeTruthy();
    expect(container.querySelector('a[href="https://example.com/download"]')).toBeTruthy();
  } finally {app.unmount();}
});


import searchFixture from "../../../contracts/tool-search.json";
it.each(["summaries", "definitions"] as const)("renders compact framework search %s from live and history", key => {
  const fixture=searchFixture[key];
  const renderView=(value:string)=>{
    const container=document.createElement("div"); document.body.appendChild(container);
    const app=createApp({render:()=>h(ToolResultView,{value,locale:"zh-CN"})});app.mount(container);
    try {
      const sections=Array.from(container.querySelectorAll("[data-tool-search-mode]")).map(e=>e.innerHTML);
      expect(sections).toHaveLength(2);expect(sections.join("")).toContain("sample_read");
      expect(container.querySelectorAll("details")).toHaveLength(1);
      expect(container.querySelector("details")!.open).toBe(false);
      expect(Array.from(container.querySelectorAll("pre")).every(e=>e.closest("details"))).toBe(true);
      const details = container.querySelector("details")!;
      // A full preview must not push the expanded JSON below its scroll boundary.
      expect(details.closest(".ef-chat__tool-result-content")).toBeNull();
      details.querySelector("summary")!.click();
      expect(details.open).toBe(true);
      expect(JSON.parse(details.querySelector("pre")!.textContent!)).toEqual(JSON.parse(value));
      details.querySelector("summary")!.click();
      expect(details.open).toBe(false);
      return sections;
    } finally {app.unmount();container.remove();}
  };
  expect(renderView(JSON.stringify(fixture.live))).toEqual(renderView(historyToolResult(fixture.history as unknown as HistoryToolInvocation)));
});
