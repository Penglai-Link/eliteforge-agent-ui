import type { ToolActionSummary } from "./types";
import type { ToolWorkCard } from "./transcript";

const filePathKeys = new Set(["path", "filepath", "file_path", "filename", "file_name", "file", "targetpath", "target_path"]);

function parseArguments(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function normalizePath(value: string) {
  const path = value.trim().replace(/^['"]|['"]$/g, "").replace(/^(?:\.\/)+/, "");
  return path && path !== "/dev/null" ? path : "";
}

function patchPaths(value: string) {
  const paths = new Set<string>();
  const patterns = [
    /^\*\*\*\s+(?:Update|Add|Delete) File:\s*(.+)$/gm,
    /^\+\+\+\s+b\/(.+)$/gm,
    /^---\s+a\/(.+)$/gm,
  ];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const path = normalizePath(match[1] ?? "");
      if (path) paths.add(path);
    }
  }
  return paths;
}

function editedFilePaths(args: unknown) {
  const paths = new Set<string>();
  const visit = (value: unknown, depth: number) => {
    if (depth > 5 || value == null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase().replace(/[-.]/g, "_");
      if (typeof child === "string" && filePathKeys.has(normalizedKey)) {
        const path = normalizePath(child);
        if (path) paths.add(path);
      } else if (typeof child === "string" && (normalizedKey === "patch" || normalizedKey === "diff")) {
        patchPaths(child).forEach((path) => paths.add(path));
      } else {
        visit(child, depth + 1);
      }
    }
  };
  visit(parseArguments(args), 0);
  if (typeof args === "string") patchPaths(args).forEach((path) => paths.add(path));
  return paths;
}

type ToolActionKind = "command" | "edit" | "read" | "search" | "other";

function actionKind(toolName: string): ToolActionKind {
  const name = toolName.trim().toLowerCase().replace(/[.-]/g, "_");
  if (["bash_exec", "system_exec", "terminal_start", "terminal_exec"].includes(name)) return "command";
  if (["fs_write_text", "fs_apply_patch", "write_file", "edit_file", "apply_patch"].includes(name)
    || /^filesystem_(?:write|edit|apply_patch|replace)/.test(name)) return "edit";
  if (/search|grep|glob|find/.test(name)) return "search";
  if (/read|list|stat|inspect/.test(name)) return "read";
  return "other";
}

export function summarizeToolActions(tools: ToolWorkCard[]): ToolActionSummary {
  const summary: ToolActionSummary = {
    commands: 0,
    editedFiles: 0,
    editOperations: 0,
    reads: 0,
    searches: 0,
    otherActions: 0,
  };
  const editedFiles = new Set<string>();
  for (const tool of tools) {
    if (!tool.started) continue;
    switch (actionKind(tool.toolName)) {
      case "command":
        summary.commands += 1;
        break;
      case "edit": {
        const paths = editedFilePaths(tool.args);
        if (paths.size === 0) summary.editOperations += 1;
        else paths.forEach((path) => editedFiles.add(path));
        break;
      }
      case "read":
        summary.reads += 1;
        break;
      case "search":
        summary.searches += 1;
        break;
      case "other":
        summary.otherActions += 1;
        break;
    }
  }
  summary.editedFiles = editedFiles.size;
  return summary;
}

export function defaultToolActionSummaryLabel(summary: ToolActionSummary) {
  const parts: string[] = [];
  const plural = (count: number, singular: string, multiple = `${singular}s`) => `${count} ${count === 1 ? singular : multiple}`;
  if (summary.commands) parts.push(`Ran ${plural(summary.commands, "command")}`);
  if (summary.editedFiles) parts.push(`Edited ${plural(summary.editedFiles, "file")}`);
  if (summary.editOperations) parts.push(`Edited files ${summary.editOperations} ${summary.editOperations === 1 ? "time" : "times"}`);
  if (summary.searches) parts.push(`Searched ${summary.searches} ${summary.searches === 1 ? "time" : "times"}`);
  if (summary.reads) parts.push(`Read ${summary.reads} ${summary.reads === 1 ? "item" : "items"}`);
  if (summary.otherActions) parts.push(`Performed ${plural(summary.otherActions, "other action")}`);
  return parts.join(" · ") || "Completed actions";
}
