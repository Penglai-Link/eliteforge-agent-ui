import { expect, it } from "vitest";
import type { ToolWorkCard } from "./transcript";
import { summarizeToolActions } from "./toolActionSummary";

const tool = (id: string, toolName: string, args: unknown): ToolWorkCard => ({
  id, runId: "run", toolCallId: id, toolName, args, result: "", logs: [], parentReasoningId: null,
  firstMillis: 1, started: true, ended: true,
});

it("summarizes known action types and counts distinct edited paths", () => {
  const summary = summarizeToolActions([
    tool("cmd-1", "bash_exec", { command: "pwd" }),
    tool("cmd-2", "system_exec", { command: "ls" }),
    tool("write-1", "fs_write_text", { path: "src/app.ts", content: "one" }),
    tool("write-2", "fs_write_text", { path: "src/app.ts", content: "two" }),
    tool("patch", "fs_apply_patch", { patch: "*** Begin Patch\n*** Update File: src/chat.ts\n*** Add File: src/new.ts\n*** End Patch" }),
    tool("search", "search_grep", { query: "TODO" }),
    tool("read", "fs_read_text", { path: "README.md" }),
    tool("domain", "discovery_expand_tool_domain", { domainCode: "git" }),
  ]);
  expect(summary).toEqual({ commands: 2, editedFiles: 3, editOperations: 0, reads: 1, searches: 1, otherActions: 1 });
});

it("counts explicit file edits without a known target and never infers files from shell text", () => {
  const summary = summarizeToolActions([
    tool("write-unknown", "fs_write_text", { content: "content" }),
    tool("shell", "bash_exec", { command: "echo hi > generated.txt" }),
  ]);
  expect(summary).toEqual({ commands: 1, editedFiles: 0, editOperations: 1, reads: 0, searches: 0, otherActions: 0 });
});
