// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ToolResultView } from "./ToolResultView";
import { historyToolResult, type HistoryToolInvocation } from "@eliteforge/agent-ui-chat-core";
import { outcomeFixture } from "../../../contracts/batch-outcomes";
import { recoveryFixture, recoveryEvents, mixedApprovalTimeline, recoveredBatchTimeline } from "../../../contracts/batch-recovery";
import { buildAguiUserWorkCards } from "@eliteforge/agent-ui-chat-core";
import { ChatPanel } from "./ChatPanel";
it.each(["approvals", "history", "partialCompleted", "mixedRejected"])("merges one batch in the complete React timeline: %s", mode => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {configurable:true, value:() => {}});
  const input = mode === "approvals" ? mixedApprovalTimeline() : recoveredBatchTimeline(mode === "history" ? "mixedCompleted" : mode);
  const expected = recoveryFixture[mode === "approvals" || mode === "history" ? "mixedCompleted" : mode];
  if (["partialCompleted", "mixedRejected"].includes(mode)) {
    input.messages[1].history!.run!.status = mode === "mixedRejected" ? "Waiting" : "Running";
    input.messages[1].history!.run!.finishedAtMs = null;
  }
  const {container} = render(<ChatPanel draft="" onDraftChange={() => {}} onSend={() => {}}
    session={{id:1,sessionId:"session",title:"Batch",status:"ACTIVE",createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString()}}
    messages={input.messages} protocolEvents={input.events} />);
  for (const rail of container.querySelectorAll("button.ef-chat__rail-summary")) {
    if (rail.getAttribute("aria-expanded") === "false") fireEvent.click(rail);
  }
  for (const group of container.querySelectorAll("button.ef-chat__rail-entry-toggle")) {
    if (group.getAttribute("aria-expanded") === "false") fireEvent.click(group);
  }
  const toggles = container.querySelectorAll("button.ef-chat__tool-toggle");
  expect(toggles).toHaveLength(1);
  fireEvent.click(toggles[0]);
  expect(Array.from(container.querySelectorAll("[data-batch-status]")).map(e=>e.getAttribute("data-batch-status")))
    .toEqual(expected.history.structured.results.map((row:any)=>row.status));
  if (mode !== "mixedRejected") expect(container.textContent).toContain("confirmed success");
});
it.each(["mixedWaiting", "mixedRejected"])("keeps a partial batch parent open in React: %s", name => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {configurable:true, value:() => {}});
  const {container} = render(<ChatPanel draft="" onDraftChange={() => {}} onSend={() => {}}
    session={{id:1,sessionId:"session",title:"Batch",status:"ACTIVE",createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString()}}
    messages={[{id:"user",messageId:"user",sessionId:"session",role:"USER",actor:"User",content:"run",createdAt:new Date(0).toISOString()}]}
    protocolEvents={recoveryEvents(name)} />);
  const rail = container.querySelector("button.ef-chat__rail-summary")!;
  if (rail.getAttribute("aria-expanded") === "false") fireEvent.click(rail);
  const toggle = container.querySelector("button.ef-chat__tool-toggle")!;
  expect(toggle).toBeTruthy();
  expect(toggle.querySelector(".ef-chat__tool-badge--done, .ef-chat__tool-badge--failed")).toBeNull();
  fireEvent.click(toggle);
  expect(container.querySelectorAll("[data-batch-index]")).toHaveLength(3);
});
it.each(Object.entries(recoveryFixture))("renders recovery snapshots and history identically: %s", (name, outcome) => {
  const card = buildAguiUserWorkCards(recoveryEvents(name))[0];
  if (card.kind !== "toolGroup") throw new Error("missing parent card");
  const {container, rerender} = render(<ToolResultView value={card.value.toolCards[0].result} locale="zh-CN" />);
  const items = () => Array.from(container.querySelectorAll("[data-batch-index]")).map(e => e.innerHTML);
  const live = items();
  expect(live).toHaveLength(3);
  expect(Array.from(container.querySelectorAll("[data-batch-status]")).map(e => e.getAttribute("data-batch-status")))
    .toEqual(outcome.history.structured.results.map((r: any) => r.status));
  rerender(<ToolResultView value={historyToolResult(outcome.history as unknown as HistoryToolInvocation)} locale="zh-CN" />);
  expect(items()).toEqual(live);
});
afterEach(cleanup);
it.each(Object.entries(outcomeFixture))("renders the same runtime outcomes before and after history reload: %s", (name, outcome) => {
  const { container, rerender } = render(<ToolResultView value={JSON.stringify(outcome.live)} locale="zh-CN" />);
  // Compare the rendered item sections; the outer JSON disclosure also
  // contains transport-only effect/reference fields absent from history.
  const renderedItems = () => Array.from(container.querySelectorAll("[data-batch-index]")).map(item => item.innerHTML);
  const live = renderedItems();
  const expected = name === "parallelCancellation" ? ["Unknown", "Completed", "NotExecuted"] : ["Failed", "Failed", "Failed"];
  expect(Array.from(container.querySelectorAll("[data-batch-status]")).map(e => e.getAttribute("data-batch-status"))).toEqual(expected);
  rerender(<ToolResultView value={historyToolResult(outcome.history as unknown as HistoryToolInvocation)} locale="zh-CN" />);
  expect(renderedItems()).toEqual(live);
  if (name === "parallelCancellation") expect(screen.getByText("confirmed success")).toBeTruthy();
  else expect(container.textContent).not.toContain("claimed success");
});
it("renders generated images and source links without expanding JSON", () => {
  render(<ToolResultView value={JSON.stringify({ structured: { task_id: "image-task", job: { status: "Completed", images: [{ source: { type: "url", value: "https://example.com/image.png" } }] }, results: [{ title: "Source", url: "https://example.com", snippet: "Evidence" }] } })} />);
  expect(screen.getByRole("img").getAttribute("src")).toBe("https://example.com/image.png");
  expect(screen.getByRole("link", { name: "Source" }).getAttribute("href")).toBe("https://example.com");
  expect(screen.getByText("image-task")).toBeTruthy();
});

