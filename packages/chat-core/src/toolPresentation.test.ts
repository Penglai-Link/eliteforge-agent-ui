import { describe, expect, it } from "vitest";
import {
  DOMAIN_NOUNS,
  GLOBAL_SUBJECT_KEYS,
  MESSAGES,
  SUBJECT_KEYS,
  TOOL_OVERRIDES,
  VERB_TOKENS,
  configureToolPresentation,
  detectToolPresentationLocale,
  normalizeToolPresentationLocale,
  presentToolCall,
  unwrapGatewayToolCall,
} from "./toolPresentation";
import {
  isRawToolNameOverride,
  normalizeToolNameIdentity,
  toolCompactLabel,
  toolDisplayName,
} from "./transcript";

const zh = { locale: "zh-CN" } as const;
const en = { locale: "en-US" } as const;

/** Every tool name the product ships today; the presenter must table-hit all of them. */
const shippedToolNames = [
  "bash_exec", "bash_task_read", "bash_task_stop", "chat_attachment_parse_json",
  "chat_attachment_read_text", "excel_read", "excel_write", "fs_apply_patch", "fs_list",
  "fs_read_text", "fs_stat", "fs_write_text", "git_diff", "git_log", "git_status",
  "git_switch_branch", "memory_delete", "memory_save", "memory_search", "todo_update",
  "rag_search", "search_glob", "search_grep", "search_path", "terminal_list",
  "terminal_read", "terminal_start", "terminal_stop", "terminal_write", "word_create",
  "word_read", "word_replace_text", "worktree_create", "worktree_list", "worktree_select",
];

/** The 20 product domain codes, each exercised with a real verb token. */
const domainCodes: Record<string, string> = {
  bash: "exec", fs: "read", search: "grep", terminal: "list", git: "status",
  app: "create", workspace: "create", worktree: "list", skill: "load", memory: "search",
  rag: "search", model: "switch", task: "create", variable: "read", resource: "list",
  automation: "start", dude: "spawn", excel: "read", word: "create", chat_attachment: "read",
};

/** Additional catalogue names that must also resolve through the tables. */
const extraToolNames = [
  "ask_user", "a2ui_request_input", "discovery_expand_tool_domain", "workspace.inspect",
  "dude_soul_update", "context.inspect",
];

const domainToolNames = Object.entries(domainCodes).map(([domain, verb]) => `${domain}_${verb}`);
const genericTitle = presentToolCall("zzz_unknown_nothing", {}, zh).title;

describe("tables", () => {
  it("covers every product domain code and required verb token", () => {
    for (const domain of Object.keys(domainCodes)) {
      expect(DOMAIN_NOUNS[domain], domain).toBeTruthy();
    }
    for (const token of [
      "exec", "run", "read", "write", "write_text", "edit", "apply_patch", "replace_text",
      "create", "delete", "remove", "update", "update_text", "list", "stat", "info",
      "search", "grep", "glob", "find", "path", "spawn", "load", "save", "start", "stop",
      "switch", "select", "read_text", "parse_json", "diff", "log", "status", "wait",
      "send", "cancel", "ingest", "inspect", "expand",
    ]) {
      expect(VERB_TOKENS[token], token).toBeTruthy();
    }
    expect(TOOL_OVERRIDES.map((override) => override.match)).toEqual(
      expect.arrayContaining([
        "tool_search", "tool_execute", "chat_ask_user", "ask_user", "a2ui_request_input", "agent_spawn",
      ]),
    );
    expect(GLOBAL_SUBJECT_KEYS.length).toBeGreaterThan(5);
    for (const locale of ["zh-CN", "en-US"] as const) {
      expect(MESSAGES[locale]["tool.title.fallback"]).toContain("{subject}");
      expect(MESSAGES[locale]["tool.title.search.tool"]).toContain("{subject}");
    }
  });

  it("keeps subject keys for every noun referenced by a domain", () => {
    for (const noun of new Set(Object.values(DOMAIN_NOUNS))) {
      expect(SUBJECT_KEYS[noun], noun).toBeTruthy();
    }
  });
});

