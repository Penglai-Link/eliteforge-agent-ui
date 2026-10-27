/**
 * Tool presentation: every AG-UI tool call gets a localized, human-readable
 * title such as "执行命令 cargo test" / "Run command cargo test".
 *
 * The whole algorithm is data-driven: domain nouns, verb tokens, subject
 * argument keys, per-tool overrides and message templates are plain tables.
 * Adding a tool means adding a table row, never adding a branch here.
 *
 * The raw tool id (`tool_search`, `fs_read_text`, ...) is never part of a
 * title: unknown tools fall back to a localized generic action template with
 * a humanized, whitespace-separated phrase.
 */

export type ToolPresentation = {
  /** Localized display title (e.g. "执行命令 cargo test"); never contains a raw id. */
  title: string;
  /** Parsed argument subject (command string, file path, query, ...), if any. */
  subject?: string;
  /** Matched noun key (e.g. "file") for host debugging or icon selection. */
  nounKey?: string;
  /** Matched verb key (e.g. "exec") for host debugging or icon selection. */
  verbKey?: string;
  /** Tool name after envelope unwrapping; debug only, never displayed directly. */
  rawToolName: string;
};

export type ToolPresentationOverride = {
  /** Exact tool name (case-insensitive) or pattern matched against it. */
  match: string | RegExp;
  /** Message key for the localized title template. */
  titleKey: string;
  /** Candidate argument keys for the subject, in priority order. */
  subjectKeys?: string[];
  nounKey?: string;
  verbKey?: string;
};

/** Host-supplied extensions merged over the built-in tables. */
export type ToolPresentationOverrides = {
  nouns?: Record<string, string>;
  verbs?: Record<string, string>;
  subjectKeys?: Record<string, string[]>;
  globalSubjectKeys?: string[];
  overrides?: ToolPresentationOverride[];
  messages?: Record<string, Record<string, string>>;
};

export type ToolPresentationLocale = "zh-CN" | "en-US";

/** Domain code -> noun key. Covers every domain code the product ships. */
export const DOMAIN_NOUNS: Record<string, string> = {
  bash: "command",
  fs: "file",
  search: "content",
  terminal: "terminal",
  git: "git",
  app: "app",
  workspace: "workspace",
  worktree: "worktree",
  skill: "skill",
  memory: "memory",
  rag: "knowledge",
  model: "model",
  task: "task",
  variable: "variable",
  resource: "resource",
  automation: "automation",
  dude: "assistant",
  excel: "spreadsheet",
  word: "document",
  chat_attachment: "attachment",
  // Data-only extras observed in the product catalogue.
  todo: "task",
  agent: "assistant",
  discovery: "tool",
  context: "context",
  // Real catalogue domain codes still missing a noun row.
  mcp: "mcp",
  media: "media",
  native: "native",
  prompt: "prompt",
  // Prefix nouns carried by real tool names (`child_*`, `thread_*`, ...).
  child: "subtask",
  thread: "thread",
  chat: "conversation",
  a2ui: "interface",
  // Multi-word prefix nouns for the resource/platform families.
  dude_soul: "soul",
  data_source: "dataSource",
  server: "server",
  server_account: "serverAccount",
};

/** Verb token -> verb key. Multi-word tokens (write_text, apply_patch, ...) are matched as n-grams. */
export const VERB_TOKENS: Record<string, string> = {
  exec: "exec",
  run: "exec",
  read: "read",
  read_text: "read",
  write: "write",
  write_text: "write",
  edit: "edit",
  apply_patch: "edit",
  replace_text: "edit",
  create: "create",
  delete: "delete",
  remove: "delete",
  update: "update",
  update_text: "update",
  get: "get",
  page: "page",
  restore: "restore",
  close: "close",
  answer: "answer",
  request_input: "requestInput",
  submit: "submit",
  query: "query",
  enable: "enable",
  disable: "disable",
  execute: "exec",
  notify: "notify",
  assess: "assess",
  generate: "generate",
  detect: "detect",
  binary: "manage",
  list: "list",
  stat: "view",
  info: "view",
  inspect: "view",
  view: "view",
  expand: "expand",
  search: "search",
  grep: "search",
  glob: "search",
  find: "search",
  path: "search",
  spawn: "spawn",
  load: "load",
  save: "save",
  start: "start",
  stop: "stop",
  switch: "switch",
  select: "select",
  parse_json: "parse",
  diff: "diff",
  log: "log",
  status: "status",
  wait: "wait",
  send: "send",
  cancel: "cancel",
  ingest: "ingest",
};

