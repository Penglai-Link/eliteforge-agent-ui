import { initTerminal } from "../src";
import type {
  AITransport,
  TerminalSession,
  TerminalTransport,
  TransportDisposable,
} from "../src/transport";
import "../src/terminal/styles/index.scss";

const session: TerminalSession = {
  currentDirectory: "/demo/project",
  shell: "mock-shell",
  supportsBlocks: true,
  subshellBootstrap: "",
};

function createMockTerminalTransport(): TerminalTransport {
  const outputs = new Set<(data: string) => void>();
  const sessions = new Set<(session: TerminalSession) => void>();
  const exits = new Set<(code: number | null) => void>();
  const errors = new Set<(error: Error) => void>();
  let inputBuffer = "";
  let closed = false;
  const notify = <T>(listeners: Set<(value: T) => void>, value: T) => {
    for (const listener of listeners) listener(value);
  };
  const subscribe = <T>(listeners: Set<(value: T) => void>, listener: (value: T) => void): TransportDisposable => {
    listeners.add(listener);
    return { dispose: () => { listeners.delete(listener); } };
  };

  return {
    async connect() {
      queueMicrotask(() => {
        notify(outputs, "模拟 Shell 已启动。试试 ls、pwd 或 #解释一下这个终端。\r\n\u001b]133;A\u0007$ \u001b]133;B\u0007");
        notify(sessions, session);
      });
      return session;
    },
    input(data, clearBuffer = false, inputLine) {
      if (closed) return;
      if (clearBuffer) {
        inputBuffer = "";
        return;
      }
      for (const character of data) {
        if (character === "\r" || character === "\n") {
          const command = (inputLine ?? inputBuffer).trim();
          inputBuffer = "";
          if (inputLine === undefined) {
            notify(outputs, `\r\n\u001b]133;A\u0007$ \u001b]133;B\u0007`);
            continue;
          }
          notify(outputs, `\u001b]633;E;${command}\u0007\u001b]133;C\u0007\r\n`);
          const output = command === "pwd"
            ? "/demo/project"
            : command === "ls"
              ? "README.md  src/  package.json"
              : command
                ? `模拟执行完成：${command}`
                : "";
          notify(outputs, `${output}\r\n\u001b]133;D;0\u0007\u001b]133;A\u0007$ \u001b]133;B\u0007`);
        } else if (character === "\u007f") {
          inputBuffer = inputBuffer.slice(0, -1);
          notify(outputs, "\b \b");
        } else {
          inputBuffer += character;
          notify(outputs, character);
        }
      }
    },
    resize() {},
    signal(name) {
      if (name === "SIGKILL") notify(exits, 137);
      else notify(outputs, "^C\r\n$ ");
    },
    onOutput: (listener) => subscribe(outputs, listener),
    onSessionChange: (listener) => subscribe(sessions, listener),
    onExit: (listener) => subscribe(exits, listener),
    onError: (listener) => subscribe(errors, listener),
    dispose() {
      closed = true;
      outputs.clear();
      sessions.clear();
      exits.clear();
      errors.clear();
    },
  };
}

const mockAI: AITransport = {
  async request(content) {
    return `建议命令：printf '%s\\n' ${JSON.stringify(content)}`;
  },
  async stream(content, { onChunk, onEvent, signal }) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const requestId = crypto.randomUUID();
    onEvent?.({ type: "RUN_STARTED", runId: requestId });
    onChunk({ requestId, delta: `模拟 AI 回复：${content}` });
    onEvent?.({ type: "RUN_FINISHED", runId: requestId });
    return { requestId };
  },
};

const terminal = initTerminal({
  el: document.querySelector<HTMLElement>("#terminal")!,
  transport: { terminal: createMockTerminalTransport(), ai: mockAI },
  onError: (error) => console.error("Mock terminal error", error),
});

window.addEventListener("beforeunload", () => terminal.dispose(), { once: true });
