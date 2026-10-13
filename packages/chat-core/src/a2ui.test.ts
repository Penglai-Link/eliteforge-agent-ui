import {describe,it,expect} from "vitest";
import {A2UIClient} from "@eliteforge/agent-ui-a2ui-core";
import {ChatA2uiSession,type ChatA2uiState,type ChatA2uiSurface} from "./a2ui";
const catalog="https://eliteforge.dev/a2ui/v0.9.1/agent";
function surface():ChatA2uiSurface {return {surfaceId:"search",surfaceInstanceId:"instance",revision:1,mode:"Reusable",ownerAgentId:"agent",runId:"run",messageId:"anchor",createdAtMs:1,snapshot:{surfaceId:"search",catalogId:catalog,sendDataModel:true,components:{root:{id:"root",component:"TextField",label:"Query",value:{path:"/query"}}},dataModel:{query:"first",report:"original"}}};}
function state(s=surface()):ChatA2uiState{return {sessionId:"session",revision:s.revision,surfaces:[s]};}
describe("session A2UI projection",()=>{
 it("preserves drafts across unrelated canonical updates and equal snapshots",()=>{
  const runtime=new ChatA2uiSession("session");runtime.hydrate(state());runtime.client.setValue("search","root","draft");runtime.hydrate(state());expect(runtime.client.exportSnapshot().surfaces.search.dataModel.query).toBe("draft");
  const next=surface();next.revision=2;next.snapshot.dataModel={query:"first",report:"new"};runtime.hydrate(state(next));expect(runtime.client.exportSnapshot().surfaces.search.dataModel).toEqual({query:"draft",report:"new"});
  next.revision=3;next.snapshot.dataModel={query:"server change",report:"new"};runtime.hydrate(state(next));expect(runtime.client.exportSnapshot().surfaces.search.dataModel.query).toBe("server change");
 });
 it("skips duplicate frames, rejects gaps, isolates sessions and removes deleted anchors",()=>{
  const runtime=new ChatA2uiSession("session");runtime.hydrate(state());
  const event:any={type:"CUSTOM",name:"agent.a2ui",threadId:"session",value:{revision:2,surface:{...surface(),revision:2},messages:[{version:"v0.9.1",updateDataModel:{surfaceId:"search",path:"/report",value:"new"}}]}};
  expect(runtime.applyEvent(event)).toBe(true);expect(runtime.applyEvent(event)).toBe(true);expect(runtime.messages()[0].a2ui?.surfaceIds).toEqual(["search"]);
  expect(runtime.applyEvent({...event,value:{...event.value,revision:4}})).toBe(false);
  expect(runtime.applyEvent({...event,threadId:"other",value:{...event.value,revision:99}})).toBe(true);
  expect(runtime.applyEvent({...event,value:{...event.value,revision:3,deleted:true,messages:[{version:"v0.9.1",deleteSurface:{surfaceId:"search"}}]}})).toBe(true);expect(runtime.messages()).toEqual([]);
 });
 it("retains original action identity and timestamp until a confirmed result",()=>{
  const runtime=new ChatA2uiSession("session"),s=surface();runtime.hydrate(state(s));const m:any={version:"v0.9.1",action:{surfaceId:"search",name:"search",sourceComponentId:"root",timestamp:"2026-10-09T00:00:00Z",context:{query:"q"}}};
  const first=runtime.prepareAction(m,{},s),retry=runtime.prepareAction({...m,action:{...m.action,timestamp:"2026-10-09T01:00:00Z"}},{},s);expect(retry).toBe(first);runtime.completeAction(first.actionId);expect(runtime.prepareAction(m,{},s).actionId).not.toBe(first.actionId);
 });
});

import {historyMessages} from "./history";
it("projects submitted interactions as folded summaries without original controls",()=>{
 const page:any={sessionId:"session",runs:[{id:"run",startedAtMs:1,finishedAtMs:2}],records:{steps:[],messages:[],toolInvocations:[],interactions:[{id:"question",runId:"run",invocationId:null,prompt:[{type:"Text",text:"Choose"}],responseSchema:{type:"object"},presentation:{questions:[{id:"q",question:"Language?",options:[{id:"zh",label:"Chinese"}]}]},response:{answers:{q:{option_id:"zh"}}},expiresAtMs:null},{id:"approval",runId:"run",invocationId:"tool",prompt:[{type:"Text",text:"Allow?"}],responseSchema:{type:"boolean"},presentation:null,response:false,expiresAtMs:null}]},pendingInteractions:[],activeRuns:[]};
 const messages=historyMessages(page);expect(messages).toHaveLength(2);expect(messages.every(m=>m.role === "USER")).toBe(true);
 expect(messages.every(m => !m.a2ui)).toBe(true);
 expect(messages.map(m => m.interactionResponse?.requestId)).toEqual(["question","approval"]);
});
