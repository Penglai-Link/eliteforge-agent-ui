import type { ChatApprovalResponse, ChatUserInputLabels, ChatToolWorkLabels } from "./types";

export interface ApprovalRisk {
  level: "safe" | "low" | "medium" | "high" | "critical";
  label: string;
}

const levels = ["safe", "low", "medium", "high", "critical"] as const;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function approvalResponseSummary(
  approval: ChatApprovalResponse,
  labels?: Partial<ChatUserInputLabels>,
  resolveToolName?: ChatToolWorkLabels["resolveName"],
): { label: string; value: string }[] {
  const action = approval.tool
    ? resolveToolName?.(approval.tool, approval.parameters) || approval.tool
    : "";
  return [{
    label: action
      ? labels?.approvalQuestion?.(action) ?? `Allow ${action}?`
      : labels?.approvalFallbackQuestion ?? "Allow this operation?",
    value: approval.approved ? labels?.approved ?? "Approved" : labels?.rejected ?? "Rejected",
  }];
}

/** The host supplies risk separately from the human-readable approval reason. */
export function approvalPresentation(prompt: unknown, intro: string): { reason: string; risk?: ApprovalRisk } {
  if (Array.isArray(prompt)) {
    for (const block of prompt) {
      if (!object(block) || !["json", "Json"].includes(String(block.type)) || !object(block.value)) continue;
      const value = block.value;
      const level = typeof value.risk === "string" ? value.risk.toLowerCase() : "";
      if (value.kind === "toolApproval" && levels.includes(level as ApprovalRisk["level"]) && typeof value.riskLabel === "string") {
        return { reason: intro, risk: { level: level as ApprovalRisk["level"], label: value.riskLabel } };
      }
    }
  }
  // Already-pending approvals contain the previous localized policy sentence.
  const zh = /^工具 .+ 的风险为(无风险|低|中|高|非常危险)，达到确认阈值(?:无风险|低|中|高|非常危险)。([\s\S]+)。是否执行本次调用？$/.exec(intro);
  const en = /^Tool .+ has (Safe|Low|Medium|High|Critical) risk, meeting the (?:Safe|Low|Medium|High|Critical) approval threshold\. ([\s\S]+)\. Execute this call\?$/.exec(intro);
  const match = zh ?? en;
  if (!match) return { reason: intro };
  const label = match[1];
  const index = (zh ? ["无风险", "低", "中", "高", "非常危险"] : ["Safe", "Low", "Medium", "High", "Critical"]).indexOf(label);
  return {
    reason: match[2].replace(/，按非常危险处理$|; it is classified as critical$/, ""),
    risk: { level: levels[index], label },
  };
}
