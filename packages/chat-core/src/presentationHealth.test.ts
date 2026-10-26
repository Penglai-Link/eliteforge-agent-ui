import { describe, expect, it } from "vitest";
import { buildAguiRunNotices, buildAguiUserWorkCards, mergeTranscriptAguiEvents } from "./transcript";
import { isAguiRunTerminal } from "./aguiWork";
import type { ChatAguiEvent, ChatAguiStreamEvent } from "./types";

describe("presentation health notices", () => {
  it("retains known canonical usage and reports incomplete replay", () => {
    const event: ChatAguiEvent = { id: "AUDIT", type: "agent.model.usage", eventName: "agent.model.usage", runId: "RUN", streamKey: "SESSION", occurredAt: "2026-10-02T00:00:00Z", outcome: "SUCCESS", metadata: { replayIncomplete: "true", usage_audit_json: '{"actual":{"totalTokens":12}}' } };
    const events = [event];
    expect(buildAguiRunNotices(events)).toEqual([{ kind: "runError", code: "AGENT_AGUI_REPLAY_INCOMPLETE", message: "" }]);
    expect(events[0].metadata.usage_audit_json).toBe('{"actual":{"totalTokens":12}}');
    expect(events[0].outcome).toBe("SUCCESS");
  });
  it("permits successful execution and incomplete presentation together without synthesizing RUN_ERROR", () => {
    const finished: ChatAguiStreamEvent = { type: "RUN_FINISHED", threadId: "SESSION", runId: "RUN", outcome: { type: "success" }, presentationIncomplete: true };
    expect(buildAguiRunNotices([finished])).toHaveLength(1);
    expect(isAguiRunTerminal([finished])).toBe(true);
    expect(finished.type).toBe("RUN_FINISHED");
    expect(finished.outcome).toEqual({ type: "success" });
  });
  it("recognizes the host's nonterminal incomplete CUSTOM event without closing execution", () => {
    const event: ChatAguiStreamEvent = { type: "CUSTOM", name: "tron.presentation.incomplete", value: { code: "AGENT_AGUI_REPLAY_INCOMPLETE" } };
    expect(buildAguiRunNotices([event])).toHaveLength(1);
    expect(isAguiRunTerminal([event])).toBe(false);
  });
});


describe("protocol replay identity", () => {
  const chunk = (sequence: number): ChatAguiStreamEvent => ({
    type: "TEXT_MESSAGE_CONTENT", threadId: "SESSION", runId: "RUN", messageId: "MESSAGE", timestamp: 1, delta: "ha",
    metadata: { framework: { executionId: "EXECUTION", sourceSequence: sequence }, tron: { eventId: "native:EXECUTION:" + sequence + ":0" } },
  });
  it("retains identical chunks with distinct source identities and collapses repeated delivery of the same identity", () => {
    const events=mergeTranscriptAguiEvents([chunk(1),chunk(2)],[chunk(1)]);
    expect(events).toHaveLength(2);
    expect(events.map((event)=>event.delta).join("")).toBe("haha");
  });
  it("retains separately received legacy chunks rather than guessing identity from content", () => {
    const legacy: ChatAguiStreamEvent={ type:"TEXT_MESSAGE_CONTENT",messageId:"M",timestamp:1,delta:"ha" };
    expect(mergeTranscriptAguiEvents([legacy],[{...legacy}])).toHaveLength(2);
  });
});

import { openAguiProtocolRunCodes } from "./transcript";
import { aguiWorkElapsedMilliseconds } from "./aguiWork";
it("does not invent an active execution from presentation health alone", () => { expect(openAguiProtocolRunCodes([{type:"CUSTOM",name:"agent.presentation.incomplete",threadId:"SESSION",runId:"RUN"}],"SESSION").size).toBe(0); });

it("treats native AGUI output failure as presentation health, without inferring execution failure",()=> {
  const event:ChatAguiStreamEvent={type:"RUN_ERROR",code:"AGUI_BACKPRESSURE",runId:"RUN",threadId:"SESSION",message:"output overflow"};
  expect(buildAguiRunNotices([event])).toEqual([{kind:"runError",code:"AGENT_AGUI_REPLAY_INCOMPLETE",message:""}]);
});

it("keeps native execution timing and open-run classification independent of output failure",()=> {
 const events:ChatAguiStreamEvent[]=[{type:"RUN_STARTED",runId:"RUN",threadId:"SESSION",timestamp:100},{type:"RUN_ERROR",runId:"RUN",threadId:"SESSION",timestamp:110,code:"AGUI_BACKPRESSURE"}];
 expect(isAguiRunTerminal(events)).toBe(false);expect(openAguiProtocolRunCodes(events,"SESSION").has("RUN")).toBe(true);
 expect(aguiWorkElapsedMilliseconds(events,150)).toBe(50);expect(aguiWorkElapsedMilliseconds(events,200)).toBe(100);
 expect(isAguiRunTerminal([...events,{type:"RUN_FINISHED",runId:"RUN",threadId:"SESSION",timestamp:210,outcome:{type:"success"}}])).toBe(true);
});

