import { expect, it } from "vitest";
import { buildAguiUserWorkCards, buildTranscriptPresentation } from "./transcript";
import type { ChatAguiStreamEvent } from "./types";
it("renders distinct native child identities in existing delegated-work cards and retains paused child protocol", () => {
  const events:ChatAguiStreamEvent[]=[{type:"RUN_STARTED",runId:"goal:PARENT",threadId:"SESSION",timestamp:100},{type:"SUBAGENT_STARTED",runId:"goal:PARENT",threadId:"SESSION",timestamp:101,subagentRunId:"SDK-CHILD-1",toolName:"agent_spawn",description:"Delegated child agent"},{type:"SUBAGENT_FINISHED",runId:"goal:PARENT",threadId:"SESSION",timestamp:102,subagentRunId:"SDK-CHILD-1",outcome:{type:"success"}},{type:"SUBAGENT_STARTED",runId:"goal:PARENT",threadId:"SESSION",timestamp:103,subagentRunId:"SDK-CHILD-2",toolName:"agent_spawn"},{type:"SUBAGENT_FINISHED",runId:"goal:PARENT",threadId:"SESSION",timestamp:104,subagentRunId:"SDK-CHILD-2"},{type:"RUN_FINISHED",runId:"CHILD-PRODUCT",threadId:"SESSION",timestamp:105,outcome:{type:"interrupt",interrupts:[{id:"APPROVAL",reason:"approval_required",responseSchema:{type:"boolean"}}]}}];
  const cards=buildAguiUserWorkCards(events);
  const children=cards.flatMap((card)=>card.kind==="tool" ? [card.value] : card.value.toolCards);
  expect(children).toHaveLength(2);
  expect(children.every((card)=>card.ended)).toBe(true);
  expect(children.map((card)=>card.id)).toEqual(["goal:PARENT:subagent:SDK-CHILD-1","goal:PARENT:subagent:SDK-CHILD-2"]);
  const view=buildTranscriptPresentation({messages:[{id:1,messageId:"USER",role:"USER",sessionId:"SESSION",actor:"User",channel:"MAIN_AGENT",content:"Goal",createdAt:new Date(99).toISOString(),runId:"goal:PARENT"}],protocolEvents:events,sessionId:"SESSION"});
  expect(view.workRailsByMessageCode.get("USER")?.some((rail)=>rail.runId==="goal:PARENT")).toBe(true);
  expect(events[1].type).toBe("SUBAGENT_STARTED");expect(events[1].toolCallId).toBeUndefined();
});