/** Noun key -> candidate argument keys, in priority order (dotted paths supported). */
export const SUBJECT_KEYS: Record<string, string[]> = {
  command: ["command", "cmd", "arguments.command"],
  file: ["path", "file", "file_path", "target", "source", "root", "arguments.path"],
  content: ["query", "pattern", "regex", "keyword"],
  app: ["app_code", "appCode", "code", "name", "title"],
  workspace: ["workspace_code", "workspaceCode", "name"],
  skill: ["skill", "skill_code", "name"],
  model: ["model", "model_code", "connection"],
  task: ["task_code", "title", "id"],
  git: ["branch", "ref", "path", "repo"],
  memory: ["key", "query", "content", "id"],
  variable: ["key", "name"],
  attachment: ["path", "file", "name"],
  terminal: ["terminal", "terminal_id", "command"],
  worktree: ["worktree_code", "worktreeCode", "path", "name"],
  knowledge: ["query", "question", "text", "keyword"],
  resource: ["resource_code", "code", "name", "uri", "url"],
  automation: ["automation_code", "code", "name"],
  assistant: ["agent_name", "agentName", "name", "message", "prompt"],
  spreadsheet: ["path", "file", "sheet", "name"],
  document: ["path", "file", "name"],
  context: ["path", "key", "name"],
  tool: ["tool", "name", "query"],
  mcp: ["name", "mcp", "server", "id"],
  media: ["path", "file", "name", "query"],
  native: ["name", "path", "tool"],
  prompt: ["prompt_code", "promptCode", "name", "code", "title"],
  subtask: ["child_id", "childId", "id", "task_id", "name"],
  thread: ["thread_id", "threadId", "id", "title", "name"],
  conversation: ["thread_id", "threadId", "id", "title", "name"],
  interface: ["path", "name", "id"],
  soul: ["name", "path", "id"],
  dataSource: ["data_source_code", "dataSourceCode", "name", "id"],
  server: ["server_code", "serverCode", "name", "host", "id"],
  serverAccount: ["account", "account_code", "name", "id"],
};

/** Last-resort argument keys when the noun has no dedicated mapping. */
export const GLOBAL_SUBJECT_KEYS: string[] = [
  "command",
  "path",
  "query",
  "pattern",
  "name",
  "code",
  "title",
  "key",
  "url",
  "id",
];

