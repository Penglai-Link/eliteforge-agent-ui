import { readFileSync } from "node:fs";
import local from "./batch-recovery.json";
import progress from "./batch-progress.json";
import type { ChatMessage, ChatAguiStreamEvent } from "../packages/chat-core/src/types";
import type { HistoryToolInvocation, SessionHistory } from "../packages/chat-core/src/history";

type Recovery = {
  live: Record<string, any>; history: Record<string, any>;
  snapshot?: Record<string, any>; model?: Record<string, any>;
};
export const recoveryFixture: Record<string, Recovery> = {
  ...(process.env.FRAMEWORK_BATCH_RECOVERY_FIXTURE
    ? JSON.parse(readFileSync(process.env.FRAMEWORK_BATCH_RECOVERY_FIXTURE, "utf8")) : local),
  ...(process.env.FRAMEWORK_BATCH_PROGRESS_FIXTURE
    ? JSON.parse(readFileSync(process.env.FRAMEWORK_BATCH_PROGRESS_FIXTURE, "utf8")) : progress),
};
export const vendoredRecoveryFixture = {...local, ...progress};

// Payloads come from actual Rust execution; only transport IDs/timestamps vary
// here to exercise execution changes across approval resumes.
export function recoveryEvents(name: string, declare = true): any[] {
  const outcome = recoveryFixture[name];
  const envelope = {runId:name, threadId:"session", timestamp:1,
    metadata:{framework:{runId:"logical-batch-run", executionId:name}}};
  return [
    ...(declare ? [{...envelope, type:"TOOL_CALL_START", toolCallId:outcome.history.id, toolCallName:outcome.history.toolName}] : []),
    outcome.snapshot
      ? {...envelope, type:"ACTIVITY_SNAPSHOT", activityType:"framework.tool.batch", messageId:`${name}/snapshot`, content:outcome.snapshot}
      : {...envelope, type:"TOOL_CALL_RESULT", toolCallId:outcome.history.id, content:JSON.stringify(outcome.live)},
  ];
}

const user = (id: string, time: number, answer = false): ChatMessage => ({
  id, messageId:id, sessionId:"session", runId:"logical-batch-run", role:"USER", content:"yes",
  actor:"USER", channel:"conversation", createdAt:new Date(time).toISOString(),
  ...(answer ? {interactionResponse:{requestId:id, rows:[]}} : {}),
});

/** Include actual execution/answer boundaries, not just isolated tool frames. */
export function mixedApprovalTimeline() {
  const events = ["mixedWaiting", "mixedRejected", "mixedCompleted"].flatMap((name, index) => {
    const time = 1000 + index * 2000;
    const body = recoveryEvents(name, index === 0).map(event => ({...event, timestamp:time + 10}));
    return [{...body[0], type:"RUN_STARTED", timestamp:time}, ...body,
      {...body[0], type:"RUN_FINISHED", timestamp:time + 20,
        ...(index < 2 ? {outcome:{type:"interrupt", interrupts:[]}} : {})}];
  }) as ChatAguiStreamEvent[];
  const messages = [user("question",900), {...user("assistant",950),role:"ASSISTANT" as const,actor:"ASSISTANT",content:""},
    user("answer-1",2900,true), user("answer-2",4900,true)];
  return {events, messages};
}

export function recoveredBatchTimeline(finalName = "mixedCompleted") {
  const assistant:ChatMessage = {...user("assistant",1000),role:"ASSISTANT",actor:"ASSISTANT",content:"",history:{
    message:{id:"assistant",runId:"logical-batch-run",stepId:null,role:"Assistant",content:[],structured:null,status:"Completed",createdAtMs:1000},
    step:null,interactions:[],run:{id:"logical-batch-run",sessionId:"session",parentRunId:null,rootRunId:"logical-batch-run",status:"Completed",startedAtMs:1000,finishedAtMs:5000,error:null},
    tools:[{...recoveryFixture[finalName].history,runId:"logical-batch-run",stepId:null,messageId:"assistant",toolId:"batch.outcome",startedAtMs:1000,finishedAtMs:4900,resultReference:null} as HistoryToolInvocation],
  }};
  return {messages:[user("user",900),assistant],events:recoveryEvents("mixedWaiting").map(event=>({...event,timestamp:1100})) as ChatAguiStreamEvent[]};
}

export function pendingBatchApprovalHistory(): SessionHistory {
  const view = recoveredBatchTimeline("mixedWaiting").messages[1].history!;
  const pending = recoveryFixture.mixedWaiting.history.structured.results.filter((row:any)=>row.status === "Waiting")
    .map((row:any)=>({id:`approval-${row.index}`,runId:"logical-batch-run",invocationId:row.invocationId,
      prompt:[{type:"Text" as const,text:`Approve item ${row.index+1}`}],responseSchema:{type:"boolean"},presentation:null,response:null,expiresAtMs:null}));
  return {sessionId:"session",version:"1",nextCursor:null,activeRuns:[],
    runs:[{...view.run!,status:"Waiting",finishedAtMs:null}],pendingInteractions:pending,
    records:{messages:[view.message],steps:[],toolInvocations:view.tools,interactions:pending}};
}
