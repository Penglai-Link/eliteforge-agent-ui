// @vitest-environment jsdom
import {it,expect,vi} from "vitest";
import {createApp,h,nextTick} from "vue";
import {A2UIClient,AGENT_CATALOG_ID} from "@eliteforge/agent-ui-a2ui-core";
import {A2UISurface} from "./index";
function client(component:any){const c=new A2UIClient();c.apply({version:"v0.9.1",createSurface:{surfaceId:"s",catalogId:AGENT_CATALOG_ID}});c.apply({version:"v0.9.1",updateComponents:{surfaceId:"s",components:[{id:"root",intro:"Choose",value:{path:"/answer"},status:{path:"/status"},labels:{},action:{event:{name:"submit",context:{answer:{path:"/answer"}}}},...component}]}});c.apply({version:"v0.9.1",updateDataModel:{surfaceId:"s",value:{status:"Pending",answer:{}}}});return c;}
it.each([true,false])("approval emits a boolean and disables after settlement (%s)",async decision=>{
 const c=client({component:"ApprovalCard"}),host=document.createElement("div"),action=vi.fn();document.body.append(host);const app=createApp({render:()=>h(A2UISurface,{client:c,surfaceId:"s",onAction:action})});app.mount(host);const buttons=host.querySelectorAll("button");buttons[decision?0:1].click();await nextTick();expect(action.mock.calls[0][0].action.context.answer).toBe(decision);c.apply({version:"v0.9.1",updateDataModel:{surfaceId:"s",path:"/status",value:"Answered"}});await nextTick();expect([...host.querySelectorAll("button")].every(b=>b.disabled)).toBe(true);app.unmount();host.remove();
});
it("skips an earlier question and confirms the last custom answer",async()=>{
 const c=client({component:"QuestionCard",questions:[{questionId:"first",question:"First?",options:[],allowCustomAnswer:true,allowSkip:true},{questionId:"q",question:"Which?",options:[],allowCustomAnswer:true,allowSkip:true}]}),host=document.createElement("div"),action=vi.fn();document.body.append(host);const app=createApp({render:()=>h(A2UISurface,{client:c,surfaceId:"s",onAction:action})});app.mount(host);
 host.querySelector<HTMLButtonElement>('button[aria-label="Skip"]')!.click();await nextTick();
 expect(action).not.toHaveBeenCalled();
 expect(host.querySelector('button[aria-label="Skip"]')).toBeNull();
 expect(host.querySelector<HTMLButtonElement>('button[aria-label="Confirm"]')!.disabled).toBe(true);
 const text=host.querySelector("textarea")!;text.value="custom";text.dispatchEvent(new Event("input",{bubbles:true}));await nextTick();
 host.querySelector<HTMLButtonElement>('button[aria-label="Confirm"]')!.click();
 expect(action).toHaveBeenCalledTimes(1);
 expect(action.mock.calls[0][0].action.context.answer).toEqual({first:{questionId:"first",answerKind:"Skipped",optionId:null,otherText:null},q:{questionId:"q",answerKind:"Other",optionId:null,otherText:"custom"}});
 app.unmount();host.remove();
});

it("advances on a selected option, preserves answers on back, and confirms the last question",async()=>{
 const c=client({component:"QuestionCard",questions:[{questionId:"first",question:"First?",options:[{optionId:"a",label:"A"},{optionId:"b",label:"B"}]},{questionId:"second",question:"Second?",options:[{optionId:"c",label:"C"}]}]}),host=document.createElement("div"),action=vi.fn();document.body.append(host);const app=createApp({render:()=>h(A2UISurface,{client:c,surfaceId:"s",onAction:action})});app.mount(host);
 host.querySelector<HTMLInputElement>('input[type="radio"]')!.click();await nextTick();
 expect(host.textContent).toContain("Second?");expect(action).not.toHaveBeenCalled();
 host.querySelector<HTMLButtonElement>('button[aria-label="Back"]')!.click();await nextTick();
 expect(host.querySelector<HTMLInputElement>('input[type="radio"]')!.checked).toBe(true);
 host.querySelector<HTMLButtonElement>('button[aria-label="Next"]')!.click();await nextTick();
 host.querySelector<HTMLInputElement>('input[type="radio"]')!.click();await nextTick();
 expect(host.textContent).toContain("Second?");expect(action).not.toHaveBeenCalled();
 host.querySelector<HTMLButtonElement>('button[aria-label="Confirm"]')!.click();
 expect(action.mock.calls[0][0].action.context.answer).toEqual({first:{questionId:"first",answerKind:"Option",optionId:"a",otherText:null},second:{questionId:"second",answerKind:"Option",optionId:"c",otherText:null}});
 app.unmount();host.remove();
});