/** Data-only special cases. Adding a case is a table row, not a code branch. */
export const TOOL_OVERRIDES: ToolPresentationOverride[] = [
  {
    match: "tool_search",
    titleKey: "tool.title.search.tool",
    subjectKeys: ["query", "domainCode"],
    nounKey: "tool",
    verbKey: "search",
  },
  {
    match: "tool_execute",
    titleKey: "tool.title.exec.tool",
    subjectKeys: ["tool"],
    nounKey: "tool",
    verbKey: "exec",
  },
  {
    match: "chat_ask_user",
    titleKey: "tool.title.ask.user",
    nounKey: "assistant",
    verbKey: "wait",
  },
  {
    match: "ask_user",
    titleKey: "tool.title.ask.user",
    nounKey: "assistant",
    verbKey: "wait",
  },
  {
    match: "a2ui_request_input",
    titleKey: "tool.title.ask.user",
    nounKey: "assistant",
    verbKey: "wait",
  },
  {
    match: "agent_spawn",
    titleKey: "tool.title.spawn.agent",
    subjectKeys: ["agent_name", "agentName", "subagentName", "subagent_name", "name", "subagent", "agentCode", "agent_code", "agent"],
    nounKey: "assistant",
    verbKey: "spawn",
  },
  {
    match: "skill_read_resource",
    titleKey: "tool.title.composite",
    subjectKeys: ["resource", "uri", "url", "name", "skill"],
    nounKey: "skillResource",
    verbKey: "read",
  },
  {
    match: "discovery_expand_tool_domain",
    titleKey: "tool.title.composite",
    subjectKeys: ["domainCode", "domain", "query"],
    nounKey: "toolDomain",
    verbKey: "expand",
  },
  {
    match: "personai_search",
    titleKey: "tool.title.composite",
    subjectKeys: ["query", "keyword"],
    nounKey: "web",
    verbKey: "search",
  },
  {
    match: "personai_generate_image",
    titleKey: "tool.title.composite",
    subjectKeys: ["prompt", "query", "text"],
    nounKey: "image",
    verbKey: "generate",
  },
  {
    match: "personai_query_image",
    titleKey: "tool.title.composite",
    subjectKeys: ["task_id", "taskId", "id"],
    nounKey: "image",
    verbKey: "query",
  },
  {
    match: "personai_detect_text",
    titleKey: "tool.title.composite",
    subjectKeys: ["text", "content", "query"],
    nounKey: "text",
    verbKey: "detect",
  },
  {
    match: "personai_detect_image",
    titleKey: "tool.title.composite",
    subjectKeys: ["path", "url", "image"],
    nounKey: "image",
    verbKey: "detect",
  },
  {
    match: "media_read_image",
    titleKey: "tool.title.composite",
    subjectKeys: ["path", "file", "url", "name"],
    nounKey: "image",
    verbKey: "read",
  },
  {
    match: "media_read_pdf",
    titleKey: "tool.title.read.pdf",
    subjectKeys: ["path", "file", "url", "name"],
    nounKey: "pdf",
    verbKey: "read",
  },
  {
    match: "web_fetch",
    titleKey: "tool.title.composite",
    subjectKeys: ["url", "uri", "path"],
    nounKey: "web",
    verbKey: "read",
  },
  {
    match: "dude_notify",
    titleKey: "tool.title.composite",
    subjectKeys: ["message", "title", "content"],
    nounKey: "user",
    verbKey: "notify",
  },
  {
    match: "dude_work_change",
    titleKey: "tool.title.composite",
    subjectKeys: ["title", "name", "id"],
    nounKey: "workChange",
    verbKey: "assess",
  },
  {
    match: "rag_quality_sources",
    titleKey: "tool.title.composite",
    subjectKeys: ["query", "question", "id"],
    nounKey: "evaluationSource",
    verbKey: "read",
  },
  {
    match: "rag_quality_cases",
    titleKey: "tool.title.composite",
    subjectKeys: ["query", "case_id", "id", "name"],
    nounKey: "evaluationCase",
    verbKey: "manage",
  },
];

