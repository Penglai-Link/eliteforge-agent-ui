import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ChatPanel } from "../src";
import { interactionTimelineDemoAnchors, interactionTimelineDemoEvents, interactionTimelineDemoMessages, interactionTimelineDemoRequest, interactionTimelineDemoLabels } from "../../chat-core/src/interactionTimelineDemo";
import "@personai/agent-ui-chat-theme";
import "../src/styles.css";

function Preview() {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("history");
  const [answeredAt, setAnsweredAt] = useState(interactionTimelineDemoRequest.answeredAt);
  const live = mode === "waiting" || mode === "answered";
  const requests = [{ ...interactionTimelineDemoRequest,
    status: mode === "waiting" ? "Pending" as const : "Answered" as const,
    answeredAt: mode === "waiting" ? null : answeredAt,
  }];
  return (
    <main style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
    <nav style={{ padding: 12, display: "flex", gap: 12 }}>
      <button onClick={() => setMode("waiting")}>等待回答</button>
      <button onClick={() => { setAnsweredAt(Date.now()); setMode("answered"); }}>确认回答（无新事件）</button>
      <button onClick={() => setMode("finished")}>结束运行</button>
      <button onClick={() => setMode("history")}>恢复历史</button>
    </nav>
    <ChatPanel key={mode === "history" ? "history" : "live"} allowDraftSession session={{id: "DEMO", sessionId: "DEMO", title: "AG-UI 消息时序预览", status: "ACTIVE", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()}}
      messages={live ? interactionTimelineDemoMessages.slice(0, 2) : interactionTimelineDemoMessages} draft={draft} onDraftChange={setDraft} onSend={() => undefined}
      inputSuggestions={[
        { kind: "command", name: "reasoning", description: "调整推理强度" },
        { kind: "command", name: "rename", description: "重命名当前会话" },
        { kind: "command", name: "share", description: "创建会话分享链接" },
        { kind: "command", name: "status", description: "查看会话状态" },
        { kind: "skill", name: "analytics-dashboard", description: "创建数据看板" },
        { kind: "skill", name: "batch-edit-photos", description: "批量统一照片风格" },
        { kind: "skill", name: "business-review", description: "制作业务评审材料" },
      ]}
      inputSuggestionLabels={{ commands: "命令", skills: "技能", commandsAndSkills: "命令和技能" }}
      protocolEvents={live ? interactionTimelineDemoEvents.filter(event => event.runId === "ask") : interactionTimelineDemoEvents} liveAguiAnchorMessageCodes={interactionTimelineDemoAnchors}
      userInputRequests={requests} workRailLabels={interactionTimelineDemoLabels} showHeader={false} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
