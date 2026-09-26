export type ExplainDialogStatus =
  | "loading"
  | "streaming"
  | "success"
  | "error";

export interface ExplainButtonOptions {
  left: number;
  top: number;
  size: number;
  onClick: () => void;
}

export interface ExplainDialogState {
  status: ExplainDialogStatus;
  title: string;
  content: string;
  markdown?: boolean;
}

export interface ExplainDialogPosition {
  left: number;
  top: number;
  /** Set when the dialog must occupy its maximum height above the icon. */
  height?: number;
}

export interface ExplainDialogOptions {
  onClose: () => void;
  onRefresh: () => void;
  position: ExplainDialogPosition;
}
