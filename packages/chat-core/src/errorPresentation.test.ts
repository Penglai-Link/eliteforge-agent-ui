import { describe, expect, it } from "vitest";
import { historyMessages, type SessionHistory } from "./history";
import { chatErrorPresentation } from "./errorPresentation";
const raw = 'operation result is unknown: model stream failed before completion: ' + JSON.stringify({ type: "response.failed", response: { error: { code: "InvalidParameter", message: "Please check the schema definition for tool: a2ui_publish." } } });
describe("provider error presentation", () => {
  it("keeps diagnostics separate from a localized tool schema summary", () => {
    const view = chatErrorPresentation(raw, "运行失败");
    expect(view.summary).toBe("模型服务拒绝了工具 a2ui_publish 的参数定义，请检查工具 Schema。");
    expect(view.details).toBe(raw);
    expect(chatErrorPresentation(raw).summary).toContain("a2ui_publish");
  });
  it("preserves ordinary messages and degrades incomplete diagnostic frames", () => {
    expect(chatErrorPresentation("Access denied")).toEqual({ summary: "Access denied", details: "" });
    expect(chatErrorPresentation("model stream failed before completion: {truncated").summary).not.toContain("{truncated");
  });
});

it("projects a failure body only into diagnostics while preserving user text and ordinary JSON", () => {
  const page: SessionHistory = { sessionId:"SESSION",version:"1",nextCursor:null,pendingInteractions:[],activeRuns:[],
    runs:[{id:"RUN",sessionId:"SESSION",rootRunId:"RUN",parentRunId:null,status:"Failed",startedAtMs:1,finishedAtMs:2,error:raw}],
    records:{steps:[],toolInvocations:[],interactions:[],messages:[
      {id:"USER",runId:"RUN",stepId:null,role:"User",content:[{type:"Text",text:raw}],structured:null,status:"Completed",createdAtMs:1},
      {id:"ERROR",runId:"RUN",stepId:null,role:"Assistant",content:[{type:"Text",text:raw}],structured:null,status:"Interrupted",createdAtMs:2},
      {id:"JSON",runId:"OTHER",stepId:null,role:"Assistant",content:[{type:"Text",text:'{"ok":true}'}],structured:null,status:"Completed",createdAtMs:3},
    ]}};
  const messages = historyMessages(page);
  expect(messages[0].content).toBe(raw);
  expect(messages[1].content).toBe("");
  expect(messages[1].history?.run?.error).toBe(raw);
  expect(messages[2].content).toBe('{"ok":true}');
});
