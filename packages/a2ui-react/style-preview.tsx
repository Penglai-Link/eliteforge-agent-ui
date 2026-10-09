import { createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChatPanel } from "../chat-react/src/ChatPanel";
import "../chat-react/src/styles.css";
import { A2UISurface } from "./src";
import { createProfileDemo } from "@eliteforge/agent-ui-a2ui-core/demo";
import "./style-preview.css";
const demo = createProfileDemo();
while (!demo.done) demo.next();
function Preview() {
  const [draft, setDraft] = useState("对比按钮、字体与焦点状态");
  return h("main", {},
    h("h1", {}, "Chat / A2UI"),
    h("p", {}, "共享默认样式；切换主题或覆盖令牌，检查两边同步变化。"),
    h("nav", {},
      h("button", { onClick: () => { window.location.reload(); } }, "独立默认"),
      h("button", { onClick: async () => { await import("@eliteforge/agent-ui-chat-theme/styles.css"); document.documentElement.dataset.theme = "light"; } }, "浅色主题"),
      h("button", { onClick: async () => { await import("@eliteforge/agent-ui-chat-theme/styles.css"); document.documentElement.dataset.theme = "matrix-dark"; } }, "深色主题"),
      h("button", { onClick: () => document.documentElement.classList.toggle("custom") }, "宿主覆盖")),
    h("div", { className: "comparison" },
      h("section", {}, h("h2", {}, "chat-react"), h(ChatPanel, {
        allowDraftSession: true, draft, onDraftChange: setDraft, onSend: () => setDraft(""),
        messages: [], title: "Agent 对话", emptyTitle: "准备开始", emptyDescription: "输入内容并发送", sendLabel: "发送",
      })),
      h("section", {}, h("h2", {}, "a2ui-react"), h(A2UISurface, { client: demo.client, surfaceId: "profile", onAction: demo.onAction }))))
}
createRoot(document.getElementById("app")!).render(h(Preview));
