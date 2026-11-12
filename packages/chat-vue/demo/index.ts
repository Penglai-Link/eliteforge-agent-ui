import { createApp, h, ref } from "vue";
import { ChatPanel } from "../src";
import { interactionTimelineDemoAnchors, interactionTimelineDemoEvents, interactionTimelineDemoMessages, interactionTimelineDemoRequest, interactionTimelineDemoLabels } from "../../chat-core/src/interactionTimelineDemo";
import "@personai/agent-ui-chat-theme";
import "../src/styles.css";

createApp({
  setup() {
    const mode = ref("history");
    const answeredAt = ref(interactionTimelineDemoRequest.answeredAt);
    return () => {
      const live = mode.value === "waiting" || mode.value === "answered";
      return h("main", { style: { height: "100vh", display: "flex", flexDirection: "column" } }, [
        h("nav", { style: { padding: "12px", display: "flex", gap: "12px" } }, [
          h("button", { onClick: () => { mode.value = "waiting"; } }, "等待回答"),
          h("button", { onClick: () => { answeredAt.value = Date.now(); mode.value = "answered"; } }, "确认回答（无新事件）"),
          h("button", { onClick: () => { mode.value = "finished"; } }, "结束运行"),
          h("button", { onClick: () => { mode.value = "history"; } }, "恢复历史"),
        ]),
        h(ChatPanel, {
          key: mode.value === "history" ? "history" : "live",
          session: {id: "DEMO", sessionId: "DEMO", title: "AG-UI 消息时序预览", status: "ACTIVE", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()},
          messages: live ? interactionTimelineDemoMessages.slice(0, 2) : interactionTimelineDemoMessages,
          draft: "", onDraftChange: () => undefined, onSend: () => undefined,
          protocolEvents: live ? interactionTimelineDemoEvents.filter(event => event.runId === "ask") : interactionTimelineDemoEvents,
          liveAguiAnchorMessageCodes: interactionTimelineDemoAnchors,
          userInputRequests: [{ ...interactionTimelineDemoRequest,
            status: mode.value === "waiting" ? "Pending" : "Answered",
            answeredAt: mode.value === "waiting" ? null : answeredAt.value,
          }], workRailLabels: interactionTimelineDemoLabels, showHeader: false,
        }),
      ]);
    };
  },
}).mount("#app");
