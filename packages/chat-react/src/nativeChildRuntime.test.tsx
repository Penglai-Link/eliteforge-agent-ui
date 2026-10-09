// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import type { ChatAdapter,ChatAguiStreamEvent,ChatSendResult,ChatSession,ChatStreamHandlers } from "@eliteforge/agent-ui-chat-core";
import { ChatRuntimeWindow } from "./ChatRuntimeWindow";
import { ensureTestLocalStorage } from "./testLocalStorage";
beforeEach(()=>{ensureTestLocalStorage();Object.defineProperty(HTMLElement.prototype,"scrollTo",{configurable:true,value:vi.fn()});});
afterEach(()=>{cleanup();window.localStorage.clear();});
it("keeps the actual parent observer active after a raw child error and settles only with the parent's successful product result",async()=> {
 const session:ChatSession={id:1,sessionId:"SESSION",title:"Goal",status:"ACTIVE",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 let handlers:ChatStreamHandlers|undefined;let finish!: (result:ChatSendResult)=>void;
 const protocol:ChatAguiStreamEvent[]=[];const onError=vi.fn();const onRunStateChange=vi.fn();
 const adapter:ChatAdapter={capabilities:{supportsAbort:true,supportsAgui:true,supportsProtocolReplay:true,supportsStreaming:true},createSession:vi.fn(),deleteSession:vi.fn(),loadMessages:vi.fn().mockResolvedValue([]),loadAguiEvents:vi.fn().mockResolvedValue([]),loadProtocolEvents:vi.fn(async()=>protocol),streamMessage:vi.fn((_session,_input,observer)=>{handlers=observer;return new Promise<ChatSendResult>((resolve)=>{finish=resolve;});})};
 render(<ChatRuntimeWindow adapter={adapter} config={{floating:false}} initialSession={session} onError={onError} onRunStateChange={onRunStateChange}/>);
 await waitFor(()=>expect(adapter.loadMessages).toHaveBeenCalled());fireEvent.change(screen.getByRole("textbox"),{target:{value:"Continue the goal"}});fireEvent.keyDown(screen.getByRole("textbox"),{key:"Enter"});
 await waitFor(()=>expect(adapter.streamMessage).toHaveBeenCalled());
 act(()=>{for(const event of [{type:"RUN_STARTED",runId:"INITIAL",threadId:"SESSION",timestamp:Date.now()},{type:"RUN_ERROR",runId:"CHILD",threadId:"SESSION",timestamp:Date.now()+1,code:"MODEL_PROVIDER_FAILED",message:"Child provider failed",metadata:{framework:{runId:"SDK-CHILD"}}}] as ChatAguiStreamEvent[]) {protocol.push(event);handlers?.onAguiEvent?.(event);}});
 await waitFor(()=>expect(onRunStateChange.mock.calls.at(-1)?.[0].active).toBe(true));expect(onError).not.toHaveBeenCalled();
 await act(async()=>{const terminal:ChatAguiStreamEvent={type:"RUN_FINISHED",runId:"INITIAL",threadId:"SESSION",timestamp:Date.now()+2,outcome:{type:"success"},productCompletion:true};protocol.push(terminal);handlers?.onAguiEvent?.(terminal);finish({session,run:{runId:"INITIAL",status:"COMPLETED",finalOutput:"Done",stepCount:1},messages:[],userInputRequest:null});});
 await waitFor(()=>expect(onRunStateChange.mock.calls.at(-1)?.[0].active).toBe(false));expect(onError).not.toHaveBeenCalled();expect(protocol.filter((event)=>event.runId==="INITIAL"&&event.type==="RUN_ERROR")).toHaveLength(0);
});

it("retains a real native approval after a completed transport when protocol replay is unavailable",async()=> {
 const session:ChatSession={id:1,sessionId:"SESSION",title:"Native",status:"ACTIVE",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 const onError=vi.fn();
 const adapter:ChatAdapter={capabilities:{supportsAbort:true,supportsAgui:true,supportsProtocolReplay:false,supportsStreaming:true,supportsUserInputRequests:true},createSession:vi.fn(),deleteSession:vi.fn(),loadMessages:vi.fn().mockResolvedValue([]),loadAguiEvents:vi.fn().mockResolvedValue([]),loadUserInputRequests:vi.fn().mockResolvedValue([]),answerUserInputRequestStream:vi.fn(),streamMessage:vi.fn(async(_session,_input,observer)=>{
   observer?.onAguiEvent?.({type:"RUN_STARTED",runId:"RUN",threadId:"SESSION",timestamp:Date.now()});
   observer?.onAguiEvent?.({type:"RUN_FINISHED",runId:"RUN",threadId:"SESSION",timestamp:Date.now()+1,outcome:{type:"interrupt",interrupts:[{id:"NATIVE-APPROVAL",reason:"approval_required",message:"Allow the operation?",responseSchema:{type:"boolean"}}]}});
   return {session,run:{runId:"RUN",status:"AWAITING_USER_INPUT" as const,finalOutput:"",stepCount:1},messages:[],userInputRequest:null};
 })};
 render(<ChatRuntimeWindow adapter={adapter} config={{floating:false}} initialSession={session} onError={onError}/>);
 await waitFor(()=>expect(adapter.loadMessages).toHaveBeenCalled());fireEvent.change(screen.getByRole("textbox"),{target:{value:"Run"}});fireEvent.keyDown(screen.getByRole("textbox"),{key:"Enter"});
 expect(await screen.findByRole("button",{name:"Approve"})).toBeTruthy();expect(await screen.findByRole("button",{name:"Reject"})).toBeTruthy();
 await waitFor(()=>expect(adapter.loadMessages).toHaveBeenCalledTimes(2));
 expect(screen.getByRole("button",{name:"Approve"})).toBeTruthy();expect(onError).not.toHaveBeenCalled();
});
