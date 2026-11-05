/** Keep provider diagnostics available without using their JSON envelope as UI copy. */
export function chatErrorPresentation(raw: string, fallback = "Run failed", code = "") {
  const chinese = /[\u3400-\u9fff]/.test(fallback);
  const key = code.toUpperCase();
  const known = runtimeErrors[key] ?? runtimeErrors[legacyErrorCodes[raw.trim().toLowerCase()] ?? ""];
  if (known) return { summary: known[chinese ? 0 : 1], details: "" };
  if (!raw.includes("model stream failed before completion:")) {
    // Old persisted events and third-party errors may not carry a localized message.
    // Keep diagnostics available without exposing them as the primary UI copy.
    if (chinese && raw && !/[\u3400-\u9fff]/.test(raw)) return { summary: "本次操作未完成，请查看错误详情并确认会话状态后重试。", details: raw };
    return { summary: raw, details: "" };
  }
  try {
    const event = JSON.parse(raw.slice(raw.indexOf("{")));
    const error = event.response?.error ?? event.error;
    const tool = typeof error?.message === "string" ? error.message.match(/schema definition for tool:\s*([\w.-]+)/i)?.[1]?.replace(/\.$/, "") : undefined;
    if (tool) return {
      summary: chinese ? `模型服务拒绝了工具 ${tool} 的参数定义，请检查工具 Schema。` : `The model service rejected the parameter schema for tool ${tool}.`,
      details: raw,
    };
  } catch { /* Partial provider frames still retain their diagnostics. */ }
  return { summary: chinese ? "模型服务返回错误，本次回复未完成。" : "The model service failed before the reply completed.", details: raw };
}

const stepLimit = ["本次运行已达到执行步数上限。请发送新消息继续任务；审批和回答不会重置本次运行的额度。", "This run reached its step limit. Send a new message to continue; approvals and answers do not reset the current run budget."] as const;
const toolLimit = ["本次运行已达到工具调用次数上限。请发送新消息继续任务；审批和回答不会重置本次运行的额度。", "This run reached its tool-call limit. Send a new message to continue; approvals and answers do not reset the current run budget."] as const;
const completionUnknown = ["尚未确认运行结果，请刷新会话查看最新状态，避免重复提交。", "The run result could not be confirmed. Refresh the conversation before submitting again."] as const;
const runtimeErrors: Record<string, readonly [string, string]> = {
  STEP_LIMIT: stepLimit,
  AGENT_MAX_STEPS_EXCEEDED: stepLimit,
  TOOL_CALL_LIMIT: toolLimit,
  AGENT_MAX_TOOL_CALLS_EXCEEDED: toolLimit,
  AGENT_LIMIT_REACHED: ["本次运行已达到执行额度上限。请发送新消息继续任务；审批和回答不会重置本次运行的额度。", "This run reached its execution limit. Send a new message to continue; approvals and answers do not reset the current run budget."],
  AGENT_RUN_STOPPED: ["本次运行已停止。", "This run has stopped."],
  AGENT_CANCELLED: ["本次运行已停止。", "This run has stopped."],
  CANCELLED: ["本次运行已停止。", "This run has stopped."],
  RUN_TIMEOUT: ["本次运行超时，请发送新消息继续任务。", "This run timed out. Send a new message to continue."],
  AGENT_RUNTIME_FAILED: ["智能体执行失败，请检查运行详情后重试。", "The agent failed. Check the run details before retrying."],
  AGENT_MODEL_FAILED: ["模型服务调用失败，请检查模型配置和服务状态后重试。", "The model service failed. Check its configuration and availability before retrying."],
  AGENT_TOOL_FAILED: ["工具执行失败，请检查运行详情后重试。", "A tool failed. Check the run details before retrying."],
  CHAT_STREAM_COMPLETION_INVALID: completionUnknown,
  CHAT_STREAM_COMPLETION_UNAVAILABLE: completionUnknown,
  NETWORK_ERROR: ["与服务的连接中断，请在服务恢复后刷新会话查看最新状态。", "The connection to the service was interrupted. Refresh the conversation when the service is available."],
};
const legacyErrorCodes: Record<string, string> = {
  "agent execution reached its configured limit": "AGENT_LIMIT_REACHED",
  "agent execution limit reached": "AGENT_LIMIT_REACHED",
  "agent run exceeded max steps": "STEP_LIMIT",
  "agent run exceeded max tool calls": "TOOL_CALL_LIMIT",
  "agent run cancelled": "CANCELLED",
  "agent run was stopped": "AGENT_RUN_STOPPED",
  "failed to fetch": "NETWORK_ERROR",
  "fetch failed": "NETWORK_ERROR",
  "network request failed": "NETWORK_ERROR",
  "networkerror when attempting to fetch resource.": "NETWORK_ERROR",
  "load failed": "NETWORK_ERROR",
};
