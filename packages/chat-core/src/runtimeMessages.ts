/** Translate runtime-owned default messages; host overrides take precedence. */
const zhRuntimeMessages: Record<string, string> = {
  "A2UI state failed": "A2UI 状态加载失败",
  "A2UI recovery failed": "A2UI 恢复失败",
  "A2UI presentation failed": "A2UI 展示失败",
  "A2UI action failed": "A2UI 操作失败",
  "Chat data could not be loaded": "无法加载对话数据",
  "Chat load failed": "加载对话失败",
  "Chat attachment upload failed": "对话附件上传失败",
  "Attachment upload failed": "附件上传失败",
  "The active run changed before send; the message was kept in the queue": "发送前运行状态发生变化，消息已保留在队列中",
  "Message queued": "消息已加入队列",
  "Chat send failed": "发送消息失败",
  "The active run rejected steer; the message was queued": "当前运行未接受调整，消息已加入队列",
  "Steer delivery was not confirmed and was not retried": "无法确认调整是否送达，未自动重试",
  "Steer not retried": "未重试调整",
  "Chat steer failed": "调整当前回复失败",
  "Chat answer failed": "提交回答失败",
  "Chat continuation failed": "继续对话失败",
  "Current response has been stopped": "当前回复已停止",
  "Chat stopped": "对话已停止",
  "Chat stop failed": "停止对话失败",
  "Chat delete failed": "删除对话失败",
  "Create a session to start chatting.": "创建会话以开始对话。",
  "Delete this user message and its agent replies? They will no longer appear in the conversation or be sent to the model. Rebuilding context may reduce cache hits and increase latency and cost.": "删除这条用户消息及其 Agent 回复？它们将不再显示在对话中，也不会发送给模型。重建上下文可能降低缓存命中率并增加延迟和成本。"
};

export function resolveRuntimeMessage(message: string, locale?: string, overrides?: Record<string, string>): string {
  return overrides?.[message] ?? (locale?.toLowerCase().startsWith("zh") ? zhRuntimeMessages[message] : undefined) ?? message;
}
