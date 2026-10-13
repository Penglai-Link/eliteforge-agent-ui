import type { ChatAguiStreamEvent, ChatMessage, ChatUserInputRequest, ChatWorkRailLabels } from "./types";

const start = Date.now() - 8_000;
export const interactionTimelineDemoLabels: ChatWorkRailLabels = {
  ariaLabel: "智能体工作过程", preparing: "正在准备请求…", responding: "正在生成回复…", thinking: "正在思考…",
  workedFor: (duration) => `已工作 ${duration}`, workingFor: (duration) => `工作中 ${duration}`,
  askingQuestions: (count) => `正在询问 ${count} 个问题`, askedQuestions: (count) => `已询问 ${count} 个问题`,
  waitingForAnswer: "等待你的回答", skipped: "已跳过", failed: "运行失败",
  tool: { ariaLabel: "工具执行步骤", completed: (name) => `已执行：${name}`, running: (name) => `正在执行：${name}`,
    domainExpanded: (name) => `已展开：${name}`, domainExpanding: (name) => `正在展开：${name}`,
    group: (count) => `${count} 个工具调用`, statusDone: "完成", statusRunning: "运行中", parameters: "参数", result: "结果", log: "日志",
    noResult: "暂无结果。", waitingActivity: "等待工具活动…", copyParameters: "复制参数", copyResult: "复制结果",
    reasoningCaptured: "推理完成。", reasoningThinking: "思考中…", reasoningAria: "思考过程", emptyReasoning: "未生成推理内容。",
    resolveName: (name) => name === "search_release_docs" ? "搜索发布文档" : name === "chat_ask_user" ? "询问用户" : "工具调用" },
};
export const interactionTimelineDemoMessages: ChatMessage[] = [
  { id: "u1", messageId: "u1", sessionId: "DEMO", runId: null, role: "USER", channel: "chat", actor: "You", content: "帮我整理一份发布计划。", createdAt: new Date(start).toISOString() },
  { id: "a1", messageId: "a1", sessionId: "DEMO", runId: "ask", role: "ASSISTANT", channel: "chat", actor: "Assistant", content: "我可以按不同受众组织计划。你更想采用哪种方式？", createdAt: new Date(start + 1_500).toISOString() },
  { id: "a2", messageId: "a2", sessionId: "DEMO", runId: "answer", role: "ASSISTANT", channel: "chat", actor: "Assistant", content: "# 发布计划\n\n先向内部团队介绍变更和回滚方案，再向用户说明新功能、可用时间与反馈渠道。", createdAt: new Date(start + 7_500).toISOString() },
];

export const interactionTimelineDemoRequest: ChatUserInputRequest = {
  requestId: "audience", sessionId: "DEMO", runId: "ask", assistantMessageId: "a1",
  intro: "受众", requestedAt: start + 2_000, answeredAt: start + 3_000, status: "Answered",
  questions: [{ questionId: "audience", question: "发布计划的首要受众是谁？", options: [
    { optionId: "internal", label: "内部团队" }, { optionId: "users", label: "现有用户" },
  ] }], answers: [{ questionId: "audience", answerKind: "Option", optionId: "internal" }],
};

export const interactionTimelineDemoEvents: ChatAguiStreamEvent[] = [
  { type: "RUN_STARTED", runId: "ask", threadId: "DEMO", timestamp: start },
  { type: "ACTIVITY_SNAPSHOT", runId: "ask", threadId: "DEMO", timestamp: start + 200, activity: "THINKING" },
  { type: "REASONING_START", runId: "ask", threadId: "DEMO", timestamp: start + 300 },
  { type: "REASONING_MESSAGE_CONTENT", runId: "ask", threadId: "DEMO", timestamp: start + 500, delta: "先确认发布计划给谁看。" },
  { type: "REASONING_END", runId: "ask", threadId: "DEMO", timestamp: start + 900 },
  { type: "TOOL_CALL_START", runId: "ask", threadId: "DEMO", timestamp: start + 1_000, toolCallId: "ask-call", toolCallName: "chat_ask_user", toolCallArgs: { questions: [{ question: "发布计划的首要受众是谁？" }] } },
  { type: "TOOL_CALL_END", runId: "ask", threadId: "DEMO", timestamp: start + 1_200, toolCallId: "ask-call" },
  { type: "RUN_FINISHED", runId: "ask", threadId: "DEMO", timestamp: start + 2_000, outcome: { type: "interrupt", interrupts: [{ id: "audience", reason: "input_required", message: "请选择发布计划的首要受众。" }] } },
  { type: "RUN_STARTED", runId: "answer", threadId: "DEMO", timestamp: start + 3_100 },
  { type: "ACTIVITY_SNAPSHOT", runId: "answer", threadId: "DEMO", timestamp: start + 3_300, activity: "THINKING" },
  { type: "REASONING_START", runId: "answer", threadId: "DEMO", timestamp: start + 3_400 },
  { type: "REASONING_MESSAGE_CONTENT", runId: "answer", threadId: "DEMO", timestamp: start + 3_700, delta: "采用内部团队作为首要受众。" },
  { type: "REASONING_END", runId: "answer", threadId: "DEMO", timestamp: start + 4_100 },
  { type: "TOOL_CALL_START", runId: "answer", threadId: "DEMO", timestamp: start + 4_200, toolCallId: "search-call", toolCallName: "search_release_docs", toolCallArgs: { topic: "发布准备清单" } },
  { type: "TOOL_CALL_END", runId: "answer", threadId: "DEMO", timestamp: start + 5_200, toolCallId: "search-call" },
  { type: "TOOL_CALL_RESULT", runId: "answer", threadId: "DEMO", timestamp: start + 5_500, toolCallId: "search-call", toolCallName: "search_release_docs", content: "回滚方案、发布时间、用户通知" },
  { type: "RUN_FINISHED", runId: "answer", threadId: "DEMO", timestamp: start + 7_300, outcome: { type: "success" } },
];

export const interactionTimelineDemoAnchors = { ask: "u1", answer: "interaction:audience" };