import { batchFixture } from "../../../contracts/tool-batch";
it("renders framework batch outcomes and previews in React", () => {
  const {container} = render(<ToolResultView value={JSON.stringify(batchFixture.interrupted)} locale="zh-CN" />);
  expect(Array.from(container.querySelectorAll("[data-batch-status]")).map(e => e.getAttribute("data-batch-status"))).toEqual(["Completed", "Unknown", "NotExecuted"]);
  expect(screen.getByText("第 1 项 · 已完成")).toBeTruthy();
  expect(screen.getByText("第 2 项 · 结果未知")).toBeTruthy();
  expect(screen.getByText("第 3 项 · 未执行")).toBeTruthy();
  expect(screen.getAllByRole("img")).toHaveLength(2);
  expect(screen.getByRole("link", {name:"Source"})).toBeTruthy();
  expect(screen.getByRole("link", {name:"Download"})).toBeTruthy();
});


import searchFixture from "../../../contracts/tool-search.json";
it.each(["summaries", "definitions"] as const)("renders compact framework search %s from live and history", key => {
  const fixture=searchFixture[key];
  const {container,rerender}=render(<ToolResultView value={JSON.stringify(fixture.live)} locale="zh-CN" />);
  const sections=()=>Array.from(container.querySelectorAll("[data-tool-search-mode]")).map(e=>e.innerHTML);
  const live=sections();
  expect(live).toHaveLength(2);
  expect(live.join("")).toContain("sample_read");
  expect(container.querySelectorAll("details")).toHaveLength(1);
  expect(container.querySelector("details")!.open).toBe(false);
  expect(Array.from(container.querySelectorAll("pre")).every(e=>e.closest("details"))).toBe(true);
  const checkRawJson = (value: string) => {
    const details = container.querySelector("details")!;
    // A full preview must not push the expanded JSON below its scroll boundary.
    expect(details.closest(".ef-chat__tool-result-content")).toBeNull();
    fireEvent.click(details.querySelector("summary")!);
    expect(details.open).toBe(true);
    expect(JSON.parse(details.querySelector("pre")!.textContent!)).toEqual(JSON.parse(value));
    fireEvent.click(details.querySelector("summary")!);
    expect(details.open).toBe(false);
  };
  checkRawJson(JSON.stringify(fixture.live));
  const history = historyToolResult(fixture.history as unknown as HistoryToolInvocation);
  rerender(<ToolResultView value={history} locale="zh-CN" />);
  expect(sections()).toEqual(live);
  checkRawJson(history);
});
