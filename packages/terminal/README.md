# @personai/agent-ui-terminal

可嵌入 Web 应用的终端组件，包含 xterm.js 渲染、Shell 命令块、交互输入、AI 对话/命令生成和流式活动展示。组件不创建服务端进程，也不绑定任何产品 API；宿主注入终端与 AI 传输实现。

## 安装

```sh
npm install @personai/agent-ui-terminal
```

应用入口需导入 `@personai/agent-ui-terminal/styles.css`。包内 `npm run dev` 提供本地模拟宿主演示。

## 最小接入

```ts
import { initTerminal, createTerminalTransport, createAITransport } from "@personai/agent-ui-terminal";
import "@personai/agent-ui-terminal/styles.css";

const terminal = initTerminal({
  el: document.querySelector("#terminal")!,
  transport: {
    // 负责启动/连接 PTY，并把输入、尺寸变化和信号转发给宿主服务。
    terminal: createTerminalTransport({ url: "https://your-terminal-service" }),
    // 可选：宿主提供 AI 请求与流式传输；省略后仍可使用普通终端。
    ai: createAITransport({
      url: "https://your-ai-service/chat",
      headers: { Authorization: `Bearer ${token}` },
    }),
  },
  locale: "zh-CN",
  onExit: (code) => console.log("shell exited", code),
  onError: (error) => console.error(error),
});

// 页面卸载或终端标签关闭时释放组件和两条连接。
terminal.dispose();
```

`createTerminalTransport` 使用 Socket.IO 连接远端 PTY。服务端负责安全地创建并管理 shell 进程；浏览器组件只发送终端输入、尺寸变化和信号。连接地址、认证、租户信息和进程启动策略均由宿主决定。

## 自定义传输

如果宿主的传输协议不同，实现并注入 `TerminalTransport` 即可。它负责连接、发送键盘输入/尺寸/信号，并通知组件输出、会话信息、退出和错误。需要 AI 能力时再实现 `AITransport` 的 `request` 与 `stream`；流式结果通过 `onChunk` 提供文本，通过 `onEvent` 提供结构化 Agent 活动。详见包导出的 TypeScript 接口。

```ts
const terminal = initTerminal({
  el,
  transport: {
    terminal: hostTerminalTransport,
    ai: hostAITransport,
  },
  prompts: {
    chat: (text) => `请结合当前终端上下文回答：${text}`,
    explain: ({ command, output }) => `解释命令 ${command} 的输出：\n${output}`,
    generate: (text) => `根据需求生成 shell 命令：${text}`,
  },
  agentPrefix: "#",
  onExit: closeTerminalTab,
});
```

`initTerminal` 还支持 locale、文案覆盖、xterm 主题/字体选项、命令分流规则和降级状态回调。`dispose()` 会停止组件监听、AI 请求并释放传输。

本包固定使用 xterm.js 5.5.0，并在安装时应用一处范围受限的输入补丁，避免 macOS 中文输入法提交时丢字或重复。升级 xterm 版本时，补丁会拒绝应用；需先验证对应版本的输入行为。
