import type { ChatComposerLabels } from "./types";

/** Default composer labels for the host locale, with host overrides taking precedence. */
export function resolveComposerLabels(locale?: string, overrides?: ChatComposerLabels): ChatComposerLabels {
  const defaults: ChatComposerLabels = locale?.toLowerCase().startsWith("zh") ? {
    sendLabel: "发送", stopLabel: "停止", queuedLabel: "队列中",
    attachLabel: "添加附件", uploadingLabel: "正在上传附件",
    removeAttachmentLabel: (name) => `移除${name}`,
    reorderQueuedLabel: "拖动排序，也可使用上下方向键调整",
    editQueuedLabel: "编辑排队消息", removeQueuedLabel: "移除排队消息",
    steerQueuedLabel: "立即发送排队消息",
  } : {};
  return { ...defaults, ...overrides };
}

/** Shared by normal and floating chat panels in both renderers. */
export function waitingInputComposerLabel(locale?: string): string {
  return locale?.toLowerCase().startsWith("zh")
    ? "输入已暂停，请先完成上方填写或确认"
    : "Input paused. Complete the form or confirmation above to continue.";
}
