import { parseToolPayload, presentToolCall, unwrapGatewayToolCall } from "./toolPresentation";

export interface ToolOperationField {
  label: string;
  value: string;
  code?: boolean;
  copyLabel: string;
}
export interface ToolOperationDetails {
  title: string;
  fields: ToolOperationField[];
}

function stringAt(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = key.split(".").reduce<unknown>((value, part) => parseToolPayload(value)?.[part], payload);
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value) && value.length && value.every(item => typeof item === "string")) return value.join("\n");
  }
  return undefined;
}

function commandText(payload: Record<string, unknown>): string | undefined {
  const command = stringAt(payload, ["command", "cmd"]);
  if (!command) return undefined;
  const args = Array.isArray(payload.args) ? payload.args.filter((arg): arg is string => typeof arg === "string") : [];
  const executable = command.split(/[\\/]/).at(-1)?.toLowerCase();
  if (["sh", "bash", "zsh", "fish", "dash", "powershell", "pwsh", "cmd", "cmd.exe"].includes(executable ?? "")) {
    const scriptIndex = args.findIndex(arg => /^-[a-z]*c$/i.test(arg) || /^(?:-command|\/c)$/i.test(arg));
    // Show the script itself for the standard shell wrapper, without losing extra arguments.
    if (scriptIndex >= 0 && scriptIndex === args.length - 2) return args[scriptIndex + 1];
  }
  const quote = (arg: string) => /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, "'\\''")}'`;
  return Array.isArray(payload.args) ? [quote(command), ...args.map(quote)].join(" ") : command;
}

/** Display-only projection of the requested operation. Never reads results,
 * logs, protocol status, timestamps, or the order of transcript events. */
export function toolOperationDetails(rawToolName: string, rawArgs: unknown, locale?: string): ToolOperationDetails[] {
  const unwrapped = unwrapGatewayToolCall(rawToolName, parseToolPayload(rawArgs) ?? rawArgs);
  const payload = parseToolPayload(unwrapped.args) ?? {};
  // Framework batches contain the same tool's input objects in their original order.
  if (Object.keys(payload).length === 1 && Array.isArray(payload.items)
    && payload.items.length > 0 && payload.items.length <= 32) {
    return payload.items.map(item => describeOperation(unwrapped.toolName, parseToolPayload(item) ?? {}, locale));
  }
  return [describeOperation(unwrapped.toolName, payload, locale)];
}

/** Counts requested command invocations, not shell statements or result events. */
export function toolCommandCountLabel(rawToolName: string, rawArgs: unknown, locale?: string): string | undefined {
  const unwrapped = unwrapGatewayToolCall(rawToolName, parseToolPayload(rawArgs) ?? rawArgs);
  const name = unwrapped.toolName.toLowerCase().replace(/[.-]/g, "_");
  const presentation = presentToolCall(unwrapped.toolName, undefined, { locale });
  const executesCommands = /^(?:command|bash|terminal|system_command)_(?:exec|execute|run)$/.test(name)
    || (presentation.nounKey === "command" && presentation.verbKey === "exec");
  if (!executesCommands) return undefined;
  const payload = parseToolPayload(unwrapped.args);
  if (!payload) return undefined;
  const items = Object.keys(payload).length === 1 && Array.isArray(payload.items)
    ? payload.items : [payload];
  // Incomplete streamed input must not claim a command count yet.
  if (!items.length || items.length > 32 || !items.every(item => commandText(parseToolPayload(item) ?? {}))) return undefined;
  const count = items.length;
  return locale?.toLowerCase().startsWith("zh")
    ? `执行 ${count} 个命令`
    : `Run ${count} command${count === 1 ? "" : "s"}`;
}

