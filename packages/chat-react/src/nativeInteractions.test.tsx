// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ChatAdapter, ChatAguiStreamEvent, ChatSession } from "@eliteforge/agent-ui-chat-core";
import { ChatRuntimeWindow } from "./ChatRuntimeWindow";
import { ensureTestLocalStorage } from "./testLocalStorage";
beforeEach(() => { ensureTestLocalStorage(); Object.defineProperty(HTMLElement.prototype,"scrollTo",{configurable:true,value:vi.fn()}); });
afterEach(() => {cleanup();window.localStorage.clear();});
it.each([true,false])("answers a replayed native approval as raw %s even when the legacy pending card API returns none", async (answer) => {
  const time=Date.now()-1000;
  const session:ChatSession={id:1,sessionId:"SESSION",title:"Approval",status:"ACTIVE",createdAt:new Date(time).toISOString(),updatedAt:new Date(time).toISOString()};
  let protocol:ChatAguiStreamEvent[]=[{type:"RUN_STARTED",runId:"RUN",threadId:"SESSION",timestamp:time},{type:"RUN_FINISHED",runId:"RUN",threadId:"SESSION",timestamp:time+1,outcome:{type:"interrupt",interrupts:[{id:"SDK-APPROVAL",reason:"approval_required",message:"Allow this operation?",responseSchema:{type:"boolean"}}]}}];
  const messages=[{id:1,messageId:"USER",sessionId:"SESSION",role:"USER",actor:"User",channel:"MAIN_AGENT",content:"Please perform the operation",createdAt:new Date(time).toISOString()}];
  const answerRequest=vi.fn(async (_session:ChatSession,_id:string,input:import("@eliteforge/agent-ui-chat-core").ChatUserInputAnswerInput) => {
    expect(input).toEqual({answers:[],resume:[{interruptId:"SDK-APPROVAL",status:"resolved",payload:answer}]});
    protocol=[...protocol,{type:"RUN_STARTED",runId:"NEXT",threadId:"SESSION",timestamp:time+2},{type:"RUN_FINISHED",runId:"NEXT",threadId:"SESSION",timestamp:time+3,outcome:{type:"success"}}];
    return {session,run:{runId:"NEXT",status:"COMPLETED" as const,finalOutput:"",stepCount:1},messages,userInputRequest:null};
  });
  const adapter:ChatAdapter={capabilities:{supportsAbort:true,supportsStreaming:true,supportsAgui:true,supportsProtocolReplay:true,supportsActiveRun:true,supportsUserInputRequests:true},createSession:vi.fn(),deleteSession:vi.fn(),streamMessage:vi.fn(),loadMessages:vi.fn().mockResolvedValue(messages),loadAguiEvents:vi.fn().mockResolvedValue([]),loadProtocolEvents:vi.fn(async()=>protocol),getActiveRun:vi.fn().mockResolvedValue({sessionId:"SESSION",activeRun:null}),loadUserInputRequests:vi.fn().mockResolvedValue([]),answerUserInputRequestStream:answerRequest};
  render(<ChatRuntimeWindow adapter={adapter} config={{floating:false}} initialSession={session} onError={vi.fn()}/>);
  fireEvent.click(await screen.findByRole("button",{name:answer?"Approve":"Reject"}));
  await waitFor(()=>expect(answerRequest).toHaveBeenCalledWith(expect.objectContaining({sessionId:"SESSION"}),"SDK-APPROVAL",expect.anything(),expect.anything()));
  await waitFor(()=>expect(screen.queryByRole("button",{name:"Approve"})).toBeNull());
  expect(adapter.streamMessage).not.toHaveBeenCalled();
});
