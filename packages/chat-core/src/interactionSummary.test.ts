import { it, expect } from "vitest";
import { historyMessages, type SessionHistory } from "./history";
import { interactionSummary, interactionToolSummary, submittedFormSummary } from "./interactionSummary";

const questionnaire = { id: "ask", runId: "run", invocationId: null, prompt: [{type:"Text",text:"Choose"}], responseSchema:{type:"object"}, presentation:{questions:[{id:"opaque-question",question:"您的需求？",options:[{id:"consult",label:"发起会诊"}]}]},response:{answers:{"opaque-question":{option_id:"consult"}}},expiresAtMs:null } as any;
const form = { id:"form",runId:"run",invocationId:null,prompt:[{type:"Text",text:"Complete the form"}],responseSchema:{type:"object"},presentation:{kind:"a2ui",messages:[{updateComponents:{surfaceId:"s",components:[{id:"sex",component:"ChoicePicker",label:"性别",value:{path:"/sex"},options:[{value:"male",label:"男"}]},{id:"age",component:"NumberField",label:"年龄（岁）",value:{path:"/age"}}]}}]},response:{sex:["male"],age:12},expiresAtMs:null } as any;
it("places answered interactions at their invoking tools before subsequent replies, even with unordered records", () => {
 const message = (id:string,time:number) => ({id,runId:"run",stepId:null,role:"Assistant",content:[{type:"Text",text:id}],status:"Completed",structured:null,createdAtMs:time});
 const tool = (id:string,messageId:string,time:number) => ({id,runId:"run",messageId,startedAtMs:time,structured:null,content:id === "ask-tool" ? [{type:"Text",text:JSON.stringify({...questionnaire.presentation,frameworkInteractionId:"ask"})}] : []});
 const page = {sessionId:"s",runs:[{id:"run",startedAtMs:1,finishedAtMs:1000}],records:{steps:[],messages:[message("final",900),message("ask-message",10),message("form-message",100)],toolInvocations:[tool("ask-tool","ask-message",20),tool("form","form-message",110)],interactions:[questionnaire,form]},pendingInteractions:[],activeRuns:[]} as unknown as SessionHistory;
 const messages = historyMessages(page);
 expect(messages.map(m=>m.id)).toEqual(["ask-message","interaction:ask","form-message","interaction:form","final"]);
 expect(messages.find(m=>m.id==="final")?.history?.interactions).toEqual([]);
 expect(messages[0].history?.interactions[0].id).toBe("ask");
 expect(messages.every(m => !m.a2ui)).toBe(true);
 expect(messages.filter(m => m.interactionResponse).every(m => m.role === "USER")).toBe(true);
});
it("shows question and option labels instead of answer envelopes and transport IDs", () => {
 expect(interactionSummary(questionnaire)).toEqual([{label:"您的需求？",value:"发起会诊"}]);
 expect(interactionSummary(form)).toEqual([{label:"性别",value:"男"},{label:"年龄（岁）",value:"12"}]);
 expect(interactionToolSummary("a2ui_request_input",{messages:form.presentation.messages})).toEqual(["性别","年龄（岁）"]);
 expect(interactionToolSummary("chat_ask_user",{questions:questionnaire.presentation.questions})).toEqual(["您的需求？"]);
 expect(interactionToolSummary("ordinary_tool",{})).toBeNull();
});

it("summarizes a just-submitted form using field and option labels", () => {
 expect(submittedFormSummary({requestId:"form",runId:"run",intro:"Complete the form",a2uiInteraction:{messages:form.presentation.messages},answers:[{questionId:"form",answerKind:"Other",otherText:JSON.stringify(form.response)}]} as any)).toEqual([{label:"性别",value:"男"},{label:"年龄（岁）",value:"12"}]);
});

it("keeps batch children in audit records without duplicating conversation tool cards", () => {
 const parent = {id:"batch",runId:"run",messageId:"m",stepId:"step",toolName:"fs_read_text",arguments:{items:[{path:"a"},{path:"b"}]},status:"Completed",structured:{results:[{index:0,isError:false,result:"a"},{index:1,isError:false,result:"b"}]},content:[],isError:false};
 const child = {...parent,id:"child",batch:{parentInvocationId:"batch",parentCallId:"call",invocationId:"child",callId:"child",index:0},arguments:{path:"a"}};
 const page = {sessionId:"s",runs:[{id:"run",startedAtMs:1,finishedAtMs:10}],activeRuns:[],pendingInteractions:[],records:{steps:[],messages:[{id:"m",runId:"run",stepId:"step",role:"Assistant",content:[],status:"Completed",createdAtMs:1}],toolInvocations:[parent,child],interactions:[]}} as unknown as SessionHistory;
 const messages = historyMessages(page);
 expect(messages[0].history?.tools.map(t=>t.id)).toEqual(["batch"]);
 expect(page.records.toolInvocations).toHaveLength(2);
});
