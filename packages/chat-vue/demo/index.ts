import { createApp } from "vue";
import { ChatPanel } from "../src";
import { interactionTimelineDemoAnchors, interactionTimelineDemoEvents, interactionTimelineDemoMessages, interactionTimelineDemoRequest, interactionTimelineDemoLabels } from "../../chat-core/src/interactionTimelineDemo";
import "@personai/agent-ui-chat-theme";
import "../src/styles.css";

createApp(ChatPanel, {
  session: {id: "DEMO", sessionId: "DEMO", title: "AG-UI 消息时序预览", status: "ACTIVE", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()},
  messages: interactionTimelineDemoMessages, draft: "", onDraftChange: () => undefined, onSend: () => undefined,
  protocolEvents: interactionTimelineDemoEvents, liveAguiAnchorMessageCodes: interactionTimelineDemoAnchors,
  userInputRequests: [interactionTimelineDemoRequest], workRailLabels: interactionTimelineDemoLabels, showHeader: false,
}).mount("#app");