describe("user examples", () => {
  it("renders the four accepted examples in zh-CN", () => {
    expect(presentToolCall("tool_search", { query: "git" }, zh).title).toBe("搜索工具 git");
    expect(presentToolCall("bash_exec", { command: "cargo test" }, zh).title).toBe("执行命令 cargo test");
    expect(presentToolCall("fs_write_text", { path: "src/main.rs" }, zh).title).toBe("编辑文件 src/main.rs");
    expect(presentToolCall("app_create", { app_code: "portal" }, zh).title).toBe("创建应用 portal");
  });

  it("renders the same examples in en-US", () => {
    expect(presentToolCall("tool_search", { query: "git" }, en).title).toBe("Search tools git");
    expect(presentToolCall("bash_exec", { command: "cargo test" }, en).title).toBe("Run command cargo test");
    expect(presentToolCall("fs_write_text", { path: "src/main.rs" }, en).title).toBe("Edit file src/main.rs");
    expect(presentToolCall("app_create", { app_code: "portal" }, en).title).toBe("Create app portal");
  });
});

describe("gateway envelope", () => {
  it("unwraps tool_execute and never shows the envelope id", () => {
    const presentation = presentToolCall(
      "tool_execute",
      { tool: "fs_read_text", arguments: { path: "a.md" } },
      zh,
    );
    expect(presentation.title).toBe("读取文件 a.md");
    expect(presentation.title).not.toContain("tool_execute");
    expect(presentation.rawToolName).toBe("fs_read_text");
  });

  it("falls back to a localized envelope title when the envelope is malformed", () => {
    const presentation = presentToolCall("tool_execute", "not-an-envelope", zh);
    expect(presentation.title).toBe("执行工具");
    expect(presentation.title).not.toContain("tool_execute");
    expect(presentation.title).not.toContain("_");
  });
});

describe("coverage", () => {
  const names = [...shippedToolNames, ...domainToolNames, ...extraToolNames];

  it.each(names)("table-hits %s with a readable, id-free title", (name) => {
    const presentation = presentToolCall(name, {}, zh);
    expect(presentation.title).toBeTruthy();
    expect(presentation.title).not.toContain("_");
    expect(presentation.title).not.toContain("tool_search");
    expect(presentation.title).not.toContain("tool_execute");
    expect(presentation.title).not.toBe(genericTitle);
    expect(presentation.verbKey, `${name} verb`).toBeTruthy();
    expect(presentation.nounKey, `${name} noun`).toBeTruthy();
  });

  it("keeps the full shipped list free of raw ids in en-US too", () => {
    for (const name of names) {
      const presentation = presentToolCall(name, {}, en);
      expect(presentation.title, name).toBeTruthy();
      expect(presentation.title, name).not.toMatch(/tool_search|tool_execute|_/);
    }
  });
});

describe("unknown tools", () => {
  it("uses the localized generic action with the parsed subject", () => {
    const presentation = presentToolCall("mystery_tool_do_thing", { foo: "bar" }, zh);
    expect(presentation.title).toContain("执行工具");
    expect(presentation.title).toContain("Mystery Tool Do Thing");
    expect(presentation.title).toContain("bar");
    expect(presentation.title).not.toContain("_");
    expect(presentation.title).not.toContain("mystery_tool_do_thing");
  });

  it("falls back to a humanized readable phrase without any argument subject", () => {
    expect(presentToolCall("mystery_tool_do_thing", {}, zh).title).toBe("执行工具 Mystery Tool Do Thing");
    expect(presentToolCall("mystery_tool_do_thing", {}, en).title).toBe("Run tool Mystery Tool Do Thing");
  });
});

describe("subject parsing", () => {
  it("reads dotted paths, arrays and first readable scalars", () => {
    expect(presentToolCall("bash_exec", { arguments: { command: "pwd" } }, zh).title).toBe("执行命令 pwd");
    expect(presentToolCall("fs_read_text", { path: ["a.md", "b.md"] }, zh).title).toBe("读取文件 a.md");
    expect(presentToolCall("fs_read_text", { path: "  a.md\n b.md  " }, zh).title).toBe("读取文件 a.md b.md");
    expect(presentToolCall("git_switch_branch", { ref: "feature/ui" }, zh).title).toBe("切换 Git 分支 feature/ui");
  });

  it("leaves the title untouched when the subject is missing or blank", () => {
    expect(presentToolCall("fs_list", {}, zh).title).toBe("列出文件");
    expect(presentToolCall("fs_list", { path: "   " }, zh).title).toBe("列出文件");
    expect(presentToolCall("fs_list", {}, zh).subject).toBeUndefined();
    expect(presentToolCall("git_status", { nested: {} }, zh).title).toBe("查看 Git 状态");
  });

  it("truncates an over-long subject to 80 characters with an ellipsis", () => {
    const command = "x".repeat(200);
    const presentation = presentToolCall("bash_exec", { command }, zh);
    const subject = presentation.subject ?? "";
    expect(subject.length).toBe(80);
    expect(subject.endsWith("…")).toBe(true);
    expect(presentation.title).toBe(`执行命令 ${subject}`);
  });

  it("prefers the query and falls back to domainCode for tool_search", () => {
    expect(presentToolCall("tool_search", { query: "git" }, zh).title).toBe("搜索工具 git");
    expect(presentToolCall("tool_search", { domainCode: "git" }, zh).title).toBe("搜索工具 git");
    expect(presentToolCall("tool_search", {}, zh).title).toBe("搜索工具");
    expect(presentToolCall("tool_search", {}, zh).title).not.toContain("{subject}");
    expect(presentToolCall("tool_search", {}, en).title).toBe("Search tools");
  });
});