/** Every title is data. `{subject}`, `{verb}` and `{noun}` are the only placeholders. */
export const MESSAGES: Record<ToolPresentationLocale, Record<string, string>> = {
  "zh-CN": {
    "tool.noun.command": "命令",
    "tool.noun.file": "文件",
    "tool.noun.content": "内容",
    "tool.noun.terminal": "终端",
    "tool.noun.git": "Git",
    "tool.noun.app": "应用",
    "tool.noun.workspace": "工作区",
    "tool.noun.worktree": "工作树",
    "tool.noun.skill": "技能",
    "tool.noun.memory": "记忆",
    "tool.noun.knowledge": "知识库",
    "tool.noun.model": "模型",
    "tool.noun.task": "任务",
    "tool.noun.variable": "变量",
    "tool.noun.resource": "资源",
    "tool.noun.automation": "自动化",
    "tool.noun.assistant": "助手",
    "tool.noun.spreadsheet": "表格",
    "tool.noun.document": "文档",
    "tool.noun.attachment": "附件",
    "tool.noun.context": "上下文",
    "tool.noun.tool": "工具",
    "tool.noun.mcp": "MCP",
    "tool.noun.media": "媒体",
    "tool.noun.native": "原生",
    "tool.noun.prompt": "提示词",
    "tool.noun.subtask": "子任务",
    "tool.noun.thread": "会话",
    "tool.noun.conversation": "对话",
    "tool.noun.interface": "界面",
    "tool.noun.soul": "灵魂",
    "tool.noun.dataSource": "数据源",
    "tool.noun.server": "服务器",
    "tool.noun.serverAccount": "服务器账号",
    "tool.noun.skillResource": "技能资源",
    "tool.noun.toolDomain": "工具领域",
    "tool.noun.web": "网页",
    "tool.noun.image": "图片",
    "tool.noun.text": "文本",
    "tool.noun.pdf": "PDF",
    "tool.noun.user": "用户",
    "tool.noun.workChange": "事项变化",
    "tool.noun.evaluationSource": "评测原文",
    "tool.noun.evaluationCase": "检索评测题",
    "tool.verb.exec": "执行",
    "tool.verb.read": "读取",
    "tool.verb.write": "写入",
    "tool.verb.edit": "编辑",
    "tool.verb.create": "创建",
    "tool.verb.delete": "删除",
    "tool.verb.update": "修改",
    "tool.verb.get": "获取",
    "tool.verb.page": "分页查询",
    "tool.subject.page": "第 {page} 页",
    "tool.verb.restore": "恢复",
    "tool.verb.close": "关闭",
    "tool.verb.answer": "回答",
    "tool.verb.requestInput": "请求输入",
    "tool.verb.submit": "提交",
    "tool.verb.query": "查询",
    "tool.verb.enable": "启用",
    "tool.verb.disable": "停用",
    "tool.verb.notify": "通知",
    "tool.verb.assess": "评估",
    "tool.verb.generate": "生成",
    "tool.verb.detect": "检测",
    "tool.verb.manage": "管理",
    "tool.verb.list": "列出",
    "tool.verb.view": "查看",
    "tool.verb.search": "搜索",
    "tool.verb.spawn": "分派",
    "tool.verb.load": "加载",
    "tool.verb.expand": "展开",
    "tool.verb.save": "保存",
    "tool.verb.start": "启动",
    "tool.verb.stop": "停止",
    "tool.verb.switch": "切换",
    "tool.verb.select": "选择",
    "tool.verb.parse": "解析",
    "tool.verb.diff": "对比",
    "tool.verb.log": "日志",
    "tool.verb.status": "查看",
    "tool.verb.wait": "等待",
    "tool.verb.send": "发送",
    "tool.verb.cancel": "取消",
    "tool.verb.ingest": "入库",
    "tool.title.exec.command": "执行命令 {subject}",
    "tool.title.read.file": "读取文件 {subject}",
    "tool.title.write.file": "编辑文件 {subject}",
    "tool.title.read.pdf": "读取 PDF {subject}",
    "tool.title.edit.file": "编辑文件 {subject}",
    "tool.title.create.app": "创建应用 {subject}",
    "tool.title.search.tool": "搜索工具 {subject}",
    "tool.title.exec.tool": "执行工具 {subject}",
    "tool.title.ask.user": "询问用户",
    "tool.title.spawn.agent": "分派子代理 {subject}",
    "tool.title.diff.git": "对比 Git 变更 {subject}",
    "tool.title.log.git": "查看 Git 日志 {subject}",
    "tool.title.status.git": "查看 Git 状态 {subject}",
    "tool.title.switch.git": "切换 Git 分支 {subject}",
    "tool.title.composite": "{verb}{noun} {subject}",
    "tool.title.fallback": "执行工具 {name} {subject}",
  },
  "en-US": {
    "tool.noun.command": "command",
    "tool.noun.file": "file",
    "tool.noun.content": "content",
    "tool.noun.terminal": "terminal",
    "tool.noun.git": "Git",
    "tool.noun.app": "app",
    "tool.noun.workspace": "workspace",
    "tool.noun.worktree": "worktree",
    "tool.noun.skill": "skill",
    "tool.noun.memory": "memory",
    "tool.noun.knowledge": "knowledge base",
    "tool.noun.model": "model",
    "tool.noun.task": "task",
    "tool.noun.variable": "variable",
    "tool.noun.resource": "resource",
    "tool.noun.automation": "automation",
    "tool.noun.assistant": "assistant",
    "tool.noun.spreadsheet": "spreadsheet",
    "tool.noun.document": "document",
    "tool.noun.attachment": "attachment",
    "tool.noun.context": "context",
    "tool.noun.tool": "tool",
    "tool.noun.mcp": "MCP",
    "tool.noun.media": "media",
    "tool.noun.native": "native",
    "tool.noun.prompt": "prompt",
    "tool.noun.subtask": "subtask",
    "tool.noun.thread": "thread",
    "tool.noun.conversation": "conversation",
    "tool.noun.interface": "interface",
    "tool.noun.soul": "soul",
    "tool.noun.dataSource": "data source",
    "tool.noun.server": "server",
    "tool.noun.serverAccount": "server account",
    "tool.noun.skillResource": "skill resource",
    "tool.noun.toolDomain": "tool domain",
    "tool.noun.web": "web page",
    "tool.noun.image": "image",
    "tool.noun.text": "text",
    "tool.noun.pdf": "PDF",
    "tool.noun.user": "user",
    "tool.noun.workChange": "work change",
    "tool.noun.evaluationSource": "evaluation source",
    "tool.noun.evaluationCase": "retrieval evaluation case",
    "tool.verb.exec": "Run",
    "tool.verb.read": "Read",
    "tool.verb.write": "Write",
    "tool.verb.edit": "Edit",
    "tool.verb.create": "Create",
    "tool.verb.delete": "Delete",
    "tool.verb.update": "Update",
    "tool.verb.get": "Get",
    "tool.verb.page": "List",
    "tool.subject.page": "Page {page}",
    "tool.verb.restore": "Restore",
    "tool.verb.close": "Close",
    "tool.verb.answer": "Answer",
    "tool.verb.requestInput": "Request input",
    "tool.verb.submit": "Submit",
    "tool.verb.query": "Query",
    "tool.verb.enable": "Enable",
    "tool.verb.disable": "Disable",
    "tool.verb.notify": "Notify",
    "tool.verb.assess": "Assess",
    "tool.verb.generate": "Generate",
    "tool.verb.detect": "Detect",
    "tool.verb.manage": "Manage",
    "tool.verb.list": "List",
    "tool.verb.view": "View",
    "tool.verb.search": "Search",
    "tool.verb.spawn": "Dispatch",
    "tool.verb.load": "Load",
    "tool.verb.expand": "Expand",
    "tool.verb.save": "Save",
    "tool.verb.start": "Start",
    "tool.verb.stop": "Stop",
    "tool.verb.switch": "Switch",
    "tool.verb.select": "Select",
    "tool.verb.parse": "Parse",
    "tool.verb.diff": "Diff",
    "tool.verb.log": "log",
    "tool.verb.status": "View",
    "tool.verb.wait": "Wait",
    "tool.verb.send": "Send",
    "tool.verb.cancel": "Cancel",
    "tool.verb.ingest": "Ingest",
    "tool.title.exec.command": "Run command {subject}",
    "tool.title.read.file": "Read file {subject}",
    "tool.title.write.file": "Edit file {subject}",
    "tool.title.read.pdf": "Read PDF {subject}",
    "tool.title.edit.file": "Edit file {subject}",
    "tool.title.create.app": "Create app {subject}",
    "tool.title.search.tool": "Search tools {subject}",
    "tool.title.exec.tool": "Run tool {subject}",
    "tool.title.ask.user": "Ask the user",
    "tool.title.spawn.agent": "Dispatch subagent {subject}",
    "tool.title.diff.git": "Diff Git changes {subject}",
    "tool.title.log.git": "View Git log {subject}",
    "tool.title.status.git": "View Git status {subject}",
    "tool.title.switch.git": "Switch Git branch {subject}",
    "tool.title.composite": "{verb} {noun} {subject}",
    "tool.title.fallback": "Run tool {name} {subject}",
  },
};

