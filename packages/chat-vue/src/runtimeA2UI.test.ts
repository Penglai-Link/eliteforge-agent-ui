// @vitest-environment jsdom
import {createApp,h,nextTick} from "vue";
import {it,expect,vi} from "vitest";
import {A2UIClient} from "@eliteforge/agent-ui-a2ui-core";
import {profileMessages} from "@eliteforge/agent-ui-a2ui-core/demo";
import type {ChatAdapter,ChatSession} from "@eliteforge/agent-ui-chat-core";
import ChatRuntimeWindow from "./components/ChatRuntimeWindow.vue";
async function until(condition:()=>boolean) {for(let i=0;i<100;i++){await nextTick();if(condition()) return; await new Promise(resolve=>setTimeout(resolve,5));}throw Error("UI did not settle");}
it("Vue renders a surface emitted immediately in the first run of a new session", async () => {
 Object.defineProperty(HTMLElement.prototype,"scrollTo",{configurable:true,value:vi.fn()});
 const session:ChatSession={id:1,sessionId:"new-session",title:"New",status:"ACTIVE",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 const messages=[{version:"v0.9.1",createSurface:{surfaceId:"report",catalogId:"https://eliteforge.dev/a2ui/v0.9.1/agent"}},{version:"v0.9.1",updateComponents:{surfaceId:"report",components:[{id:"root",component:"Text",text:"First run report"}]}}];
 const client=new A2UIClient();messages.forEach(message=>client.apply(message as any));
 const surface={surfaceId:"report",surfaceInstanceId:"instance",revision:1,mode:"Display" as const,ownerAgentId:"agent",runId:"run",messageId:"card",createdAtMs:Date.now(),snapshot:client.exportSnapshot().surfaces.report};
 const adapter:ChatAdapter={capabilities:{supportsStreaming:true,supportsAgui:true},createSession:vi.fn().mockResolvedValue(session),deleteSession:vi.fn(),loadMessages:vi.fn().mockResolvedValue([]),loadA2uiState:vi.fn().mockResolvedValue({sessionId:session.sessionId,revision:0,surfaces:[]}),streamMessage:vi.fn((_session,_input,handlers)=>{handlers?.onAguiEvent?.({type:"CUSTOM",name:"agent.a2ui",threadId:session.sessionId,runId:"run",value:{revision:1,surface,messages}});return new Promise(()=>{});})};
 const element=document.createElement("div");document.body.append(element);const app=createApp({render:()=>h(ChatRuntimeWindow,{adapter,config:{floating:false}})});app.mount(element);
 try {await until(()=>!!element.querySelector("button"));const create=[...element.querySelectorAll("button")].find(button=>button.textContent?.includes("Start chat"));if(!create) throw Error(`Create button missing: ${element.textContent}`);create.click();await until(()=>!!element.querySelector("textarea"));const input=element.querySelector("textarea")!; input.value="Show report";input.dispatchEvent(new Event("input",{bubbles:true}));await nextTick();input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));await until(()=>element.textContent?.includes("First run report") === true);} finally {app.unmount();element.remove();}
});
it.each([false,true])("Vue reusable cards submit once per click and recover revisions (floating=%s)",async floating=>{
 Object.defineProperty(HTMLElement.prototype,"scrollTo",{configurable:true,value:vi.fn()});
 const session:ChatSession={id:1,sessionId:"s",title:"Search",status:"ACTIVE",createdAt:"2026-10-09",updatedAt:"2026-10-09"};
 const client=new A2UIClient();profileMessages.forEach(m=>client.apply(m));let revision=1;
 const snapshot=()=>({sessionId:"s",revision,surfaces:[{surfaceId:"profile",surfaceInstanceId:"instance",revision,mode:"Reusable" as const,ownerAgentId:"agent",runId:"run",messageId:"card",createdAtMs:1,snapshot:client.exportSnapshot().surfaces.profile}]});
 const submit=vi.fn(async()=>{revision++;return {session,run:{runId:"next",status:"COMPLETED" as const,finalOutput:"",stepCount:1},messages:[]};});
 const notify=vi.fn();const adapter:ChatAdapter={capabilities:{supportsStreaming:true},createSession:vi.fn(),deleteSession:vi.fn(),loadMessages:vi.fn().mockResolvedValue([]),loadA2uiState:vi.fn(async()=>snapshot()),sendA2uiActionStream:submit};
 const element=document.createElement("div");document.body.append(element);const app=createApp({render:()=>h(ChatRuntimeWindow,{adapter,initialSession:session,config:{floating},onA2UIAction:notify,windowState:{x:0,y:0,width:700,height:700,collapsed:false,minimized:false,open:true}})});app.mount(element);
 const button=()=>[...document.querySelectorAll("button")].find(b=>b.textContent?.trim()==="保存资料")!;
 try {
  await until(()=>!!button());button().click();await until(()=>notify.mock.calls.length===1);await until(()=>!button().closest("fieldset")?.disabled);button().click();await until(()=>notify.mock.calls.length===2);
  expect(submit).toHaveBeenCalledTimes(2);expect((submit.mock.calls as any)[0][1].expectedRevision).toBe(1);expect((submit.mock.calls as any)[1][1].expectedRevision).toBe(2);
 } finally {app.unmount();element.remove();}
});
