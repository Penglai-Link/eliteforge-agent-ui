import { createApp, h, ref } from "vue";
import { ChatPanel } from "../src";
import { workTimelinePreview } from "../../chat-core/demo/work-timeline-fixture";
import "@personai/agent-ui-chat-theme";
import "../src/styles.css";

createApp({ setup() {
  const stage = ref(1), restored = ref(false);
  return () => h("main", { style: { height: "100vh", display: "flex", flexDirection: "column" } }, [
    h("nav", { style: { padding: "12px", display: "flex", gap: "12px" } }, [
      h("button", { onClick: () => { stage.value = Math.min(4, stage.value + 1); } }, "Next phase"),
      h("button", { onClick: () => { stage.value = 4; restored.value = true; } }, "Restore history"),
      h("button", { onClick: () => { stage.value = 1; restored.value = false; } }, "Reset"),
      h("button", { onClick: () => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === "matrix-dark" ? "light" : "matrix-dark"; } }, "Theme"),
    ]),
    h(ChatPanel, { key: restored.value ? "history" : "live", ...workTimelinePreview(stage.value, restored.value), session: { id: "timeline", sessionId: "timeline", title: "Timeline", status: "ACTIVE", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      draft: "", onDraftChange: () => {}, onSend: () => {}, showHeader: false, workRailLabels: { ariaLabel: "Agent work", thinking: "思考中", working: "工作中", preparing: "准备中", responding: "回复中", workingFor: (duration: string) => `正在工作 ${duration}`, workedFor: (duration: string) => `工作完成 ${duration}` } }),
  ]);
} }).mount("#root");