const maxSubjectLength = 80;
const maxWords = 4;

let hostOverrides: ToolPresentationOverrides | undefined;

/** Hosts can extend every table (nouns, verbs, subject keys, overrides, messages). */
export function configureToolPresentation(overrides?: ToolPresentationOverrides): void {
  hostOverrides = overrides;
}

type ResolvedTables = {
  nouns: Record<string, string>;
  verbs: Record<string, string>;
  subjectKeys: Record<string, string[]>;
  globalSubjectKeys: string[];
  overrides: ToolPresentationOverride[];
};

function resolveTables(overrides?: ToolPresentationOverrides): ResolvedTables {
  const active: ToolPresentationOverrides = { ...hostOverrides, ...overrides };
  return {
    nouns: { ...DOMAIN_NOUNS, ...active.nouns },
    verbs: { ...VERB_TOKENS, ...active.verbs },
    subjectKeys: { ...SUBJECT_KEYS, ...active.subjectKeys },
    globalSubjectKeys: active.globalSubjectKeys ?? GLOBAL_SUBJECT_KEYS,
    overrides: [...(active.overrides ?? []), ...TOOL_OVERRIDES],
  };
}

function localeMessages(locale: ToolPresentationLocale, overrides?: ToolPresentationOverrides) {
  const base = MESSAGES[locale] ?? MESSAGES["en-US"];
  const extra = { ...hostOverrides?.messages?.[locale], ...overrides?.messages?.[locale] };
  return Object.keys(extra).length ? { ...base, ...extra } : base;
}

