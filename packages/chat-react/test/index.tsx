import { createRoot } from "react-dom/client";
import { createMockChatAdapter } from "@eliteforge/agent-ui-chat-core";
import { ChatRuntimeWindow } from "../src";
import "@eliteforge/agent-ui-chat-theme";
import "../src/styles.css";

createRoot(document.getElementById("root")!).render(
  <ChatRuntimeWindow
    adapter={createMockChatAdapter({ eventDelayMs: 350 })}
    config={{ floating: false, title: "模拟宿主聊天" }}
  />,
);