describe("host extensions and locale", () => {
  it("accepts host overrides for nouns, verbs and messages", () => {
    configureToolPresentation({
      nouns: { widget: "gadget" },
      verbs: { frobnicate: "frob" },
      messages: {
        "en-US": { "tool.noun.gadget": "gadget", "tool.verb.frob": "Frobnicate" },
      },
      overrides: [{ match: "custom_thing", titleKey: "tool.title.custom" }],
      subjectKeys: { gadget: ["widget_id"] },
    });
    try {
      expect(presentToolCall("widget_frobnicate", { widget_id: "w1" }, en).title).toBe("Frobnicate gadget w1");
      expect(presentToolCall("custom_thing", { widget_id: "w1" }, en).subject).toBeUndefined();
    } finally {
      configureToolPresentation(undefined);
    }
  });

  it("normalizes and detects locales like the chat cards do", () => {
    expect(normalizeToolPresentationLocale(undefined)).toBe("en-US");
    expect(normalizeToolPresentationLocale("zh-Hans")).toBe("zh-CN");
    expect(normalizeToolPresentationLocale("en-GB")).toBe("en-US");
    expect(detectToolPresentationLocale(undefined, ["工具执行步骤"])).toBe("zh-CN");
    expect(detectToolPresentationLocale(undefined, ["Tool run steps"])).toBe("en-US");
    expect(detectToolPresentationLocale("en-US", ["工具执行步骤"])).toBe("en-US");
  });
});

/**
 * The 144 tool names the running product backend actually serves for
 * `Accept-Language: zh-CN` (baseline pulled to /tmp/tron_tool_catalog_zh.json).
 * Embedded as data so this regression suite never needs a live backend.
 */
const catalogToolNames = [
  "workspace_page", "workspace_get", "app_page", "app_create", "app_update", "app_delete",
  "app_restore", "automation_page", "automation_get", "automation_create", "automation_update",
  "automation_delete", "automation_restore", "automation_execute", "dude_notify",
  "dude_soul_read", "dude_soul_update", "dude_work_change", "task_page", "task_create",
  "task_update", "task_delete", "task_restore", "model_page", "model_create", "model_update",
  "model_enable", "model_disable", "model_delete", "platform_model_page", "platform_model_get",
  "platform_model_create", "platform_model_update", "platform_model_enable",
  "platform_model_disable", "platform_model_delete", "skill_page", "skill_view",
  "variable_page", "variable_create", "variable_update", "variable_delete",
  "platform_variable_page", "platform_variable_create", "platform_variable_update",
  "platform_variable_delete", "platform_prompt_page", "platform_prompt_get",
  "platform_prompt_create", "platform_prompt_update", "platform_prompt_delete",
  "platform_mcp_page", "platform_mcp_get", "platform_mcp_create", "platform_mcp_update",
  "platform_mcp_delete", "platform_resource_query", "platform_resource_get",
  "platform_resource_create", "platform_resource_update", "platform_resource_delete",
  "platform_resource_binary", "resource_query", "resource_get", "resource_create",
  "resource_update", "resource_delete", "resource_binary", "resource_data_source_create",
  "resource_data_source_update", "resource_server_create", "resource_server_account_create",
  "bash_exec", "bash_task_read", "bash_task_stop", "fs_read_text", "chat_attachment_read_text",
  "chat_attachment_parse_json", "fs_write_text", "fs_apply_patch", "fs_list", "fs_stat",
  "search_grep", "search_glob", "search_path", "terminal_start", "terminal_read",
  "terminal_write", "terminal_stop", "terminal_list", "memory_search", "memory_save",
  "memory_delete", "todo_update", "rag_search", "rag_graph_search", "rag_graph_expand",
  "rag_quality_sources", "rag_quality_cases", "rag_quality_start", "rag_quality_status",
  "rag_quality_cancel", "worktree_list", "worktree_create", "worktree_select", "git_status",
  "git_diff", "git_log", "git_switch_branch", "word_read", "word_create", "word_replace_text",
  "excel_read", "excel_write", "personai_search", "personai_generate_image",
  "personai_query_image", "personai_detect_text", "personai_detect_image", "media_read_image",
  "media_read_pdf", "web_fetch", "a2ui_request_input", "agent_get", "agent_spawn",
  "child_answer", "child_cancel", "child_list", "child_read", "child_send", "child_wait",
  "tool_execute", "tool_search", "skill_load", "skill_read_resource", "thread_answer",
  "thread_close", "thread_create", "thread_list", "thread_read", "thread_send", "thread_wait",
  "chat_ask_user", "discovery_expand_tool_domain",
] as const;

