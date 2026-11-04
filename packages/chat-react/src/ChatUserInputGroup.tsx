import { useState } from "react";
import { pendingApprovalRequests, type ChatUserInputAnswer, type ChatUserInputLabels, type ChatUserInputRequest } from "@eliteforge/agent-ui-chat-core";
import { ChatUserInputCard } from "./ChatUserInputCard";

type Props = { request: ChatUserInputRequest; requests: ChatUserInputRequest[]; labels?: ChatUserInputLabels; disabled?: boolean; onSubmit: (answers: ChatUserInputAnswer[]) => void };
export function ChatUserInputGroup(props: Props) {
  const requests = pendingApprovalRequests(props.request, props.requests);
  if (requests.length === 1) return <ChatUserInputCard {...props} />;
  // A changed set of server requests starts a fresh approval barrier.
  return <ApprovalBatch key={JSON.stringify(requests.map(r => [r.sessionId, r.runId, r.requestId]))} {...props} requests={requests} />;
}
function ApprovalBatch({ requests, labels, disabled, onSubmit }: Props) {
  const [decisions, setDecisions] = useState<Record<string, ChatUserInputAnswer[]>>({});
  const count = requests.filter(r => decisions[r.requestId]).length;
  const decide = (request: ChatUserInputRequest, answers: ChatUserInputAnswer[]) => {
    if (disabled) return;
    const next = { ...decisions, [request.requestId]: answers };
    setDecisions(next);
    if (requests.every(r => next[r.requestId])) onSubmit(requests.flatMap(r => next[r.requestId]));
  };
  return <section className="ef-chat__approval-batch" aria-label={labels?.approvalBatch ?? "Tool approvals"}>
    <header className="ef-chat__approval-batch-header"><strong>{labels?.approvalBatch ?? "Tool approvals"}</strong><span aria-live="polite">{count} / {requests.length}</span><p>{labels?.approvalBatchHint ?? "Decide on every call. Execution resumes only after all decisions are submitted."}</p></header>
    {requests.map(request => <div className="ef-chat__approval-batch-item" key={request.requestId}>
      <ChatUserInputCard disabled={disabled} labels={labels} request={decisions[request.requestId] ? {...request, answers:decisions[request.requestId], status:"Answered"} : request} onSubmit={answers => decide(request, answers)} />
      {decisions[request.requestId] && !disabled ? <button type="button" className="ef-chat__approval-batch-change" onClick={() => setDecisions(current => { const next = {...current}; delete next[request.requestId]; return next; })}>{labels?.approvalWaiting ?? "Waiting for batch"} · {labels?.approvalChange ?? "Change"}</button> : null}
    </div>)}
    {count === requests.length && !disabled ? <button type="button" className="ef-chat__approval-batch-retry" onClick={() => onSubmit(requests.flatMap(r => decisions[r.requestId]))}>{labels?.approvalRetry ?? "Submit decisions"}</button> : null}
  </section>;
}
