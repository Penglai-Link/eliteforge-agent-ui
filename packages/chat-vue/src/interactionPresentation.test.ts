// @vitest-environment jsdom
import {createApp,h,nextTick,shallowRef} from "vue";
import {expect,it,vi} from "vitest";
import {profileMessages} from "@eliteforge/agent-ui-a2ui-core/demo";
import type {ChatUserInputRequest} from "@eliteforge/agent-ui-chat-core";
import ChatUserInputCard from "./components/ChatUserInputCard.vue";
it("updates a live interaction presentation while preserving unchanged form drafts",async()=>{
 const request=shallowRef<ChatUserInputRequest>({requestId:"interaction",sessionId:"s",runId:"run",status:"Pending",requestedAt:0,intro:"Input",questions:[{questionId:"interaction",question:"Input",options:[],allowCustomAnswer:true,allowSkip:false}]});
 const element=document.createElement("div");document.body.append(element);const app=createApp({render:()=>h(ChatUserInputCard,{request:request.value,onSubmit:vi.fn()})});app.mount(element);
 try {
  request.value={...request.value,a2uiInteraction:{surfaceId:"profile",messages:profileMessages}};await nextTick();await nextTick();
  const nameInput=()=>[...element.querySelectorAll("label")].find(label=>label.textContent?.trim()==="姓名")?.querySelector("input") as HTMLInputElement;
  const input=nameInput();expect(input).toBeTruthy();
  input.value="Draft";input.dispatchEvent(new Event("input",{bubbles:true}));await nextTick();
  request.value=structuredClone(request.value);await nextTick();await nextTick();
  expect(nameInput().value).toBe("Draft");
 } finally {app.unmount();element.remove();}
});
