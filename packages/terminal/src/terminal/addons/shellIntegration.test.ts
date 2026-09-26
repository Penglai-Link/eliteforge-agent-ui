// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShellIntegrationAddon, parseSubshellHost } from "./shellIntegration";
import type { TerminalCommandBlock } from "../types/shellIntegration";

const CLEAR_LINE = "\x15\x0b";
const SUBSHELL_DELAY_MS = 1_200;

describe("ShellIntegrationAddon", () => {
  let harness: ReturnType<typeof setup>;

  beforeEach(() => {
    vi.useFakeTimers();
    harness = setup();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("prompt state", () => {
    it("starts out not knowing where the shell is", () => {
      // No marker seen yet: callers must not assume a prompt is on screen.
      expect(harness.addon.getState()).toBe("unknown");
      expect(harness.addon.isAtPrompt()).toBe(false);
    });

    it("follows the shell through one command lifecycle", () => {
      const states: string[] = [];
      harness.addon.stateChange.on((state) => states.push(state));

      harness.osc133("A");
      expect(harness.addon.getState()).toBe("prompt");
      expect(harness.addon.isAtPrompt()).toBe(true);

      harness.osc133("B");
      expect(harness.addon.getState()).toBe("input");
      expect(harness.addon.isAtPrompt()).toBe(true);

      harness.osc133("C");
      expect(harness.addon.getState()).toBe("executing");
      expect(harness.addon.isAtPrompt()).toBe(false);

      harness.osc133("D;0");
      // The next prompt has not printed yet, so nothing is on screen to type at.
      expect(harness.addon.getState()).toBe("unknown");
      expect(harness.addon.isAtPrompt()).toBe(false);

      expect(states).toEqual(["prompt", "input", "executing", "unknown"]);
    });

    it("consumes the markers so they never reach the renderer", () => {
      expect(harness.dispatch(133, "A")).toBe(true);
      expect(harness.dispatch(633, "E;ls")).toBe(true);
      expect(harness.dispatch(7, "file://host/tmp")).toBe(true);
    });

    it("ignores marker subcommands it does not implement", () => {
      harness.osc133("A");
      harness.osc133("P;k=i");

      expect(harness.addon.getState()).toBe("prompt");
    });

    it("fires promptStart for every prompt", () => {
      const promptStart = vi.fn();
      harness.addon.promptStart.on(promptStart);

      harness.runCommand("ls", 0);
      harness.osc133("A");

      expect(promptStart).toHaveBeenCalledTimes(2);
    });
  });

  describe("command blocks", () => {
    it("builds a block from the reported command and exit code", () => {
      const blocks = harness.collectBlocks();

      harness.setCwd("/workspace");
      harness.runCommand("git status", 0);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        command: "git status",
        exitCode: 0,
        cwd: "/workspace",
      });
    });

    it("keeps a non-zero exit code so the block can be marked failed", () => {
      const blocks = harness.collectBlocks();

      harness.runCommand("false", 1);

      expect(blocks[0].exitCode).toBe(1);
    });

    it("records an unknown status when the shell reports none", () => {
      const blocks = harness.collectBlocks();

      harness.runCommand("sleep 100", null);

      expect(blocks[0].exitCode).toBeNull();
    });

    it("announces the command as it starts running", () => {
      const commandStart = vi.fn();
      harness.addon.commandStart.on(commandStart);

      harness.runCommand("npm test", 0);

      expect(commandStart).toHaveBeenCalledWith("npm test");
    });

    it("does not reuse a command line for the following block", () => {
      const blocks = harness.collectBlocks();

      harness.runCommand("ls", 0);
      // Second command with no OSC 633 report, e.g. a shell that omits it.
      harness.osc133("A");
      harness.osc133("B");
      harness.osc133("C");
      harness.osc133("D;0");

      expect(blocks[0].command).toBe("ls");
      expect(blocks[1].command).toBe("");
    });

    it("anchors the block to markers rather than to row numbers", () => {
      const blocks = harness.collectBlocks();

      harness.cursorTo(10);
      harness.osc133("A");
      harness.osc133("B");
      harness.cursorTo(11);
      harness.osc133("C");
      harness.cursorTo(14);
      harness.osc133("D;0");

      expect(blocks[0].startLine).toBe(10);
      expect(blocks[0].endLine).toBe(14);

      // Scrollback trimming shifts every row; markers follow, raw numbers would not.
      harness.trimScrollback(4);
      expect(blocks[0].startLine).toBe(6);
      expect(blocks[0].endLine).toBe(10);
    });

    it("reports a trimmed-away block as gone instead of pointing at a wrong row", () => {
      const blocks = harness.collectBlocks();
      harness.cursorTo(2);
      harness.runCommand("ls", 0);

      harness.disposeMarkersBefore(5);

      expect(blocks[0].startLine).toBe(-1);
    });

    it("reads the output rows for the AI, skipping the echoed command", () => {
      const blocks = harness.collectBlocks();
      harness.writeLines(["$ ls", "file-a", "file-b", "$ "]);

      harness.cursorTo(0);
      harness.osc133("A");
      harness.osc133("B");
      harness.cursorTo(0);
      harness.osc133("C");
      harness.cursorTo(2);
      harness.osc133("D;0");

      // Row 0 still holds the command the shell echoed.
      expect(blocks[0].readOutput()).toBe("file-a\nfile-b");
    });

    it("keeps the tail of a long output rather than the head", () => {
      harness = setup({ maxOutputLines: 2 });
      const blocks = harness.collectBlocks();
      harness.writeLines(["$ seq 4", "1", "2", "3", "4"]);

      harness.cursorTo(0);
      harness.osc133("A");
      harness.osc133("B");
      harness.cursorTo(0);
      harness.osc133("C");
      harness.cursorTo(4);
      harness.osc133("D;0");

      // The end of a failing output is what explains the failure.
      expect(blocks[0].readOutput()).toBe("3\n4");
    });

    it("adopts a command when the integration appears mid-session", () => {
      const blocks = harness.collectBlocks();

      // No 133;A ever arrived, e.g. hooks installed after the first prompt.
      harness.osc633("E;whoami");
      harness.osc133("C");
      harness.osc133("D;0");

      expect(blocks).toHaveLength(1);
      expect(blocks[0].command).toBe("whoami");
    });

    it("ignores a command end that has no block open", () => {
      const blocks = harness.collectBlocks();

      harness.osc133("D;0");

      expect(blocks).toHaveLength(0);
    });

    it("drops the pending block when a prompt restarts without running anything", () => {
      const blocks = harness.collectBlocks();

      harness.osc133("A");
      harness.osc133("B");
      // User pressed Ctrl-C: the shell reprints the prompt, nothing ran.
      harness.osc133("A");
      harness.osc133("B");
      harness.osc133("C");
      harness.osc133("D;130");

      expect(blocks).toHaveLength(1);
      expect(blocks[0].exitCode).toBe(130);
    });

    it("bounds the tracked history and releases evicted markers", () => {
      for (let index = 0; index < 205; index += 1) {
        harness.runCommand(`echo ${index}`, 0);
      }

      const tracked = harness.addon.getBlocks();
      expect(tracked).toHaveLength(200);
      expect(tracked[0].command).toBe("echo 5");
      // Evicting must free the markers, which also frees any decoration on them.
      expect(harness.disposedMarkerCount()).toBeGreaterThan(0);
    });
  });

  describe("working directory", () => {
    it("publishes a directory change reported by the shell", () => {
      const cwdChange = vi.fn();
      harness.addon.cwdChange.on(cwdChange);

      harness.dispatch(7, "file://host/workspace/project");

      expect(cwdChange).toHaveBeenCalledWith("/workspace/project");
      expect(harness.addon.getCwd()).toBe("/workspace/project");
    });

    it("does not republish the same directory", () => {
      const cwdChange = vi.fn();
      harness.addon.cwdChange.on(cwdChange);

      harness.dispatch(7, "file://host/workspace");
      harness.dispatch(7, "file://host/workspace");

      expect(cwdChange).toHaveBeenCalledTimes(1);
    });

    it("accepts the initial directory from the session descriptor", () => {
      const cwdChange = vi.fn();
      harness.addon.cwdChange.on(cwdChange);

      harness.addon.setCwd("/workspace");
      harness.addon.setCwd("/workspace");
      harness.addon.setCwd("");

      expect(cwdChange).toHaveBeenCalledExactlyOnceWith("/workspace");
    });
  });

  describe("subshell detection", () => {
    it("finishes the SSH command block when the remote prompt starts", () => {
      const blocks = harness.collectBlocks();

      harness.osc133("A");
      harness.showPrompt("$ ");
      harness.osc133("B");
      harness.osc633("E;ssh root@host");
      harness.osc133("C");
      harness.osc133("A");

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        command: "ssh root@host",
        commandStartColumn: 2,
      });
      expect(blocks[0].commandMarker?.line).toBe(0);
    });

    it("offers to bootstrap a remote shell that never reports a prompt", () => {
      const detected = vi.fn();
      harness.addon.subshellDetected.on(detected);

      harness.osc633("E;ssh build@10.0.0.4");
      harness.osc133("C");
      harness.showPrompt();
      vi.advanceTimersByTime(SUBSHELL_DELAY_MS);

      expect(detected).toHaveBeenCalledWith({
        command: "ssh build@10.0.0.4",
        host: "10.0.0.4",
      });
    });

    it("stays quiet when the remote shell announces its own prompt", () => {
      const detected = vi.fn();
      harness.addon.subshellDetected.on(detected);

      harness.osc633("E;ssh host");
      harness.osc133("C");
      vi.advanceTimersByTime(SUBSHELL_DELAY_MS / 2);
      // The remote shell has the integration installed.
      harness.osc133("A");
      vi.advanceTimersByTime(SUBSHELL_DELAY_MS * 2);

      expect(detected).not.toHaveBeenCalled();
    });

    it("waits for the output to settle before concluding", () => {
      const detected = vi.fn();
      harness.addon.subshellDetected.on(detected);

      harness.osc633("E;ssh host");
      harness.osc133("C");
      harness.showPrompt();
      vi.advanceTimersByTime(SUBSHELL_DELAY_MS - 100);
      // A login banner is still streaming in.
      harness.addon.noteOutput();
      vi.advanceTimersByTime(SUBSHELL_DELAY_MS - 100);
      expect(detected).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(detected).toHaveBeenCalledOnce();
    });

    it("does not inject while SSH is waiting for authentication", () => {
      const detected = vi.fn();
      harness.addon.subshellDetected.on(detected);

      harness.osc633("E;ssh root@host");
      harness.osc133("C");
      harness.addon.noteOutput("root@host's password:");
      vi.advanceTimersByTime(SUBSHELL_DELAY_MS * 2);
      expect(detected).not.toHaveBeenCalled();

      // Once the credential is submitted, wait for a subsequent remote-shell
      // output chunk before restarting the detection timer.
      harness.addon.noteInput("secret");
      harness.addon.noteInput("\r");
      harness.addon.noteOutput("Last login: today\r\n$ ");
      harness.showPrompt("$ ");
      vi.advanceTimersByTime(SUBSHELL_DELAY_MS);

      expect(detected).toHaveBeenCalledWith({
        command: "ssh root@host",
        host: "host",
      });
    });

    it("removes bracketed-paste framing from an SSH credential", () => {
      harness.osc633("E;ssh root@host");
      harness.osc133("C");
      harness.addon.noteOutput("root@host's password:");

      expect(
        harness.addon.sanitizeInput("\x1b[200~pasted credential\x1b[201~"),
      ).toBe("pasted credential");
    });

    it("recognizes an authentication prompt split across output chunks", () => {
      harness.osc633("E;ssh root@host");
      harness.osc133("C");
      harness.addon.noteOutput("root@host's pass");
      harness.addon.noteOutput("word:");

      expect(harness.addon.sanitizeInput("\x1b[200~secret\x1b[201~")).toBe(
        "secret",
      );
    });

    it("preserves bracketed paste outside authentication", () => {
      const paste = "\x1b[200~printf hello\x1b[201~";

      expect(harness.addon.sanitizeInput(paste)).toBe(paste);
    });

    it("does not fire once the command has already finished", () => {
      const detected = vi.fn();
      harness.addon.subshellDetected.on(detected);

      harness.osc633("E;ssh host");
      harness.osc133("C");
      harness.osc133("D;255");
      vi.advanceTimersByTime(SUBSHELL_DELAY_MS * 2);

      expect(detected).not.toHaveBeenCalled();
    });

    it("only watches commands that actually open a shell", () => {
      const detected = vi.fn();
      harness.addon.subshellDetected.on(detected);

      for (const command of [
        "ls -la",
        "docker ps",
        "docker exec -it api python",
        "docker attach api",
        "kubectl get pods",
        "git ssh",
      ]) {
        harness.osc633(`E;${command}`);
        harness.osc133("C");
        vi.advanceTimersByTime(SUBSHELL_DELAY_MS * 2);
        harness.osc133("D;0");
      }

      expect(detected).not.toHaveBeenCalled();
    });

    it("watches exec-style container commands", () => {
      const detected = vi.fn();
      harness.addon.subshellDetected.on(detected);

      harness.osc633("E;docker exec -it api bash");
      harness.osc133("C");
      harness.showPrompt("root@api:/# ");
      vi.advanceTimersByTime(SUBSHELL_DELAY_MS);

      expect(detected).toHaveBeenCalledWith({
        command: "docker exec -it api bash",
        host: "api",
      });
    });

    it("does not watch a container shell command with -c", () => {
      const detected = vi.fn();
      harness.addon.subshellDetected.on(detected);

      harness.osc633("E;docker exec -it api bash -c whoami");
      harness.osc133("C");
      harness.showPrompt("root@api:/# ");
      vi.advanceTimersByTime(SUBSHELL_DELAY_MS * 2);

      expect(detected).not.toHaveBeenCalled();
    });

    it("ignores output notes when nothing is being watched", () => {
      expect(() => harness.addon.noteOutput()).not.toThrow();
    });
  });

  describe("executeCommand", () => {
    it("types the command at the prompt and resolves with its block", async () => {
      harness.osc133("A");
      harness.osc133("B");

      const execution = harness.addon.executeCommand("  npm run build  ");

      // Clears whatever was typed first, so what runs is exactly what was asked.
      expect(harness.options.write).toHaveBeenCalledWith(
        `${CLEAR_LINE}npm run build\r`,
      );

      harness.osc633("E;npm run build");
      harness.osc133("C");
      harness.osc133("D;0");

      await expect(execution).resolves.toMatchObject({
        command: "npm run build",
        exitCode: 0,
      });
    });

    it("refuses to run while the terminal is busy", async () => {
      harness.osc133("A");
      harness.osc133("B");
      harness.osc133("C");

      await expect(harness.addon.executeCommand("ls")).rejects.toThrow(
        "终端正忙",
      );
      expect(harness.options.write).not.toHaveBeenCalled();
    });

    it("refuses an empty command", async () => {
      harness.osc133("A");

      await expect(harness.addon.executeCommand("   ")).rejects.toThrow(
        "命令不能为空",
      );
    });

    it("refuses a second command while one is awaiting its block", async () => {
      harness.osc133("A");
      harness.osc133("B");
      const first = harness.addon.executeCommand("sleep 1");

      await expect(harness.addon.executeCommand("ls")).rejects.toThrow(
        "已有命令正在执行",
      );

      harness.osc133("C");
      harness.osc133("D;0");
      await first;
    });

    it("rejects a pending command when the terminal closes", async () => {
      harness.osc133("A");
      harness.osc133("B");
      const execution = harness.addon.executeCommand("sleep 100");

      harness.addon.dispose();

      await expect(execution).rejects.toThrow("终端已关闭");
    });
  });

  describe("input line", () => {
    it("reads what the user typed out of the rendered buffer", () => {
      harness.writeLines(["~/project $ git checkout main"]);
      harness.cursorTo(0);
      harness.cursorX(12);
      harness.osc133("B");
      // The cursor sits one past the last character the user typed.
      harness.cursorX(29);

      // Read from the buffer, so tab completion and history recall stay correct.
      expect(harness.addon.readInputLine()).toBe("git checkout main");
    });

    it("returns nothing before the shell reported an input position", () => {
      expect(harness.addon.readInputLine()).toBe("");
    });

    it("discards the pending line through the shell's own line kill", () => {
      harness.addon.clearInputLine();

      expect(harness.options.write).toHaveBeenCalledWith(CLEAR_LINE);
    });

  });

  it("releases its handlers and listeners on dispose", () => {
    const promptStart = vi.fn();
    harness.addon.promptStart.on(promptStart);

    harness.addon.dispose();
    harness.osc133("A");

    expect(promptStart).not.toHaveBeenCalled();
    expect(harness.oscDisposed()).toBe(true);
  });
});

