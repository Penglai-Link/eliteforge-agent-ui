// @vitest-environment jsdom
import { createApp, h, nextTick, type App } from "vue";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { ChatAdapter, SessionHistory } from "@eliteforge/agent-ui-chat-core";
import ChatRuntimeWindow from "./components/ChatRuntimeWindow.vue";
import { ensureTestLocalStorage } from "../../chat-react/src/testLocalStorage";
let app: App | undefined; let container: HTMLDivElement;
beforeEach(()=>{ensureTestLocalStorage();Object.defineProperty(HTMLElement.prototype,"scrollTo",{configurable:true,value:vi.fn()});container=document.createElement("div");document.body.append(container);});
afterEach(()=>{app?.unmount();container.remove();window.localStorage.clear();});
it("loads a coherent structured page without replay and shows loading while pending",async()=>{
 let resolve!: (value:SessionHistory)=>void;
 const host:ChatAdapter={capabilities:{supportsAbort:true,supportsStreaming:true,supportsAgui:true,supportsProtocolReplay:true},createSession:vi.fn(),streamMessage:vi.fn(),loadMessages:vi.fn().mockRejectedValue(new Error("forbidden")),loadAguiEvents:vi.fn().mockRejectedValue(new Error("forbidden")),loadProtocolEvents:vi.fn().mockRejectedValue(new Error("forbidden")),loadHistory:vi.fn().mockReturnValue(new Promise((accept)=>{resolve=accept;}))};
 app=createApp({render:()=>h(ChatRuntimeWindow,{adapter:host,config:{floating:false},initialSession:{id:1,sessionId:"S",title:"History",status:"ACTIVE",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},onError:vi.fn()})});app.mount(container);await nextTick();
 expect(container.textContent).toContain("Loading history");
 resolve({sessionId:"S",version:"v1",nextCursor:null,runs:[],activeRuns:[],pendingInteractions:[],records:{steps:[],toolInvocations:[],interactions:[],messages:[{id:"A",runId:"R",stepId:null,role:"Assistant",status:"Interrupted",createdAtMs:1,structured:null,content:[{type:"Text",text:"Vue history answer"},{type:"Reasoning",text:"Actual thought"},{type:"Json",value:{public:true}}]}]}});
 await vi.waitFor(()=>expect(container.textContent).toContain("Vue history answer"));
 expect(container.textContent).toContain('"public": true');
 expect(host.loadMessages).not.toHaveBeenCalled();expect(host.loadAguiEvents).not.toHaveBeenCalled();expect(host.loadProtocolEvents).not.toHaveBeenCalled();
});
