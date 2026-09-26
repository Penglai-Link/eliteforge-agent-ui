import { describe, expect, it } from "vitest";

import { TerminalCommandDetector } from "./terminalCommandDetector";

describe("TerminalCommandDetector", () => {
  it.each([
    "find a big",
    "ls",
    "ls -la",
    "find . -name '*.log'",
    "git status",
    "npm run build",
    "printf ok | sed s/o/O/",
    "SELECT * FROM users",
  ])("keeps command-shaped input in the shell: %s", (input) => {
    expect(TerminalCommandDetector.shouldTriggerAgentMode("", input)).toBe(
      false,
    );
  });

  it.each([
    "find a big file",
    "find a big file in current directory",
    "find the largest files in the current directory",
    "how do I create a directory",
    "please explain this output",
    "帮我查找当前目录的大文件",
  ])("routes natural-language input to the agent: %s", (input) => {
    expect(TerminalCommandDetector.shouldTriggerAgentMode("", input)).toBe(
      true,
    );
  });

  it("does not route shell input to the agent while a terminal prompt is active", () => {
    expect(
      TerminalCommandDetector.shouldTriggerAgentMode(
        "Password:",
        "find a big file",
      ),
    ).toBe(false);
  });

  it("keeps hash-prefixed input in the shell", () => {
    expect(
      TerminalCommandDetector.shouldTriggerAgentMode("", "# explain this"),
    ).toBe(false);
  });
});
