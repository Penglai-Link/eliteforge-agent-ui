import { describe, expect, it } from "vitest";

import {
  decodeOscValue,
  parseCommandLine,
  parseCwd,
  parseSemanticPrompt,
} from "./oscParser";

describe("parseSemanticPrompt", () => {
  it("parses the four command lifecycle markers", () => {
    expect(parseSemanticPrompt("A")).toEqual({ kind: "prompt-start" });
    expect(parseSemanticPrompt("B")).toEqual({ kind: "command-start" });
    expect(parseSemanticPrompt("C")).toEqual({ kind: "output-start" });
    expect(parseSemanticPrompt("D;0")).toEqual({
      kind: "command-end",
      exitCode: 0,
    });
  });

  it("keeps a non-zero exit code so the block can be marked failed", () => {
    expect(parseSemanticPrompt("D;127")).toEqual({
      kind: "command-end",
      exitCode: 127,
    });
  });

  it("reports an unknown status when the shell omits the exit code", () => {
    // A killed foreground job can end without the shell reporting a status.
    expect(parseSemanticPrompt("D")).toEqual({
      kind: "command-end",
      exitCode: null,
    });
    expect(parseSemanticPrompt("D;")).toEqual({
      kind: "command-end",
      exitCode: null,
    });
    expect(parseSemanticPrompt("D;not-a-number")).toEqual({
      kind: "command-end",
      exitCode: null,
    });
  });

  it("ignores subcommands it does not implement", () => {
    // Other shells emit 133;P and 133;L; they must not disturb the state machine.
    expect(parseSemanticPrompt("P;k=i")).toBeNull();
    expect(parseSemanticPrompt("L")).toBeNull();
    expect(parseSemanticPrompt("")).toBeNull();
  });

  it("tolerates extra parameters after the exit code", () => {
    expect(parseSemanticPrompt("D;1;extra")).toEqual({
      kind: "command-end",
      exitCode: 1,
    });
  });
});

describe("parseCommandLine", () => {
  it("reads the command the shell is about to run", () => {
    expect(parseCommandLine("E;git status")).toBe("git status");
  });

  it("restores separators the script escaped", () => {
    // `;` must be escaped or it would split the OSC payload itself.
    expect(parseCommandLine("E;ls \\x3b echo done")).toBe("ls ; echo done");
    expect(parseCommandLine("E;grep '\\\\d' file")).toBe("grep '\\d' file");
  });

  it("keeps an empty command distinguishable from no report", () => {
    expect(parseCommandLine("E;")).toBe("");
    expect(parseCommandLine("A")).toBeNull();
    expect(parseCommandLine("")).toBeNull();
  });

  it("preserves non-ASCII command text", () => {
    expect(parseCommandLine("E;echo 你好")).toBe("echo 你好");
  });
});

describe("parseCwd", () => {
  it("parses the file URL the integration script emits", () => {
    expect(parseCwd("file://host/workspace/project")).toBe(
      "/workspace/project",
    );
  });

  it("parses a file URL with no host", () => {
    expect(parseCwd("file:///workspace/project")).toBe("/workspace/project");
  });

  it("decodes percent escapes in the path", () => {
    expect(parseCwd("file://host/work%20space/%E9%A1%B9%E7%9B%AE")).toBe(
      "/work space/项目",
    );
  });

  it("keeps a malformed escape rather than losing cwd tracking", () => {
    expect(parseCwd("file://host/bad%path")).toBe("/bad%path");
  });

  it("accepts a bare absolute path from third-party shell configs", () => {
    expect(parseCwd("/workspace/project")).toBe("/workspace/project");
  });

  it("rejects payloads that are not a path", () => {
    expect(parseCwd("")).toBeNull();
    expect(parseCwd("   ")).toBeNull();
    expect(parseCwd("relative/path")).toBeNull();
    expect(parseCwd("file://host")).toBeNull();
  });
});

describe("decodeOscValue", () => {
  it("leaves ordinary text untouched", () => {
    expect(decodeOscValue("npm run build")).toBe("npm run build");
  });

  it("handles a trailing lone backslash without dropping it", () => {
    expect(decodeOscValue("echo \\")).toBe("echo \\");
  });

  it("does not treat an unknown escape as a separator", () => {
    expect(decodeOscValue("echo \\n")).toBe("echo \\n");
  });

  it("decodes consecutive escapes independently", () => {
    expect(decodeOscValue("a\\x3b\\x3bb")).toBe("a;;b");
    expect(decodeOscValue("\\\\\\x3b")).toBe("\\;");
  });
});