describe("parseSubshellHost", () => {
  it("takes the host out of an ssh command", () => {
    expect(parseSubshellHost("ssh build@10.0.0.4")).toBe("10.0.0.4");
    expect(parseSubshellHost("ssh example.com")).toBe("example.com");
  });

  it("skips flags before the target", () => {
    expect(parseSubshellHost("ssh -p 2222 -i key host")).toBe("2222");
    expect(parseSubshellHost("ssh -A build@host")).toBe("host");
  });

  it("strips a trailing port or path", () => {
    expect(parseSubshellHost("ssh host:2222")).toBe("host");
  });

  it("skips container verbs to reach the target", () => {
    expect(parseSubshellHost("docker exec -it api bash")).toBe("api");
    expect(parseSubshellHost("kubectl exec pod-1 -- sh")).toBe("pod-1");
  });

  it("returns nothing when there is no target", () => {
    expect(parseSubshellHost("ssh")).toBe("");
  });
});

function setup(options: { maxOutputLines?: number } = {}) {
  const write = vi.fn();
  const oscHandlers = new Map<number, (payload: string) => boolean>();
  const oscDisposables: { dispose: ReturnType<typeof vi.fn> }[] = [];
  const markers: { line: number; disposed: boolean }[] = [];
  let lines: string[] = [];
  let cursorY = 0;
  let cursorX = 0;

  const terminal = {
    rows: 24,
    parser: {
      registerOscHandler: vi.fn(
        (ident: number, handler: (payload: string) => boolean) => {
          oscHandlers.set(ident, handler);
          const disposable = { dispose: vi.fn() };
          oscDisposables.push(disposable);
          return disposable;
        },
      ),
    },
    registerMarker: vi.fn(() => {
      const marker = {
        line: cursorY,
        disposed: false,
        dispose() {
          this.disposed = true;
        },
      };
      markers.push(marker);
      return marker;
    }),
    buffer: {
      active: {
        baseY: 0,
        get cursorX() {
          return cursorX;
        },
        get cursorY() {
          return cursorY;
        },
        getLine(row: number) {
          const text = lines[row];
          if (text === undefined) return undefined;
          return {
            isWrapped: false,
            translateToString(
              _trimRight?: boolean,
              start?: number,
              end?: number,
            ) {
              return text.slice(start ?? 0, end);
            },
          };
        },
      },
    },
  };

  const addon = new ShellIntegrationAddon({ write, ...options });
  addon.activate(terminal as never);

  const dispatch = (ident: number, payload: string) =>
    oscHandlers.get(ident)?.(payload) ?? false;

  return {
    addon,
    options: { write },
    dispatch,
    osc133: (payload: string) => dispatch(133, payload),
    osc633: (payload: string) => dispatch(633, payload),
    setCwd: (cwd: string) => addon.setCwd(cwd),
    cursorTo(line: number) {
      cursorY = line;
    },
    cursorX(column: number) {
      cursorX = column;
    },
    /**
     * Puts a plain (marker-less) shell prompt on the cursor line.
     *
     * Subshell detection requires seeing one: settled output on its own is also
     * what `ssh` looks like while it waits for a password.
     */
    showPrompt(text = "root@host ~ # ") {
      lines = [text];
      cursorY = 0;
      cursorX = text.length;
    },
    writeLines(next: string[]) {
      lines = next;
    },
    /** Simulates scrollback trimming, which shifts every marker's row down. */
    trimScrollback(rows: number) {
      for (const marker of markers) {
        marker.line -= rows;
      }
    },
    disposeMarkersBefore(line: number) {
      for (const marker of markers) {
        if (marker.line < line) {
          marker.line = -1;
        }
      }
    },
    disposedMarkerCount() {
      return markers.filter((marker) => marker.disposed).length;
    },
    oscDisposed() {
      return oscDisposables.every((disposable) => disposable.dispose.mock.calls.length > 0);
    },
    collectBlocks() {
      const blocks: TerminalCommandBlock[] = [];
      addon.commandFinish.on((block) => blocks.push(block));
      return blocks;
    },
    runCommand(command: string, exitCode: number | null) {
      dispatch(133, "A");
      dispatch(133, "B");
      dispatch(633, `E;${command}`);
      dispatch(133, "C");
      dispatch(133, exitCode === null ? "D" : `D;${exitCode}`);
    },
  };
}