function describeOperation(toolName: string, payload: Record<string, unknown>, locale?: string): ToolOperationDetails {
  const zh = locale?.toLowerCase().startsWith("zh");
  const text = (chinese: string, english: string) => zh ? chinese : english;
  const name = toolName.toLowerCase().replace(/[.-]/g, "_");
  const presentation = presentToolCall(toolName, undefined, { locale });
  const fields: ToolOperationField[] = [];
  const add = (label: string, value: string | undefined, code = false) => {
    if (value !== undefined && value.trim()) fields.push({ label, value, code, copyLabel: text(`复制${label}`, `Copy ${label.toLowerCase()}`) });
  };
  const field = (zhLabel: string, enLabel: string, keys: string[], code = false) => add(text(zhLabel, enLabel), stringAt(payload, keys), code);
  const command = commandText(payload);
  const commandTool = /^(?:command_|bash_|terminal_|system_command)/.test(name) || presentation.nounKey === "command";
  const fileTool = /^(?:fs_|filesystem_|file_)/.test(name) || name === "apply_patch" || presentation.nounKey === "file";
  const searchTool = /(?:search|grep|glob|find|query)/.test(name);
  const agentTool = /^(?:agent_|child_|thread_)/.test(name);

  if (commandTool || command) {
    add(text("命令", "Command"), command, true);
    if (!command) {
      field("任务", "Task", ["taskId", "task_id", "terminalId", "terminal_id", "id"]);
      field("输入内容", "Input", ["data", "input", "text"], true);
    }
  } else if (fileTool) {
    field("路径", "Path", ["path", "file_path", "filePath", "paths", "file", "fileRef.path", "fileRef.name"], true);
    field("来源", "Source", ["source", "sourcePath", "source_path"], true);
    field("目标", "Destination", ["destination", "destinationPath", "destination_path"], true);
    const start = payload.startLine ?? payload.start_line;
    const end = payload.endLine ?? payload.end_line;
    if (typeof start === "number" || typeof end === "number") {
      add(text("读取范围", "Read range"), typeof end === "number"
        ? text(`第 ${typeof start === "number" ? start : 1}–${end} 行`, `Lines ${typeof start === "number" ? start : 1}–${end}`)
        : text(`从第 ${start} 行开始`, `From line ${start}`));
    }
    field("修改内容", "Changes", ["patch", "diff"], true);
    if (!stringAt(payload, ["patch", "diff"])) {
      const action = payload.action;
      field(action === "delete" ? "删除内容" : "定位内容", action === "delete" ? "Text to delete" : "Text to match", ["target", "old_text", "oldText", "old_string"], true);
      const label = action === "insert_before" ? text("在前面插入", "Insert before")
        : action === "insert_after" ? text("在后面插入", "Insert after")
        : action === "replace" || /(?:replace|edit|patch)/.test(name) ? text("替换为", "Replace with")
        : payload.mode === "append" ? text("追加内容", "Append") : text("写入内容", "Write");
      const content = stringAt(payload, ["content", "new_text", "newText", "new_string", "text"]);
      add(label, content, true);
      if (content === undefined && ["content", "new_text", "newText", "new_string"].some(key => payload[key] === "")) add(label, text("（空内容）", "(empty content)"));
    }
    if (searchTool) field("搜索内容", "Search", ["query", "pattern", "regex", "keyword"]);
  } else if (searchTool) {
    field("搜索内容", "Search", ["query", "pattern", "regex", "keyword", "question", "text"]);
    field("搜索范围", "Scope", ["path", "paths", "root", "directory", "domainCode", "domain", "knowledgeBaseCode", "knowledge_base_code"]);
    field("文件筛选", "File filter", ["glob", "include", "filePattern", "file_pattern"]);
  } else if (agentTool) {
    field("智能体", "Agent", ["agent_name", "agentName", "name", "agentCode", "agent_code", "agent"]);
    field("任务说明", "Task", ["task", "prompt", "input", "message", "instruction", "objective"]);
    field("工作目录", "Working directory", ["workingDirectory", "working_directory", "cwd"]);
  } else {
    // Only user-facing business fields are projected. Unknown keys and nested
    // protocol envelopes never fall back to a JSON/parameter dump.
    field("名称", "Name", ["name", "title", "displayName", "display_name"]);
    field("目标", "Target", ["path", "file", "uri", "url", "resource", "skill", "skill_code", "branch", "ref"]);
    field("内容", "Content", ["message", "prompt", "instruction", "objective", "description", "text", "content"]);
    if (!fields.length) {
      field("操作对象", "Subject", ["appCode", "app_code", "workspaceCode", "workspace_code", "taskCode", "task_code", "resourceCode", "resource_code", "key", "code"]);
    }
  }
  return { title: presentation.title, fields };
}
