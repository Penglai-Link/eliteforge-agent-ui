/**
 * Platform-neutral annotation types and defaults.
 *
 * Kept apart from `annotations.ts` so the `./headless` entry can re-export
 * annotation data without pulling the DOM selection/editor helpers into
 * React Native builds. `annotations.ts` re-exports these symbols, so the root
 * entry keeps its existing public API.
 */
export interface ChatAnnotation {
  id: string;
  messageId: string;
  selectedText: string;
  comment: string;
}

export interface ChatAnnotationLabels {
  comment: string;
  addToMessage: string;
  cancel: string;
  commentPlaceholder: string;
  selectedText: string;
  userComment: string;
  pendingAnnotations: string;
  annotation: (index: number) => string;
  removeAnnotation: (index: number) => string;
  saveChanges?: string;
}

export const defaultChatAnnotationLabels: ChatAnnotationLabels = {
  saveChanges: "Save",
  comment: "Comment", addToMessage: "Add to message", cancel: "Cancel",
  commentPlaceholder: "Add a comment", selectedText: "Selected text", userComment: "User comment",
  pendingAnnotations: "Pending annotations", annotation: index => `Annotation ${index}`,
  removeAnnotation: index => `Remove Annotation ${index}`,
};
export const zhChatAnnotationLabels: ChatAnnotationLabels = {
  saveChanges: "保存",
  comment: "评论", addToMessage: "添加到消息", cancel: "取消", commentPlaceholder: "添加评论",
  selectedText: "选中文字", userComment: "用户评论", pendingAnnotations: "待发送评论",
  annotation: index => `评论 ${index}`, removeAnnotation: index => `移除评论 ${index}`,
};