// @vitest-environment jsdom
import { createApp, h, nextTick } from "vue";
import { expect, it } from "vitest";
import { historyMessages } from "@eliteforge/agent-ui-chat-core";
import ChatPanel from "./components/ChatPanel.vue";
import { singleToolHistory } from "../../../contracts/single-tool-history";
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
