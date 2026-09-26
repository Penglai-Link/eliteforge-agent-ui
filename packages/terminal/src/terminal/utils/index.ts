import { Terminal as XTerminal } from "@xterm/xterm";
import type { CellMetrics } from "../types/common";

export function getTerminalCellMetrics(terminal: XTerminal): CellMetrics {
  const core = terminal as XTerminal & {
    _core?: {
      _renderService?: {
        dimensions?: {
          css?: {
            cell?: CellMetrics;
          };
        };
      };
    };
  };

  const width = core._core?._renderService?.dimensions?.css?.cell?.width;
  const height = core._core?._renderService?.dimensions?.css?.cell?.height;

  if (width && height) {
    return { width, height };
  }

  return {
    width: 9,
    height: 18,
  };
}

export interface TerminalElementInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Reads the xterm element padding used to inset terminal text and overlays. */
export function getTerminalElementInsets(element: HTMLElement): TerminalElementInsets {
  if (typeof window === "undefined") {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const style = window.getComputedStyle(element);
  return {
    top: parseCssPixels(style.paddingTop),
    right: parseCssPixels(style.paddingRight),
    bottom: parseCssPixels(style.paddingBottom),
    left: parseCssPixels(style.paddingLeft),
  };
}

function parseCssPixels(value: string) {
  const pixels = Number.parseFloat(value);
  return Number.isFinite(pixels) ? pixels : 0;
}

export function normalizeTerminalOutput(output: string) {
  return output.replace(/\r?\n/g, "\r\n");
}

export function hasVisibleTerminalOutput(output: string) {
  const text = output
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
    .replace(/(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001B[@-_]/g, "");

  return text.trim().length > 0;
}

export function writeTerminalAsync(terminal: XTerminal, data: string) {
  return new Promise<void>((resolve) => {
    terminal.write(data, resolve);
  });
}

export function isControlCharacter(data: string) {
  return data.length === 1 && data.charCodeAt(0) < 32 && data !== "\t";
}

/**
 * Reads plain text out of the terminal buffer between two absolute rows.
 *
 * Wrapped rows are joined back into one logical line, so the result matches what
 * the user sees rather than how xterm stored it. Used to recover command output
 * for the AI without keeping a second copy of every byte in memory.
 */
export function readTerminalLines(
  terminal: XTerminal,
  startLine: number,
  endLine: number,
  maxLines = Number.POSITIVE_INFINITY,
) {
  const buffer = terminal.buffer.active;
  const start = Math.max(0, startLine);
  const end = Math.min(endLine, buffer.baseY + terminal.rows - 1);
  if (end < start) {
    return "";
  }

  const lines: string[] = [];
  for (let row = start; row <= end; row += 1) {
    const line = buffer.getLine(row);
    if (!line) continue;

    const content = line.translateToString(true).replace(/\s+$/, "");
    if (line.isWrapped && lines.length > 0) {
      lines[lines.length - 1] += content;
    } else {
      lines.push(content);
    }
  }

  // Keep the tail: the end of a long output is what explains a failure.
  const kept = Number.isFinite(maxLines) ? lines.slice(-maxLines) : lines;
  return kept.join("\n").replace(/^\n+|\n+$/g, "");
}

export interface TerminalBufferPosition {
  line: number;
  column: number;
}

/**
 * Reads the text between two buffer positions.
 *
 * Rows are concatenated without separators because a long shell input line wraps
 * across rows but is still one logical line. This is how the typed command is
 * recovered: reading what the shell actually rendered stays correct through tab
 * completion, history recall and cursor movement, none of which a keystroke
 * mirror could follow.
 */
export function readTerminalRange(
  terminal: XTerminal,
  start: TerminalBufferPosition,
  end: TerminalBufferPosition,
) {
  const buffer = terminal.buffer.active;
  if (
    start.line < 0 ||
    end.line < start.line ||
    (end.line === start.line && end.column <= start.column)
  ) {
    return "";
  }

  let text = "";
  for (let row = start.line; row <= end.line; row += 1) {
    const line = buffer.getLine(row);
    if (!line) continue;

    const from = row === start.line ? start.column : 0;
    const to = row === end.line ? end.column : undefined;
    text += line.translateToString(false, from, to);
  }

  return text.trimEnd();
}

/** Minimal typed event emitter, shaped like xterm's own disposable listeners. */
export class TerminalEventEmitter<T> {
  private readonly listeners = new Set<(value: T) => void>();

  on(listener: (value: T) => void) {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  fire(value: T) {
    for (const listener of [...this.listeners]) {
      try {
        listener(value);
      } catch (error) {
        console.error("Terminal event listener failed", error);
      }
    }
  }

  clear() {
    this.listeners.clear();
  }
}