/** The 22 catalogue tools whose backend `zh` name is still the raw tool id. */
const nativeDomainToolNames = [
  "a2ui_request_input", "agent_get", "agent_spawn", "child_answer", "child_cancel",
  "child_list", "child_read", "child_send", "child_wait", "tool_execute", "tool_search",
  "skill_load", "skill_read_resource", "thread_answer", "thread_close", "thread_create",
  "thread_list", "thread_read", "thread_send", "thread_wait", "chat_ask_user",
  "discovery_expand_tool_domain",
] as const;

describe("real catalogue coverage", () => {
  it("embeds the exact 144-name, 22-native-name baseline", () => {
    expect(catalogToolNames).toHaveLength(144);
    expect(new Set(catalogToolNames).size).toBe(144);
    expect(nativeDomainToolNames).toHaveLength(22);
  });

  it.each(catalogToolNames)("table-hits %s with a readable, id-free title", (name) => {
    const presentation = presentToolCall(name, {}, zh);
    expect(presentation.title).toBeTruthy();
    expect(presentation.title).not.toContain("_");
    expect(presentation.title).not.toContain("tool_search");
    expect(presentation.title).not.toContain("tool_execute");
    expect(presentation.title).not.toBe(name);
    expect(presentation.verbKey, `${name} verb`).toBeTruthy();
    expect(presentation.nounKey, `${name} noun`).toBeTruthy();
  });

  it("keeps the whole catalogue exactly table-hit and id-free in en-US too", () => {
    for (const name of catalogToolNames) {
      const presentation = presentToolCall(name, {}, en);
      expect(presentation.title, name).toBeTruthy();
      expect(presentation.title, name).not.toMatch(/tool_search|tool_execute|_/);
      expect(presentation.title, name).not.toBe(name);
      expect(presentation.verbKey, `${name} verb`).toBeTruthy();
      expect(presentation.nounKey, `${name} noun`).toBeTruthy();
    }
  });

  it("never falls back to the generic template for a catalogue tool", () => {
    const generic = presentToolCall("zzz_unknown_nothing", {}, zh).title;
    for (const name of catalogToolNames) {
      expect(presentToolCall(name, {}, zh).title, name).not.toBe(generic);
    }
  });

  it("matches the catalogue's real zh wording for representative tools", () => {
    expect(presentToolCall("app_create", {}, zh).title).toContain("创建应用");
    expect(presentToolCall("bash_exec", {}, zh).title).toContain("命令");
    expect(presentToolCall("fs_write_text", {}, zh).title).toContain("文件");
    expect(presentToolCall("bash_exec", { command: "cargo test" }, zh).title).toContain("cargo test");
    expect(presentToolCall("app_create", {}, zh).title).toContain("应用");
    expect(presentToolCall("bash_exec", { command: "cargo test" }, zh).title).toBe("执行命令 cargo test");
    expect(presentToolCall("fs_write_text", { path: "src/main.rs" }, zh).title).toBe("编辑文件 src/main.rs");
  });

  it("renders every native-domain tool without its raw id", () => {
    for (const name of nativeDomainToolNames) {
      const presentation = presentToolCall(name, {}, zh);
      expect(presentation.title, name).not.toBe(name);
      expect(presentation.title, name).not.toContain("_");
      expect(presentation.nounKey, name).toBeTruthy();
      expect(presentation.verbKey, name).toBeTruthy();
    }
    expect(presentToolCall("child_read", {}, zh).title).toContain("子任务");
    expect(presentToolCall("thread_read", {}, zh).title).toContain("会话");
  });
});