export function normalizeToolPresentationLocale(locale?: string): ToolPresentationLocale {
  return (locale ?? "").trim().toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

/**
 * Resolves the presentation locale: an explicit host locale wins, otherwise
 * the existing label heuristic (CJK text means Chinese), otherwise en-US.
 */
export function detectToolPresentationLocale(
  locale?: string,
  labelSamples: Array<string | undefined | null> = [],
): ToolPresentationLocale {
  if (locale && locale.trim()) return normalizeToolPresentationLocale(locale);
  const sample = labelSamples
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
  return /[\u3400-\u9fff]/.test(sample) ? "zh-CN" : "en-US";
}

export function presentToolCall(
  rawToolName: string,
  rawArgs?: unknown,
  options?: { locale?: string; overrides?: ToolPresentationOverrides },
): ToolPresentation {
  const tables = resolveTables(options?.overrides);
  const messages = localeMessages(normalizeToolPresentationLocale(options?.locale), options?.overrides);
  const { toolName, args } = unwrapGatewayToolCall(typeof rawToolName === "string" ? rawToolName : "", rawArgs);
  const name = toolName.trim();
  const payload = parseToolPayload(args);
  if (payload && Object.keys(payload).length === 1 && Array.isArray(payload.items)
    && payload.items.length > 0 && payload.items.length <= 32) {
    const count = payload.items.length;
    if (count === 1) return presentToolCall(name, payload.items[0], options);
    const base = presentToolCall(name, undefined, options);
    const subjects = payload.items.slice(0,3).map(item=>presentToolCall(name,item,options).subject).filter(Boolean);
    const summary = [...new Set(subjects)].join(", ");
    const title = summary ? `${base.title} ${summary}${count > 3 ? "…" : ""}` : base.title;
    const chinese = normalizeToolPresentationLocale(options?.locale) === "zh-CN";
    return { ...base, title: chinese ? `${title}（${count} 项）` : `${title} (${count} items)` };
  }

  const override = findOverride(name, tables.overrides);
  if (override) {
    // Overrides read the subject from the payload only: a primitive payload must
    // never leak a raw tool id into the title.
    const subject = override.subjectKeys ? strictSubject(args, override.subjectKeys) : "";
    return {
      title: renderTemplate(messages[override.titleKey] ?? messages["tool.title.fallback"] ?? "", {
        subject,
        name: humanizeToolName(name),
        verb: override.verbKey ? messages[`tool.verb.${override.verbKey}`] ?? "" : "",
        noun: override.nounKey ? messages[`tool.noun.${override.nounKey}`] ?? "" : "",
      }),
      subject: subject || undefined,
      nounKey: override.nounKey,
      verbKey: override.verbKey,
      rawToolName: name,
    };
  }

  const words = tokenizeToolName(name);
  const matched = findDomainMatch(words, tables.nouns, tables.verbs);
  const domain = matched?.domain;
  const nounKey = domain ? tables.nouns[domain.key] : undefined;
  const verbKey = matched?.verb ? tables.verbs[matched.verb.key] : undefined;
  const nounKeys = nounKey ? tables.subjectKeys[nounKey] ?? [] : [];
  const subject = verbKey === "page"
    ? paginationSubject(args, [...nounKeys, ...tables.globalSubjectKeys], messages)
    : extractSubject(args, nounKeys, tables.globalSubjectKeys);

  if (verbKey && nounKey) {
    const verb = messages[`tool.verb.${verbKey}`] ?? "";
    const noun = messages[`tool.noun.${nounKey}`] ?? "";
    const template = messages[`tool.title.${verbKey}.${nounKey}`] ?? messages["tool.title.composite"] ?? "";
    return {
      title: renderTemplate(template, { noun, subject, verb }),
      subject: subject || undefined,
      nounKey,
      verbKey,
      rawToolName: name,
    };
  }

  // Missing noun or verb: localized generic action + humanized readable phrase
  // (plus the parsed subject when the arguments expose one).
  return {
    title: renderTemplate(messages["tool.title.fallback"] ?? "", { name: humanizeToolName(name), subject }),
    subject: subject || undefined,
    nounKey,
    verbKey,
    rawToolName: name,
  };
}

/**
 * Unwraps a `tool_execute` gateway envelope when one reaches presentation code.
 * The AG-UI layer already presents inner tool names; this is the defensive path
 * for raw assistant parts that keep the envelope shape.
 */
export function unwrapGatewayToolCall(toolName: string, args: unknown): { toolName: string; args: unknown } {
  const name = typeof toolName === "string" ? toolName.trim() : "";
  if (name !== "tool_execute") return { toolName, args };
  // Keep the same acceptance rules as core GatewayEnvelope::parse. Invalid
  // envelopes retain their outer identity in titles and transcript summaries.
  if (!args || typeof args !== "object" || Array.isArray(args)) return { toolName, args };
  const payload = args as Record<string, unknown>;
  if (typeof payload.tool !== "string" || !payload.tool.trim()) return { toolName, args };
  const aliases = ["arguments", "input", "args"];
  const key = aliases.find((key) => Object.prototype.hasOwnProperty.call(payload, key));
  const raw = key === undefined ? undefined : payload[key];
  let innerArgs: Record<string, unknown> | null;
  if (raw === undefined || raw === null) {
    innerArgs = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "tool" && !aliases.includes(key)));
  } else {
    innerArgs = parseToolPayload(raw);
  }
  if (!innerArgs) return { toolName, args };
  return { toolName: payload.tool.trim(), args: innerArgs };
}

