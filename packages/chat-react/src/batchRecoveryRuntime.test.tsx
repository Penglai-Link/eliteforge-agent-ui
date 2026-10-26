// @vitest-environment jsdom
import { act,cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,expect,it,vi } from "vitest";
import type {ChatAdapter,ChatSession} from "@eliteforge/agent-ui-chat-core";
import {pendingBatchApprovalHistory} from "../../../contracts/batch-recovery";
import {ChatRuntimeWindow} from "./ChatRuntimeWindow";
import {ensureTestLocalStorage} from "./testLocalStorage";
afterEach(()=>{cleanup();window.localStorage.clear();});
it("allows a new message after approval processing fails despite retained pending history",async()=>{
  ensureTestLocalStorage();
  Object.defineProperty(HTMLElement.prototype,"scrollTo",{configurable:true,value:vi.fn()});

  const history = pendingBatchApprovalHistory();
  const session:ChatSession = {id:1,sessionId:"session",title:"Approvals",status:"ACTIVE",createdAt:new Date(900).toISOString(),updatedAt:new Date(900).toISOString()};
  let observer!: Parameters<NonNullable<ChatAdapter["answerUserInputRequestStream"]>>[3];
  let reject!: (error:Error)=>void;
  const host:ChatAdapter = {capabilities:{supportsStreaming:true,supportsAgui:true,supportsUserInputRequests:true},
    createSession:vi.fn(),loadMessages:vi.fn(),loadAguiEvents:vi.fn(),loadHistory:vi.fn(async()=>history),
    streamMessage:vi.fn(async()=>({session,run:{runId:"next",status:"COMPLETED",finalOutput:"continued",stepCount:1},messages:[],userInputRequest:null})),
    answerUserInputRequestStream:vi.fn((_s,_id,_input,handlers)=>{observer=handlers;return new Promise((_resolve,fail)=>{reject=fail;});})};
  const frame = (type:string) => ({type,threadId:"session",runId:"resume",metadata:{framework:{runId:"logical-batch-run"}},timestamp:5000});

  render(<ChatRuntimeWindow adapter={host} initialSession={session} draft="continue" config={{floating:false}} onError={vi.fn()}/>);
  fireEvent.click(await screen.findByRole("button",{name:"Reject"}));
  await waitFor(()=>expect(host.answerUserInputRequestStream).toHaveBeenCalledOnce());
  await act(async()=>{observer.onAguiEvent?.(frame("RUN_STARTED"));observer.onAguiEvent?.({...frame("RUN_ERROR"),code:"AGENT_RUN_FAILED",message:"host audit unavailable"});reject(new Error("host audit unavailable"));});
  await waitFor(()=>expect(screen.queryByRole("button",{name:"Approve"})).toBeNull());
  fireEvent.click(screen.getByRole("button",{name:"Send"}));
  await waitFor(()=>expect(host.streamMessage).toHaveBeenCalledOnce());
});
