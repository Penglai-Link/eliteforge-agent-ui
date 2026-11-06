import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ChatPanel } from "../src";
import { workTimelinePreview } from "../../chat-core/demo/work-timeline-fixture";
import "@eliteforge/agent-ui-chat-theme";
import "../src/styles.css";

function Preview() {
  const [stage, setStage] = useState(1), [restored, setRestored] = useState(false);
  return <main style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
    <nav style={{ padding: 12, display: "flex", gap: 12 }}>
      <button onClick={() => setStage(Math.min(4, stage + 1))}>Next phase</button>
      <button onClick={() => { setStage(4); setRestored(true); }}>Restore history</button>
      <button onClick={() => { setStage(1); setRestored(false); }}>Reset</button>
      <button onClick={() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === "matrix-dark" ? "light" : "matrix-dark"; }}>Theme</button>
    </nav>
    <ChatPanel key={restored ? "history" : "live"} {...workTimelinePreview(stage, restored)} session={{ id: "timeline", sessionId: "timeline", title: "Timeline", status: "ACTIVE", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }}
      draft="" onDraftChange={() => {}} onSend={() => {}} showHeader={false} workRailLabels={{ ariaLabel: "Agent work", thinking: "思考中", working: "工作中", preparing: "准备中", responding: "回复中", workingFor: duration => `正在工作 ${duration}`, workedFor: duration => `工作完成 ${duration}` }} />
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