/** Parses an object payload from an object or a JSON string; returns null otherwise. */
export function parseToolPayload(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function findOverride(name: string, overrides: ToolPresentationOverride[]) {
  const normalized = name.toLowerCase();
  return overrides.find((override) => (
    typeof override.match === "string"
      ? override.match.toLowerCase() === normalized
      : new RegExp(override.match.source, override.match.flags).test(name)
  ));
}

function tokenizeToolName(name: string): string[] {
  return name
    .trim()
    .toLowerCase()
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .slice(0, maxWords);
}

type WordMatch = { key: string; start: number; length: number };

/**
 * Finds the domain noun and the verb token in a tool name.
 *
 * Domains may sit anywhere (`word_create`, `search_grep`). When several domain
 * words match (`memory_search`, `bash_task_read`) the longest wins, then the
 * latest one whose remaining words still contain a known verb; the earliest
 * match stays the fallback when no candidate exposes a verb.
 */
function findDomainMatch(
  words: string[],
  nouns: Record<string, string>,
  verbs: Record<string, string>,
): { domain: WordMatch; verb: WordMatch | null } | null {
  const candidates: WordMatch[] = [];
  for (let length = words.length; length >= 1; length -= 1) {
    for (let start = 0; start + length <= words.length; start += 1) {
      const key = words.slice(start, start + length).join("_");
      if (nouns[key]) candidates.push({ key, start, length });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((left, right) => right.length - left.length || right.start - left.start);
  let first: { domain: WordMatch; verb: WordMatch | null } | null = null;
  for (const domain of candidates) {
    const remaining = words.filter((_, index) => index < domain.start || index >= domain.start + domain.length);
    const verb = findVerbMatch(remaining, verbs);
    if (!first) first = { domain, verb };
    if (verb) return { domain, verb };
  }
  return first;
}

function findVerbMatch(words: string[], verbs: Record<string, string>): WordMatch | null {
  for (let end = words.length - 1; end >= 0; end -= 1) {
    for (let length = Math.min(3, end + 1); length >= 1; length -= 1) {
      const key = words.slice(end - length + 1, end + 1).join("_");
      if (verbs[key]) return { key, start: end - length + 1, length };
    }
  }
  return null;
}

function paginationSubject(rawArgs: unknown, keys: string[], messages: Record<string, string>): string {
  const payload = parseToolPayload(rawArgs);
  const subject = subjectFromKeys(payload, keys);
  const page = payload?.current ?? payload?.page ?? payload?.pageNumber ?? payload?.page_number;
  const pageLabel = typeof page === "number" && Number.isSafeInteger(page) && page > 0
    ? renderTemplate(messages["tool.subject.page"] ?? "Page {page}", { page: String(page) })
    : "";
  // Pagination controls (size, flags) are not a subject when no page is supplied.
  return [subject, pageLabel].filter(Boolean).join(" ");
}

function extractSubject(rawArgs: unknown, keys: string[], globalKeys: string[]): string {
  const source = parseToolPayload(rawArgs) ?? rawArgs;
  return subjectFromKeys(source, keys) || subjectFromKeys(source, globalKeys) || readableScalar(source);
}

function strictSubject(rawArgs: unknown, keys: string[]): string {
  return subjectFromKeys(parseToolPayload(rawArgs), keys);
}

function subjectFromKeys(source: unknown, keys: string[]): string {
  if (!source || typeof source !== "object") return "";
  for (const key of keys) {
    const found = readableScalar(readPath(source, key));
    if (found) return found;
  }
  return "";
}

function readPath(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function readableScalar(value: unknown, depth = 0): string {
  if (value == null || depth > 4) return "";
  if (typeof value === "string") return normalizeSubjectText(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readableScalar(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = readableScalar(item, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

function normalizeSubjectText(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed || collapsed === "{}" || collapsed === "[]" || collapsed === "null" || collapsed === "undefined") {
    return "";
  }
  return collapsed.length > maxSubjectLength
    ? `${collapsed.slice(0, maxSubjectLength - 1)}…`
    : collapsed;
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template
    .replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function humanizeToolName(value: string): string {
  const parts = value.trim().split(/[._\-\s]+/).filter(Boolean);
  return parts.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
}
