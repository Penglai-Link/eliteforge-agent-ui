// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./ChatPanel";

beforeEach(() => Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() }));
afterEach(cleanup);
describe("presentation health render contract", () => {
  it("shows localized presentation health while preserving a successful terminal summary", () => {
    const startedAt=Date.now()-1000;
    render(<ChatPanel draft="" onDraftChange={() => {}} onSend={() => {}} showHeader={false}
      session={{ id:1,sessionId:"SESSION",title:"Test",status:"ACTIVE",createdAt:new Date(startedAt).toISOString(),updatedAt:new Date(startedAt).toISOString() }}
      messages={[{ id:1,messageId:"USER",sessionId:"SESSION",runId:"RUN",role:"USER",actor:"User",channel:"MAIN_AGENT",content:"Run",createdAt:new Date(startedAt).toISOString() }]}
      protocolEvents={[
        { type:"RUN_STARTED",runId:"RUN",threadId:"SESSION",timestamp:startedAt },
        { type:"RUN_FINISHED",runId:"RUN",threadId:"SESSION",timestamp:startedAt+1000,outcome:{type:"success"},presentationIncomplete:true },
      ]}
      workRailLabels={{ ariaLabel:"Work",preparing:"Preparing",responding:"Responding",thinking:"Thinking",workedFor:duration=>`Worked for ${duration}`,workingFor:duration=>`Working for ${duration}`,failed:"Run failed",notices:{presentationIncomplete:"展示回放不完整",presentationIncompleteDetail:"执行结果已单独报告"} }}
    />);
    expect(screen.getByText("展示回放不完整")).toBeTruthy();
    expect(screen.getByText("执行结果已单独报告")).toBeTruthy();
    expect(screen.getByText(/^Worked for/)).toBeTruthy();
    expect(screen.queryByText(/Run failed/)).toBeNull();
  });
});

it("keeps the elapsed running summary when presentation replay fails without ending execution",()=> {
  const time=Date.now()-1000;
  render(<ChatPanel draft="" onDraftChange={()=>{}} onSend={()=>{}} session={{id:1,sessionId:"SESSION",title:"Partial",status:"ACTIVE",createdAt:new Date(time).toISOString(),updatedAt:new Date(time).toISOString()}} messages={[{id:1,messageId:"USER",sessionId:"SESSION",runId:"RUN",role:"USER",actor:"User",channel:"MAIN_AGENT",content:"Keep known output",createdAt:new Date(time).toISOString()}]} protocolEvents={[{type:"RUN_STARTED",runId:"RUN",threadId:"SESSION",timestamp:time},{type:"RUN_ERROR",runId:"RUN",threadId:"SESSION",timestamp:time+1,code:"AGUI_BACKPRESSURE",message:"output overflow"}]} workRailLabels={{ariaLabel:"Work",preparing:"Preparing",responding:"Responding",thinking:"Thinking",workedFor:duration=>`Worked for ${duration}`,workingFor:duration=>`Working for ${duration}`,failed:"Run failed"}}/>);
  expect(screen.getAllByText("Presentation replay is incomplete").length).toBeGreaterThan(0);
  expect(screen.queryByText(/Run failed/)).toBeNull();expect(screen.getByText(/^Working for/)).toBeTruthy();expect(screen.queryByText("Thinking")).toBeNull();
});

it("keeps an authoritative native failure visible when product acknowledgment also fails",()=> {
 const time=Date.now()-1000;
 render(<ChatPanel draft="" onDraftChange={()=>{}} onSend={()=>{}} session={{id:1,sessionId:"SESSION",title:"Failure",status:"ACTIVE",createdAt:new Date(time).toISOString(),updatedAt:new Date(time).toISOString()}} messages={[{id:1,messageId:"USER",sessionId:"SESSION",runId:"RUN",role:"USER",actor:"User",channel:"MAIN_AGENT",content:"Run",createdAt:new Date(time).toISOString()}]} protocolEvents={[{type:"RUN_STARTED",runId:"RUN",threadId:"SESSION",timestamp:time},{type:"RUN_ERROR",runId:"RUN",threadId:"SESSION",timestamp:time+1,code:"MODEL_PROVIDER_FAILED",message:"Native execution failed",presentationIncomplete:true,productCompletionError:{code:"CHAT_STREAM_COMPLETION_UNAVAILABLE"}}]} workRailLabels={{ariaLabel:"Work",preparing:"Preparing",responding:"Responding",thinking:"Thinking",workedFor:duration=>`Worked for ${duration}`,workingFor:duration=>`Working for ${duration}`,failed:"Run failed"}}/>);
 expect(screen.getByText(/^Worked for/)).toBeTruthy();expect(screen.getByText("Native execution failed")).toBeTruthy();expect(screen.getByText("Presentation replay is incomplete")).toBeTruthy();
});

