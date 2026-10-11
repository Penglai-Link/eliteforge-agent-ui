// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { historyMessages, type SessionHistory } from "@eliteforge/agent-ui-chat-core";
import { ChatPanel } from "./ChatPanel";
beforeEach(() => Object.defineProperty(HTMLElement.prototype, "scrollTo", {configurable:true,value:vi.fn()}));
afterEach(cleanup);
it.each(["HUMAN", "DUDE"])("shows the actual %s answer sender on the interaction summary", kind => {
  const page: SessionHistory = {sessionId:"thread",version:"1",nextCursor:null,runs:[],activeRuns:[],pendingInteractions:[],records:{messages:[{id:"user",runId:"run",stepId:null,role:"User",content:[{type:"Text",text:"Question"}],structured:null,status:"Completed",createdAtMs:0},{id:"message",runId:"run",stepId:null,role:"Assistant",content:[{type:"Text",text:"Stored question"}],structured:null,status:"Completed",createdAtMs:1}],steps:[],toolInvocations:[{id:"tool",runId:"run",stepId:"step",messageId:"message",callId:"call",toolId:"ask_user",toolName:"ask_user",arguments:{},status:"Completed",content:[],structured:{frameworkInteractionId:"answer"},isError:false,resultReference:null,startedAtMs:1,finishedAtMs:2}],interactions:[{id:"answer",runId:"run",invocationId:null,prompt:[{type:"Text",text:"Proceed?"}],responseSchema:{type:"boolean"},presentation:null,response:true,expiresAtMs:null,responseProvenance:{sender:{kind,id:"sender",displayName:"Actual responder"}}}]}};
  const {container} = render(<ChatPanel allowDraftSession messages={historyMessages(page)} draft="" onDraftChange={() => undefined} onSend={() => undefined} />);
  expect(container.querySelector(`[data-interaction-response-sender="${kind}"]`)?.textContent).toContain("Actual responder");
});
