/**
 * Parsers for the shell integration escape sequences.
 *
 * The shell reports where prompts, commands and output begin and end, which is
 * what lets the client group the raw PTY stream into command blocks. Keeping the
 * parsing in pure functions makes the state machine in `ShellIntegrationAddon`
 * testable without a terminal.
 *
 * Sequences (payloads arrive without the `ESC ]` prefix and terminator):
 *   OSC 133 ; A              prompt start
 *   OSC 133 ; B              prompt end, command input starts
 *   OSC 133 ; C              command output starts
 *   OSC 133 ; D [; exit]     command finished
 *   OSC 633 ; E ; <line>     command line that is about to run
 *   OSC 7  ; file://<host><path>   working directory
 */

export const SEMANTIC_PROMPT_OSC = 133;
export const COMMAND_LINE_OSC = 633;
export const CWD_OSC = 7;

export type SemanticPromptEvent =
  | { kind: "prompt-start" }
  | { kind: "command-start" }
  | { kind: "output-start" }
  | { kind: "command-end"; exitCode: number | null };

/** Parses an `OSC 133` payload. Unknown subcommands are ignored. */
export function parseSemanticPrompt(payload: string): SemanticPromptEvent | null {
  const [subcommand, ...parameters] = payload.split(";");

  switch (subcommand) {
    case "A":
      return { kind: "prompt-start" };
    case "B":
      return { kind: "command-start" };
    case "C":
      return { kind: "output-start" };
    case "D":
      return { kind: "command-end", exitCode: parseExitCode(parameters[0]) };
    default:
      return null;
  }
}

/** Parses the command line out of an `OSC 633 ; E ; <line>` payload. */
export function parseCommandLine(payload: string): string | null {
  if (!payload.startsWith("E;")) {
    return null;
  }

  return decodeOscValue(payload.slice(2));
}

/**
 * Parses an `OSC 7` payload into a filesystem path.
 *
 * Accepts the `file://host/path` form emitted by the integration script as well
 * as a bare path, which some third-party shell configurations report instead.
 */
export function parseCwd(payload: string): string | null {
  const value = payload.trim();
  if (!value) {
    return null;
  }

  if (!value.startsWith("file://")) {
    return value.startsWith("/") ? decodePath(value) : null;
  }

  const withoutScheme = value.slice("file://".length);
  const pathStart = withoutScheme.indexOf("/");
  if (pathStart === -1) {
    return null;
  }

  return decodePath(withoutScheme.slice(pathStart));
}

/**
 * Reverses the escaping the integration script applies before embedding a
 * command line in an OSC payload: `\` becomes `\\` and `;` becomes `\x3b`.
 */
export function decodeOscValue(value: string) {
  let decoded = "";

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "\\") {
      decoded += value[index];
      continue;
    }

    const next = value[index + 1];
    if (next === "\\") {
      decoded += "\\";
      index += 1;
      continue;
    }
    if (value.startsWith("x3b", index + 1) || value.startsWith("x3B", index + 1)) {
      decoded += ";";
      index += 3;
      continue;
    }

    decoded += "\\";
  }

  return decoded;
}

function parseExitCode(value: string | undefined) {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  const exitCode = Number.parseInt(value, 10);
  return Number.isNaN(exitCode) ? null : exitCode;
}

function decodePath(path: string) {
  try {
    return decodeURIComponent(path);
  } catch {
    // A malformed percent escape must not break cwd tracking.
    return path;
  }
}