describe("host display names", () => {
  it("normalizes ids and echoes the same way everywhere", () => {
    expect(normalizeToolNameIdentity(" Tool_Search ")).toBe("toolsearch");
    expect(normalizeToolNameIdentity("tool search")).toBe("toolsearch");
    expect(normalizeToolNameIdentity(undefined)).toBe("");
    expect(isRawToolNameOverride("fs_read_text", "FS-Read_Text")).toBe(true);
    expect(isRawToolNameOverride("fs_read_text", "   ")).toBe(true);
    expect(isRawToolNameOverride("fs_read_text", undefined)).toBe(true);
    expect(isRawToolNameOverride("fs_read_text", "读取文件")).toBe(false);
  });

  it("compares gateway envelopes through their unwrapped inner tool name", () => {
    expect(isRawToolNameOverride("tool_execute", "fs_read_text", { tool: "fs_read_text" })).toBe(true);
    expect(isRawToolNameOverride("tool_execute", "tool_execute", { tool: "fs_read_text" })).toBe(true);
    expect(isRawToolNameOverride("tool_execute", "读取文件", { tool: "fs_read_text" })).toBe(false);
  });

  it("ignores a host name that only echoes the raw tool id", () => {
    expect(toolCompactLabel("tool_search", { query: "git" }, "tool_search", "zh-CN")).toBe("搜索工具 git");
    const skill = toolCompactLabel("skill_load", { skill: "pdf" }, "skill_load", "zh-CN");
    expect(skill).toContain("技能");
    expect(skill).not.toContain("skill_load");
    expect(toolDisplayName("agent_spawn", { agent: "x" }, "agent_spawn", "zh-CN")).not.toContain("agent_spawn");
    expect(toolDisplayName("tool_search", { query: "git" }, " tool_search ", "zh-CN")).toBe("搜索工具 git");
    expect(
      toolCompactLabel(
        "tool_execute",
        { tool: "fs_read_text", arguments: { path: "a.md" } },
        "tool_execute",
        "zh-CN",
      ),
    ).toBe("读取文件 a.md");
  });

  it("still prefers a host name that is actually readable", () => {
    expect(toolDisplayName("fs_read_text", { path: "a.md" }, "自定义工具", "zh-CN")).toBe("自定义工具");
    expect(toolCompactLabel("fs_read_text", { path: "a.md" }, "自定义工具", "zh-CN")).toBe("自定义工具 a.md");
    expect(toolDisplayName("fs_read_text", {}, undefined, "zh-CN")).toBe("读取文件");
    expect(toolDisplayName("fs_read_text", {}, "自定义工具", "en-US")).toBe("自定义工具");
  });
});

describe("gateway parser parity with core", () => {
  it.each([
    { tool: "fs_read_text", path: "a.md" },
    { tool: "fs_read_text", arguments: null, input: { ignored: true }, path: "a.md" },
    { tool: " fs_read_text ", args: '{"path":"a.md"}' },
    { tool: "fs_read_text", input: { path: "a.md" } },
  ])("preserves accepted inner arguments: %j", (envelope) => {
    expect(unwrapGatewayToolCall("tool_execute", envelope)).toEqual({ toolName: "fs_read_text", args: { path: "a.md" } });
    expect(toolCompactLabel("tool_execute", envelope, undefined, "zh-CN")).toBe("读取文件 a.md");
  });

  it.each([
    { tool: "fs_read_text", arguments: "not json" },
    { tool: "fs_read_text", arguments: "[]" },
    { tool: "fs_read_text", arguments: "null" },
    { tool: "fs_read_text", arguments: [] },
    { tool: "fs_read_text", arguments: 1 },
    { tool: "fs_read_text", arguments: false, input: {} },
    { tool: " ", arguments: {} },
    '{"tool":"fs_read_text","arguments":{}}',
  ])("keeps rejected envelope identity: %j", (envelope) => {
    expect(unwrapGatewayToolCall("tool_execute", envelope)).toEqual({ toolName: "tool_execute", args: envelope });
    expect(presentToolCall("tool_execute", envelope, zh).rawToolName).toBe("tool_execute");
  });
});

describe("batch tool presentation", () => {
  it("shows the batch size after unwrapping the gateway", () => {
    const args = {tool:"fs_read_text",arguments:{items:[{path:"a.txt"},{path:"b.txt"}]}};
    expect(presentToolCall("tool_execute", args, {locale:"zh-CN"}).title).toBe("读取文件 a.txt, b.txt（2 项）");
    expect(presentToolCall("tool_execute", args, {locale:"en-US"}).title).toBe("Read file a.txt, b.txt (2 items)");
  });
  it("retains single-operation file-edit titles", () => {
    expect(presentToolCall("tool_execute", {tool:"fs_write_text",arguments:{path:"a.txt",content:"x"}}, {locale:"en-US"}).title).toBe("Edit file a.txt");
  });
});
