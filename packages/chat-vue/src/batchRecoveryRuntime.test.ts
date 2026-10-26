// @vitest-environment jsdom
import {createApp,h,nextTick} from "vue";
import {expect,it,vi} from "vitest";
import type {ChatAdapter,ChatSession} from "@eliteforge/agent-ui-chat-core";
import {pendingBatchApprovalHistory} from "../../../contracts/batch-recovery";
import ChatRuntimeWindow from "./components/ChatRuntimeWindow.vue";
import {ensureTestLocalStorage} from "../../chat-react/src/testLocalStorage";
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

  const container=document.createElement("div");document.body.append(container);
  const app=createApp({render:()=>h(ChatRuntimeWindow,{adapter:host,initialSession:session,draft:"continue",config:{floating:false},onError:vi.fn()})});
  const button=(label:string)=>Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.textContent?.trim()===label || b.getAttribute("aria-label")===label);
  try {
    app.mount(container);
    await vi.waitFor(()=>expect(button("Reject")).toBeTruthy());button("Reject")!.click();
    await vi.waitFor(()=>expect(host.answerUserInputRequestStream).toHaveBeenCalledOnce());
    observer.onAguiEvent?.(frame("RUN_STARTED"));observer.onAguiEvent?.({...frame("RUN_ERROR"),code:"AGENT_RUN_FAILED",message:"host audit unavailable"});reject(new Error("host audit unavailable"));
    await nextTick();
    await vi.waitFor(()=>expect(button("Approve")).toBeUndefined());
    button("Send")!.click();
    await vi.waitFor(()=>expect(host.streamMessage).toHaveBeenCalledOnce());
  } finally {app.unmount();container.remove();window.localStorage.clear();}
});
