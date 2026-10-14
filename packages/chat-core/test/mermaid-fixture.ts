export const architecture = `flowchart TD
  subgraph 桌面[Electron 壳 electron/]
    MAIN[主进程: sidecar管理/托盘/更新]
  end
  subgraph 后端[tron-backend Rust]
    HTTP[adapters/inbound HTTP+Socket.IO] --> APP[application 应用服务]
    APP --> DOM[domain 领域模型]
    APP --> OUT[adapters/outbound]
    OUT --> ST[(SQLite + Grafeo + S3/本地)]
    subgraph 宿主[Agent 宿主集成]
      APP --> HC[tron-harness-capability]
      HC --> FW[EliteForge Agent Framework<br/>AG-UI/MCP/记忆/otel]
      APP --> BT[business_tools 工具注册]
    end
  end
  subgraph 前端[tron-frontend React]
    UI[domain/* 页面+hooks] --> ADP[packages/chat-* 适配器]
  end
  MAIN -->|spawn+等待就绪| HTTP
  UI -->|mock或api| HTTP
  FE[前端构建产物] -.嵌入.-> RES[resources/frontend]`;
export const mermaidMarkdown = "## 架构图\n\n```mermaid\n" + architecture + "\n```\n\n## 消息时序\n\n```mermaid\nsequenceDiagram\n  participant 用户\n  participant Chat\n  用户->>Chat: 点击图表\n  Chat-->>用户: 显示大图和遮罩\n```\n\n普通代码块：\n```ts\nconst diagram = true;\n```";
