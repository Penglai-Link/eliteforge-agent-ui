// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BlockAddon } from "./blocks";
import type { BlockAddonOptions } from "../types/blocks";
import type { TerminalCommandBlock } from "../types/shellIntegration";

const CELL_HEIGHT = 18;
const VIEWPORT_HEIGHT = 480;

describe("BlockAddon", () => {
  let harness: ReturnType<typeof setup>;

  beforeEach(() => {
    harness = setup();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("frames", () => {
    it("frames the block across every row it occupies", () => {
      harness.addon.addBlock(block({ startLine: 4, endLine: 9 }));

      expect(harness.terminal.registerDecoration).toHaveBeenCalledWith(
        expect.objectContaining({
          height: 6,
          width: 80,
          // Beneath the text, so xterm still renders the output itself.
          layer: "bottom",
          x: 0,
        }),
      );
    });

    it("frames a single-row block", () => {
      harness.addon.addBlock(block({ startLine: 4, endLine: 4 }));

      expect(harness.terminal.registerDecoration).toHaveBeenCalledWith(
        expect.objectContaining({ height: 1 }),
      );
    });

    it("marks a failed command so it stands out", () => {
      harness.addon.addBlock(block({ exitCode: 1 }));

      const element = harness.lastDecorationElement();
      expect(element?.classList.contains("ai-terminal-block")).toBe(true);
      expect(element?.classList.contains("ai-terminal-block--failed")).toBe(true);
    });

    it("does not mark a successful command as failed", () => {
      harness.addon.addBlock(block({ exitCode: 0 }));

      expect(
        harness.lastDecorationElement()?.classList.contains(
          "ai-terminal-block--failed",
        ),
      ).toBe(false);
    });

    it("does not mark an unknown status as failed", () => {
      // A killed foreground job reports no status; that is not a failure.
      harness.addon.addBlock(block({ exitCode: null }));

      expect(
        harness.lastDecorationElement()?.classList.contains(
          "ai-terminal-block--failed",
        ),
      ).toBe(false);
    });

    it("keeps the frame from swallowing selection and clicks", () => {
      harness.addon.addBlock(block());

      expect(harness.lastDecorationElement()?.style.pointerEvents).toBe("none");
    });

    it("repaints when xterm re-renders the decoration", () => {
      harness.addon.addBlock(block({ exitCode: 2 }));

      const repainted = document.createElement("div");
      harness.rerenderLastDecoration(repainted);

      expect(repainted.classList.contains("ai-terminal-block--failed")).toBe(true);
    });

    it("skips a block whose rows were already trimmed from the scrollback", () => {
      harness.addon.addBlock(block({ startLine: -1, endLine: -1 }));

      expect(harness.terminal.registerDecoration).not.toHaveBeenCalled();
    });

    it("skips a block with no marker to anchor to", () => {
      const orphan = block();
      orphan.promptMarker = undefined;
      orphan.outputMarker = undefined;

      harness.addon.addBlock(orphan);

      expect(harness.terminal.registerDecoration).not.toHaveBeenCalled();
    });

    it("anchors to the output marker when there was no prompt marker", () => {
      const adopted = block({ startLine: 3, endLine: 5 });
      adopted.promptMarker = undefined;

      harness.addon.addBlock(adopted);

      expect(harness.terminal.registerDecoration).toHaveBeenCalledWith(
        expect.objectContaining({ marker: adopted.outputMarker }),
      );
    });

    it("releases frames beyond the render limit", () => {
      harness = setup({ maxRenderedBlocks: 2 });

      harness.addon.addBlock(block({ id: "a" }));
      harness.addon.addBlock(block({ id: "b" }));
      harness.addon.addBlock(block({ id: "c" }));

      expect(harness.disposedDecorationCount()).toBe(1);
    });
  });

  describe("explain buttons", () => {
    it("anchors a normal command button after the echoed command", () => {
      const normalBlock = block({ startLine: 1, endLine: 4 });

      harness.addon.addExplainButton(normalBlock);

      expect(harness.terminal.registerDecoration).toHaveBeenCalledWith(
        expect.objectContaining({
          marker: normalBlock.commandMarker,
          x: 13,
        }),
      );
    });

    it("does not match a short command inside the shell prompt", () => {
      const shortCommand = block({
        command: "ll",
        commandStartColumn: 18,
        startLine: 3,
        endLine: 5,
      });

      harness.addon.addExplainButton(shortCommand);

      expect(harness.terminal.registerDecoration).toHaveBeenCalledWith(
        expect.objectContaining({
          marker: shortCommand.commandMarker,
          x: 20,
        }),
      );
    });

    it("does not render a button for the outer SSH command", () => {
      const sshBlock = block({
        id: "ssh-root",
        startLine: 2,
        endLine: 6,
        command: "ssh root@47.94.174.122",
      });

      harness.addon.addExplainButton(sshBlock);

      expect(harness.terminal.registerDecoration).not.toHaveBeenCalled();
    });

    it("does not render a button when the marker row identifies SSH", () => {
      const blockWithStaleCommand = block({
        id: "ssh-stale",
        startLine: 2,
        endLine: 6,
        command: "remote-session",
      });

      harness.addon.addExplainButton(blockWithStaleCommand);

      expect(harness.terminal.registerDecoration).not.toHaveBeenCalled();
    });

    it("does not render a button for a block without a reported command", () => {
      const emptyCommandBlock = block({
        id: "empty-command",
        command: "",
      });

      harness.addon.addExplainButton(emptyCommandBlock);

      expect(harness.terminal.registerDecoration).not.toHaveBeenCalled();
    });
  });

  describe("hover", () => {
    it("reveals the action bar over the hovered block", () => {
      harness.addon.addBlock(block({ startLine: 2, endLine: 5 }));

      harness.hoverRow(3);

      expect(harness.actionBarVisible()).toBe(true);
      expect(harness.actionBarTop()).toBe(`${2 * CELL_HEIGHT}px`);
    });

    it("reuses one action bar rather than one per block", () => {
      harness.addon.addBlock(block({ id: "a", startLine: 0, endLine: 2 }));
      harness.addon.addBlock(block({ id: "b", startLine: 3, endLine: 5 }));

      harness.hoverRow(1);
      harness.hoverRow(4);

      // Hundreds of commands must not accumulate hundreds of button groups.
      expect(
        harness.container.querySelectorAll(".ai-terminal-block-actions"),
      ).toHaveLength(1);
    });

    it("prefers the newest block when ranges overlap", () => {
      harness.addon.addBlock(block({ id: "old", startLine: 0, endLine: 6 }));
      harness.addon.addBlock(block({ id: "new", startLine: 4, endLine: 6 }));
      harness.options.onRerun.mockClear();

      harness.hoverRow(5);
      harness.click("blockRerun");

      expect(harness.options.onRerun).toHaveBeenCalledWith("cmd-new");
    });

    it("hides the bar over a row that belongs to no block", () => {
      harness.addon.addBlock(block({ startLine: 2, endLine: 5 }));
      harness.hoverRow(3);

      harness.hoverRow(9);

      expect(harness.actionBarVisible()).toBe(false);
    });

    it("hides the bar when the pointer leaves the terminal", () => {
      harness.addon.addBlock(block({ startLine: 2, endLine: 5 }));
      harness.hoverRow(3);

      harness.container.dispatchEvent(
        new Event("pointerleave", { bubbles: false }),
      );

      expect(harness.actionBarVisible()).toBe(false);
    });

    it("hides the bar when the pointer moves outside the grid", () => {
      harness.addon.addBlock(block({ startLine: 2, endLine: 5 }));
      harness.hoverRow(3);

      harness.pointerAt(VIEWPORT_HEIGHT + 40);

      expect(harness.actionBarVisible()).toBe(false);
    });

    it("accounts for scrollback when mapping a pointer to a row", () => {
      harness.addon.addBlock(block({ startLine: 120, endLine: 124 }));
      harness.scrollTo(118);

      // Two rows down the viewport is buffer row 120.
      harness.pointerAt(2 * CELL_HEIGHT + 2);

      expect(harness.actionBarVisible()).toBe(true);
    });

    it("hides the bar once the block scrolls out of view", () => {
      harness.addon.addBlock(block({ startLine: 2, endLine: 5 }));
      harness.hoverRow(3);

      harness.scrollTo(40);

      expect(harness.actionBarVisible()).toBe(false);
    });

    it("follows the block while it is still on screen", () => {
      harness.addon.addBlock(block({ startLine: 10, endLine: 14 }));
      harness.hoverRow(11);

      harness.scrollTo(8);

      expect(harness.actionBarVisible()).toBe(true);
      expect(harness.actionBarTop()).toBe(`${2 * CELL_HEIGHT}px`);
    });

    it("hides the bar on resize, where every row moves", () => {
      harness.addon.addBlock(block({ startLine: 2, endLine: 5 }));
      harness.hoverRow(3);

      harness.resize();

      expect(harness.actionBarVisible()).toBe(false);
    });

    it("hides the bar when the hovered block is evicted", () => {
      harness = setup({ maxRenderedBlocks: 1 });
      harness.addon.addBlock(block({ id: "a", startLine: 0, endLine: 2 }));
      harness.hoverRow(1);

      harness.addon.addBlock(block({ id: "b", startLine: 3, endLine: 5 }));

      expect(harness.actionBarVisible()).toBe(false);
    });
  });

  describe("actions", () => {
    it("shows only the actions the host wired up", () => {
      harness = setup({ onExplain: undefined, onAskAgent: undefined });
      harness.addon.addBlock(block());
      harness.hoverRow(1);

      const labels = harness.actionLabels();
      expect(labels).toContain(harness.label("blockCopy"));
      expect(labels).toContain(harness.label("blockRerun"));
      expect(labels).not.toContain(harness.label("blockExplain"));
      expect(labels).not.toContain(harness.label("blockAsk"));
    });

    it("shows the exit code on a failed block", () => {
      harness.addon.addBlock(block({ exitCode: 127, startLine: 0, endLine: 2 }));
      harness.hoverRow(1);

      const status = harness.container.querySelector(
        ".ai-terminal-block-actions__status",
      );
      expect(status?.textContent).toContain("127");
    });

    it("sends the command and its output to the agent", () => {
      harness.addon.addBlock(block({ id: "x", startLine: 0, endLine: 2 }));
      harness.hoverRow(1);

      harness.click("blockAsk");

      expect(harness.options.onAskAgent).toHaveBeenCalledWith(
        expect.objectContaining({ id: "x" }),
      );
    });

    it("re-runs the block's command", () => {
      harness.addon.addBlock(block({ startLine: 0, endLine: 2 }));
      harness.hoverRow(1);

      harness.click("blockRerun");

      expect(harness.options.onRerun).toHaveBeenCalledWith("cmd-block-1");
    });

    it("copies the command together with its output", async () => {
      const writeText = vi.fn(() => Promise.resolve());
      vi.stubGlobal("navigator", { clipboard: { writeText } });
      harness.addon.addBlock(block({ startLine: 0, endLine: 2 }));
      harness.hoverRow(1);

      harness.click("blockCopy");
      await vi.waitFor(() => expect(writeText).toHaveBeenCalled());

      expect(writeText).toHaveBeenCalledWith("cmd-block-1\noutput text");
    });

    it("confirms the copy and then restores the label", async () => {
      vi.stubGlobal("navigator", {
        clipboard: { writeText: () => Promise.resolve() },
      });
      vi.useFakeTimers();
      harness.addon.addBlock(block({ startLine: 0, endLine: 2 }));
      harness.hoverRow(1);

      harness.click("blockCopy");
      await vi.waitFor(() =>
        expect(harness.actionLabels()).toContain(harness.label("blockCopied")),
      );

      vi.advanceTimersByTime(1_200);
      expect(harness.actionLabels()).toContain(harness.label("blockCopy"));
    });

    it("survives a clipboard the browser refused", async () => {
      const writeText = vi.fn(() => Promise.reject(new Error("denied")));
      vi.stubGlobal("navigator", { clipboard: { writeText } });
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
      harness.addon.addBlock(block({ startLine: 0, endLine: 2 }));
      harness.hoverRow(1);

      harness.click("blockCopy");
      await vi.waitFor(() => expect(consoleWarn).toHaveBeenCalled());

      expect(harness.actionLabels()).toContain(harness.label("blockCopy"));
      consoleWarn.mockRestore();
    });

    it("streams an explanation of the block's output", async () => {
      harness.addon.addBlock(block({ startLine: 0, endLine: 2 }));
      harness.hoverRow(1);

      harness.click("blockExplain");
      await vi.waitFor(() => expect(harness.options.onExplain).toHaveBeenCalled());

      expect(harness.options.onExplain).toHaveBeenCalledWith(
        { command: "cmd-block-1", output: "output text" },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("ignores an action once nothing is hovered", () => {
      harness.addon.addBlock(block({ startLine: 0, endLine: 2 }));
      harness.hoverRow(1);
      const rerun = harness.button("blockRerun");
      harness.hoverRow(20);

      rerun?.click();

      expect(harness.options.onRerun).not.toHaveBeenCalled();
    });

    it("keeps a drag over the bar from selecting terminal text", () => {
      harness.addon.addBlock(block({ startLine: 0, endLine: 2 }));
      harness.hoverRow(1);
      const event = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
      });
      const bubbled = vi.fn();
      harness.container.addEventListener("mousedown", bubbled);

      harness.actionBar()?.dispatchEvent(event);

      expect(bubbled).not.toHaveBeenCalled();
    });
  });

  it("releases frames, listeners and the bar on dispose", () => {
    harness.addon.addBlock(block());

    harness.addon.dispose();

    expect(harness.disposedDecorationCount()).toBe(1);
    expect(harness.actionBar()).toBeNull();
    expect(harness.scrollDisposable.dispose).toHaveBeenCalled();
    expect(harness.resizeDisposable.dispose).toHaveBeenCalled();
  });
});

let blockSequence = 0;

function block(
  overrides: Partial<
    Pick<
      TerminalCommandBlock,
      | "id"
      | "command"
      | "exitCode"
      | "startLine"
      | "endLine"
      | "commandStartColumn"
    >
  > = {},
): TerminalCommandBlock {
  blockSequence += 1;
  const id = overrides.id ?? `block-${blockSequence}`;

  return {
    id,
    command: overrides.command ?? `cmd-${id}`,
    exitCode: overrides.exitCode ?? 0,
    cwd: "/workspace",
    commandStartColumn: overrides.commandStartColumn ?? 2,
    promptMarker: { line: overrides.startLine ?? 0 } as never,
    commandMarker: { line: overrides.startLine ?? 0 } as never,
    outputMarker: { line: (overrides.startLine ?? 0) + 1 } as never,
    endMarker: { line: overrides.endLine ?? 2 } as never,
    startLine: overrides.startLine ?? 0,
    endLine: overrides.endLine ?? 2,
    readOutput: () => "output text",
  };
}

function setup(overrides: Partial<BlockAddonOptions> = {}) {
  blockSequence = 0;
  const decorations: {
    options: Record<string, unknown>;
    element: HTMLElement;
    dispose: ReturnType<typeof vi.fn>;
    render?: (element: HTMLElement) => void;
  }[] = [];

  const container = document.createElement("div");
  const screen = document.createElement("div");
  screen.className = "xterm-screen";
  container.appendChild(screen);
  document.body.appendChild(container);
  Object.defineProperty(container, "clientWidth", { value: 720 });
  Object.defineProperty(container, "clientHeight", { value: VIEWPORT_HEIGHT });
  screen.getBoundingClientRect = () =>
    ({ top: 0, left: 0, height: VIEWPORT_HEIGHT, width: 720 }) as DOMRect;

  const scrollDisposable = { dispose: vi.fn() };
  const resizeDisposable = { dispose: vi.fn() };
  let onScroll: (() => void) | undefined;
  let onResize: (() => void) | undefined;
  let viewportY = 0;

  const terminal = {
    cols: 80,
    rows: 24,
    element: container,
    _core: {
      _renderService: {
        dimensions: { css: { cell: { width: 9, height: CELL_HEIGHT } } },
      },
    },
    buffer: {
      active: {
        length: 200,
        getLine: (line: number) => ({
          translateToString: () => {
            if (line === 1) {
              return "$ cmd-block-1";
            }
            if (line === 2) {
              return "$ ssh root@47.94.174.122";
            }
            if (line === 3) {
              return "$ feature/scroll) ll";
            }
            return "";
          },
        }),
        get viewportY() {
          return viewportY;
        },
      },
    },
    registerDecoration: vi.fn((options: Record<string, unknown>) => {
      const element = document.createElement("div");
      const entry = { options, element, dispose: vi.fn(), render: undefined };
      decorations.push(entry);
      return {
        element,
        dispose: entry.dispose,
        onRender: (listener: (element: HTMLElement) => void) => {
          entry.render = listener as never;
          return { dispose: vi.fn() };
        },
      };
    }),
    onScroll: vi.fn((listener: () => void) => {
      onScroll = listener;
      return scrollDisposable;
    }),
    onResize: vi.fn((listener: () => void) => {
      onResize = listener;
      return resizeDisposable;
    }),
  };

  // Kept separate from `overrides` so the spread does not widen the mock types.
  const options = {
    onExplain: vi.fn(() => Promise.resolve("explanation")),
    onAskAgent: vi.fn(),
    onRerun: vi.fn((_command: string) => {}),
  };

  const addon = new BlockAddon({
    ...options,
    ...overrides,
  } as BlockAddonOptions);
  addon.activate(terminal as never);

  const actionBar = () =>
    container.querySelector<HTMLElement>(".ai-terminal-block-actions");
  const buttons = () =>
    Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        ".ai-terminal-block-actions__button",
      ),
    );
  const labels: Record<string, string> = {
    blockExplain: "解释输出",
    blockAsk: "追问 AI",
    blockCopy: "复制",
    blockCopied: "已复制",
    blockRerun: "重跑",
  };

  const pointerAt = (offsetY: number) => {
    screen.dispatchEvent(
      new MouseEvent("pointermove", { clientY: offsetY, bubbles: true }),
    );
  };

  return {
    addon,
    container,
    options,
    resizeDisposable,
    scrollDisposable,
    terminal,
    actionBar,
    actionBarVisible: () => actionBar()?.hidden === false,
    actionBarTop: () =>
      actionBar()?.style.getPropertyValue("--ai-terminal-block-actions-top"),
    actionLabels: () => buttons().map((button) => button.textContent?.trim()),
    label: (key: keyof typeof labels) => labels[key],
    button: (key: keyof typeof labels) =>
      buttons().find((candidate) => candidate.textContent?.trim() === labels[key]),
    click(key: keyof typeof labels) {
      const target = buttons().find(
        (candidate) => candidate.textContent?.trim() === labels[key],
      );
      if (!target) {
        throw new Error(`No ${key} action on the bar`);
      }
      target.click();
    },
    pointerAt,
    hoverRow(row: number) {
      pointerAt((row - viewportY) * CELL_HEIGHT + 2);
    },
    scrollTo(next: number) {
      viewportY = next;
      onScroll?.();
    },
    resize() {
      onResize?.();
    },
    lastDecorationElement: () => decorations.at(-1)?.element,
    rerenderLastDecoration(element: HTMLElement) {
      decorations.at(-1)?.render?.(element);
    },
    disposedDecorationCount: () =>
      decorations.filter((entry) => entry.dispose.mock.calls.length > 0).length,
  };
}