it("renders a durable MCP warning with a completed native run without a failed summary",()=> {
 const time=Date.now()-1000;
 const props={draft:"",onDraftChange:()=>{},onSend:()=>{},session:{id:1,sessionId:"SESSION",title:"Warning",status:"ACTIVE",createdAt:new Date(time).toISOString(),updatedAt:new Date(time).toISOString()},messages:[{id:1,messageId:"USER",sessionId:"SESSION",runId:"RUN",role:"USER" as const,actor:"User",channel:"MAIN_AGENT" as const,content:"Run",createdAt:new Date(time).toISOString()}],workRailLabels:{ariaLabel:"Work",preparing:"Preparing",responding:"Responding",thinking:"Thinking",workedFor:(duration:string)=>`Worked for ${duration}`,workingFor:(duration:string)=>`Working for ${duration}`,failed:"Run failed",notices:{mcpUnavailable:"MCP服务不可用"}}};
 const protocolEvents=[{type:"CUSTOM" as const,name:"tron.mcp.runtime.warning",runId:"RUN",threadId:"SESSION",timestamp:time,metadata:{tron:{eventId:"bus:12:0"}},value:{serverCode:"MCP-1",serverName:"Example MCP",stage:"discovery",message:"discovery failed"}},{type:"RUN_STARTED" as const,runId:"RUN",threadId:"SESSION",timestamp:time},{type:"RUN_FINISHED" as const,runId:"RUN",threadId:"SESSION",timestamp:time+1,outcome:{type:"success" as const}}];
 const rendered=render(<ChatPanel {...props} protocolEvents={protocolEvents}/>);
 expect(screen.getByText("MCP服务不可用")).toBeTruthy();expect(screen.getByText("Example MCP: discovery failed")).toBeTruthy();expect(screen.getByText(/^Worked for/)).toBeTruthy();expect(screen.queryByText(/Run failed/)).toBeNull();
 rendered.rerender(<ChatPanel {...props} protocolEvents={JSON.parse(JSON.stringify(protocolEvents))}/>);
 expect(screen.getAllByText("MCP服务不可用")).toHaveLength(1);expect(screen.getByText(/^Worked for/)).toBeTruthy();
});

it("renders real native progress while argument END does not mark execution completed",()=> {
 const time=Date.now()-1000;
 const metadata={framework:{runId:"NATIVE",executionId:"EXECUTION",sourceSequence:1}};
 const props={draft:"",onDraftChange:()=>{},onSend:()=>{},session:{id:1,sessionId:"SESSION",title:"Progress",status:"ACTIVE",createdAt:new Date(time).toISOString(),updatedAt:new Date(time).toISOString()},messages:[{id:1,messageId:"USER",sessionId:"SESSION",runId:"RUN",role:"USER" as const,actor:"User",channel:"MAIN_AGENT" as const,content:"Run",createdAt:new Date(time).toISOString()}],workRailLabels:{ariaLabel:"Work",preparing:"Preparing",responding:"Responding",thinking:"Thinking",workedFor:(duration:string)=>`Worked for ${duration}`,workingFor:(duration:string)=>`Working for ${duration}`,failed:"Run failed",tool:{running:(name:string)=>`Running ${name}`,completed:(name:string)=>`Completed ${name}`}}};
 const events=[{type:"RUN_STARTED" as const,runId:"RUN",threadId:"SESSION",timestamp:time,metadata},{type:"TOOL_CALL_START" as const,runId:"RUN",threadId:"SESSION",toolCallId:"TOOL",toolCallName:"progress",timestamp:time,metadata},{type:"TOOL_CALL_END" as const,runId:"RUN",threadId:"SESSION",toolCallId:"TOOL",timestamp:time,metadata},{type:"ACTIVITY_SNAPSHOT" as const,runId:"RUN",threadId:"SESSION",messageId:"ACTIVITY",activityType:"tron.tool.progress",timestamp:time,content:{toolCallId:"TOOL",toolName:"progress",line:"live native progress"},metadata}];
 const rendered=render(<ChatPanel {...props} protocolEvents={events}/>);
 const workSummary = screen.getByRole("button", { name: /Working for/ });
 expect(workSummary.getAttribute("aria-expanded")).toBe("false");
 fireEvent.click(workSummary);
 fireEvent.click(screen.getByRole("button", {name:/Running progress/i}));
 expect(screen.getByText("Running Progress")).toBeTruthy();expect(screen.getByText("live native progress")).toBeTruthy();expect(screen.queryByText("Completed Progress")).toBeNull();
 rendered.rerender(<ChatPanel {...props} protocolEvents={[...events,{type:"TOOL_CALL_RESULT",runId:"RUN",threadId:"SESSION",toolCallId:"TOOL",content:"actual result",timestamp:time+1,metadata}]}/>);
 expect(screen.getByText("Completed Progress")).toBeTruthy();expect(screen.queryByText("Running Progress")).toBeNull();
});
