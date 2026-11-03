// @vitest-environment jsdom
import { createApp, h, nextTick } from "vue";
import { expect, it } from "vitest";
import { historyMessages } from "@eliteforge/agent-ui-chat-core";
import ChatPanel from "./components/ChatPanel.vue";
import { singleToolHistory } from "../../../contracts/single-tool-history";
import { phaseToolEvents, phaseToolHistory } from "../../../contracts/phase-tool-placement";

it.each([false, true])("places the tool rail between its commentary cards (replay=%s)", async replay => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: () => {} });
  const container = document.createElement("div");
  const app = createApp({ render: () => h(ChatPanel, { draft: "", onDraftChange: () => {}, onSend: () => {}, showHeader: false,
    session: { id: 1, sessionId: "SESSION-1", title: "Phase", status: "ACTIVE", createdAt: new Date(1000).toISOString(), updatedAt: new Date(2000).toISOString() },
    messages: historyMessages(phaseToolHistory), protocolEvents: replay ? phaseToolEvents : [] }) });
  try {
    app.mount(container);
    const first = container.querySelector('[data-message-id="progress-1"]')!;
    const second = container.querySelector('[data-message-id="progress-2"]')!;
    const rail = container.querySelector('[aria-label="Agent work"]')!;
    expect(first.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rail.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll('[data-message-id="final"]')).toHaveLength(1);
  } finally { app.unmount(); }
});

it("reuses the full work rail in a read-only transcript without a composer", async () => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {configurable:true, value:() => {}});
  const container = document.createElement("div");
  const app = createApp({render: () => h(ChatPanel, {draft:"",onDraftChange:()=>{},onSend:()=>{},showHeader:false,showComposer:false,
    session:{id:1,sessionId:"SESSION-1",title:"Child",status:"ACTIVE",createdAt:new Date(1000).toISOString(),updatedAt:new Date(1600).toISOString()},
    messages:historyMessages(singleToolHistory)})});
  try {
    app.mount(container);
    expect(container.querySelector(".ef-chat__composer")).toBeNull();
    const rail = container.querySelector<HTMLButtonElement>(".ef-chat__rail-summary")!;
    expect(rail.getAttribute("aria-expanded")).toBe("false");
    rail.click(); await nextTick();
    expect(container.querySelectorAll(".ef-chat__tool-toggle")).toHaveLength(1);
  } finally {app.unmount();}
});


it.each([false, true])("keeps unphased replies out of collapsed work in a read-only transcript (replay=%s)", async replay => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: () => {} });
  const container = document.createElement("div");
  const messages = historyMessages(phaseToolHistory).map(message => ({ ...message, phase: undefined }));
  const app = createApp({ render: () => h(ChatPanel, { draft: "", onDraftChange: () => {}, onSend: () => {}, showHeader: false,
    session: { id: 1, sessionId: "SESSION-1", title: "Replies", status: "ACTIVE", createdAt: new Date(1000).toISOString(), updatedAt: new Date(2000).toISOString() },
    messages, protocolEvents: replay ? phaseToolEvents : [] }) });
  try {
    app.mount(container);
    const replies = ["progress-1", "progress-2", "final"].map(id => container.querySelector(`[data-message-id="${id}"]`)!);
    for (const reply of replies) {
      expect(reply).toBeTruthy();
      expect(reply.closest(".ef-chat__rail")).toBeNull();
    }
    expect(replies[0].compareDocumentPosition(replies[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(replies[1].compareDocumentPosition(replies[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  } finally { app.unmount(); }
});
