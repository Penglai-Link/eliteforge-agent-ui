import type { AIStreamEvent, TerminalSession } from "./types";

export type TerminalMessageType =
  | "TEXT_MESSAGE_START"
  | "TEXT_MESSAGE_CONTENT"
  | "TEXT_MESSAGE_END"
  | "TEXT_MESSAGE_ERROR"
  | "TEXT_MESSAGE_SUGGESTION";

export interface TerminalMessage {
  currentDirectory?: string;
  delta: string;
  messageId: string;
  timestamp: number;
  type: TerminalMessageType;
}

const TERMINAL_MESSAGE_TYPES = new Set<TerminalMessageType>([
  "TEXT_MESSAGE_START",
  "TEXT_MESSAGE_CONTENT",
  "TEXT_MESSAGE_END",
  "TEXT_MESSAGE_ERROR",
  "TEXT_MESSAGE_SUGGESTION",
]);

export function parseTerminalMessage(
  value: unknown,
): TerminalMessage | undefined {
  if (
    !isRecord(value) ||
    typeof value.delta !== "string" ||
    typeof value.messageId !== "string" ||
    !value.messageId ||
    typeof value.timestamp !== "number" ||
    !Number.isFinite(value.timestamp) ||
    typeof value.type !== "string" ||
    !TERMINAL_MESSAGE_TYPES.has(value.type as TerminalMessageType) ||
    (value.currentDirectory !== undefined &&
      (typeof value.currentDirectory !== "string" || !value.currentDirectory))
  ) {
    return undefined;
  }

  return value as unknown as TerminalMessage;
}

export function parseAIStreamEvent(
  value: unknown,
): AIStreamEvent | undefined {
  if (
    !isRecord(value) ||
    typeof value.type !== "string" ||
    !value.type.trim()
  ) {
    return undefined;
  }

  return value as AIStreamEvent;
}

export type TerminalSessionResponse =
  | { session: TerminalSession; error?: never }
  | { session?: never; error: string };

/**
 * Parses a `terminal:session` payload, which either describes the PTY that was
 * opened or reports why it could not be opened.
 */
export function parseTerminalSession(
  value: unknown,
): TerminalSessionResponse | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.error === "string") {
    return value.error ? { error: value.error } : undefined;
  }

  if (
    typeof value.currentDirectory !== "string" ||
    !value.currentDirectory ||
    typeof value.shell !== "string" ||
    typeof value.supportsBlocks !== "boolean" ||
    typeof value.subshellBootstrap !== "string"
  ) {
    return undefined;
  }

  return {
    session: {
      currentDirectory: value.currentDirectory,
      shell: value.shell,
      supportsBlocks: value.supportsBlocks,
      subshellBootstrap: value.subshellBootstrap,
    },
  };
}

/** Parses a `terminal:output` payload carrying raw PTY bytes as text. */
export function parseTerminalOutput(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.data !== "string") {
    return undefined;
  }

  return value.data;
}

/** Parses a `terminal:exit` payload. A missing code means the shell was killed. */
export function parseTerminalExit(value: unknown): { exitCode: number | null } | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const exitCode = value.exitCode;
  if (exitCode === null || exitCode === undefined) {
    return { exitCode: null };
  }

  return typeof exitCode === "number" && Number.isFinite(exitCode)
    ? { exitCode }
    : undefined;
}

export function createMessageId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
