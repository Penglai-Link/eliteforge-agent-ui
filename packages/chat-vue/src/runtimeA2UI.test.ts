// @vitest-environment jsdom
import {createApp,h,nextTick} from "vue";
import {it,expect,vi} from "vitest";
import {A2UIClient} from "@eliteforge/agent-ui-a2ui-core";
import {profileMessages} from "@eliteforge/agent-ui-a2ui-core/demo";
import type {ChatAdapter,ChatSession} from "@eliteforge/agent-ui-chat-core";
import ChatRuntimeWindow from "./components/ChatRuntimeWindow.vue";
async function until(condition:()=>boolean) {for(let i=0;i<100;i++){await nextTick();if(condition()) return; await new Promise(resolve=>setTimeout(resolve,5));}throw Error("UI did not settle");}
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
