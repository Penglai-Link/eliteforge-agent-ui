// @vitest-environment jsdom
import { createApp, h } from "vue";
import { expect, it } from "vitest";
import { historyMessages, type SessionHistory } from "@eliteforge/agent-ui-chat-core";
import ChatBubble from "./components/ChatBubble.vue";
it.each(["HUMAN", "DUDE"])("shows the actual %s answer sender on the interaction summary", kind => {
  const page: SessionHistory = {sessionId:"thread",version:"1",nextCursor:null,runs:[],activeRuns:[],pendingInteractions:[],records:{messages:[{id:"message",runId:"run",stepId:null,role:"Assistant",content:[{type:"Text",text:"Stored question"}],structured:null,status:"Completed",createdAtMs:1}],steps:[],toolInvocations:[{id:"tool",runId:"run",stepId:"step",messageId:"message",callId:"call",toolId:"ask_user",toolName:"ask_user",arguments:{},status:"Completed",content:[],structured:{frameworkInteractionId:"answer"},isError:false,resultReference:null,startedAtMs:1,finishedAtMs:2}],interactions:[{id:"answer",runId:"run",invocationId:null,prompt:[{type:"Text",text:"Proceed?"}],responseSchema:{type:"boolean"},presentation:null,response:true,expiresAtMs:null,responseProvenance:{sender:{kind,id:"sender",displayName:"Actual responder"}}}]}};
  const container=document.createElement("div");document.body.append(container);
  const app=createApp({render:()=>h(ChatBubble,{message:historyMessages(page).find(message => message.interactionResponse)!})});
  try {app.mount(container);expect(container.querySelector(`[data-interaction-response-sender="${kind}"]`)?.textContent).toContain("Actual responder");}
  finally {app.unmount();container.remove();}
});