it("does not call lost product acknowledgment an execution failure when native status is unknown",()=> {
 const event:ChatAguiStreamEvent={type:"RUN_ERROR",runId:"RUN",threadId:"SESSION",code:"CHAT_STREAM_COMPLETION_UNAVAILABLE",presentationIncomplete:true,productCompletionError:{code:"CHAT_STREAM_COMPLETION_UNAVAILABLE"}};
 expect(isAguiRunTerminal([event])).toBe(false);expect(buildAguiRunNotices([event])).toEqual([{kind:"runError",code:"AGENT_AGUI_REPLAY_INCOMPLETE",message:""}]);
});

it("preserves a known native execution failure alongside lost product acknowledgment",()=> {
 const event:ChatAguiStreamEvent={type:"RUN_ERROR",runId:"RUN",threadId:"SESSION",code:"MODEL_PROVIDER_FAILED",message:"Native execution failed",presentationIncomplete:true,productCompletionError:{code:"CHAT_STREAM_COMPLETION_UNAVAILABLE"}};
 expect(isAguiRunTerminal([event])).toBe(true);expect(buildAguiRunNotices([event])).toEqual([{kind:"runError",code:"MODEL_PROVIDER_FAILED",message:"Native execution failed"},{kind:"runError",code:"AGENT_AGUI_REPLAY_INCOMPLETE",message:""}]);
});

it("projects persistent MCP warnings independently of native execution status",()=> {
 const warning:ChatAguiStreamEvent={type:"CUSTOM",name:"tron.mcp.runtime.warning",runId:"RUN",threadId:"SESSION",metadata:{tron:{eventId:"bus:12:0"}},value:{serverCode:"MCP-1",serverName:"Example MCP",stage:"discovery",message:"discovery failed"}};
 const started:ChatAguiStreamEvent={type:"RUN_STARTED",runId:"RUN",threadId:"SESSION"};
 const finish:ChatAguiStreamEvent={type:"RUN_FINISHED",runId:"RUN",threadId:"SESSION",outcome:{type:"success"}};
 const notice={kind:"integrationWarning",id:"bus:12:0",code:"MCP_RUNTIME_UNAVAILABLE",message:"Example MCP: discovery failed"};
 expect(buildAguiRunNotices([warning,started])).toEqual([notice]);
 expect(isAguiRunTerminal([warning,started])).toBe(false);
 expect(buildAguiRunNotices([warning,started,finish])).toEqual([notice]);
 expect(buildAguiRunNotices(mergeTranscriptAguiEvents([warning,started,finish],[warning]))).toEqual([notice]);
});

it("keeps native tools running after argument end and projects correlated progress snapshots",()=> {
 const metadata={framework:{runId:"NATIVE",executionId:"EXECUTION",sourceSequence:1}};
 const events:ChatAguiStreamEvent[]=[{type:"TOOL_CALL_START",runId:"RUN",threadId:"SESSION",toolCallId:"TOOL",toolCallName:"progress",metadata},{type:"TOOL_CALL_END",runId:"RUN",threadId:"SESSION",toolCallId:"TOOL",metadata}];
 const first=buildAguiUserWorkCards(events)[0];if(first?.kind!=="toolGroup") throw new Error("expected actual tool");expect(first.value.toolCards[0].ended).toBe(false);
 const snapshot=(sequence:number):ChatAguiStreamEvent=>({type:"ACTIVITY_SNAPSHOT",runId:"RUN",threadId:"SESSION",messageId:"ACTIVITY",activityType:"tron.tool.progress",content:{toolCallId:"TOOL",toolName:"progress",line:"same progress"},metadata:{framework:{runId:"NATIVE",executionId:"EXECUTION",sourceSequence:sequence},tron:{eventId:`native:EXECUTION:${sequence}:0`}}});
 const progress=buildAguiUserWorkCards(mergeTranscriptAguiEvents(events,[snapshot(2),snapshot(3)]))[0];if(progress?.kind!=="toolGroup") throw new Error("expected actual tool");expect(progress.value.toolCards[0].ended).toBe(false);expect(progress.value.toolCards[0].logs).toEqual(["same progress","same progress"]);
 const done=buildAguiUserWorkCards([...events,snapshot(2),{type:"TOOL_CALL_RESULT",runId:"RUN",threadId:"SESSION",toolCallId:"TOOL",content:"actual result",metadata}])[0];if(done?.kind!=="toolGroup") throw new Error("expected actual tool");expect(done.value.toolCards[0].ended).toBe(true);expect(done.value.toolCards[0].result).toBe("actual result");
});
