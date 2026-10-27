import { CircleDot, Pause, Play, RotateCcw, Trash2 } from "lucide-react";

/** Display data and actions are supplied by the host; no goal backend is assumed. */
export interface ChatGoalIndicatorProps {
  objective: string;
  status: string;
  label: string;
  progress?: string;
  busy?: boolean;
  onPause?: () => void;
  resumeDisabled?: boolean;
  onResume?: () => void;
  onRestart?: () => void;
  onDelete?: () => void;
  labels: { pause: string; resume: string; restart: string; delete: string };
}

export function ChatGoalIndicator({ objective, status, label, progress, busy, resumeDisabled, onPause, onResume, onRestart, onDelete, labels }: ChatGoalIndicatorProps) {
  return <section className="ef-chat-goal" aria-label={label} aria-busy={busy || undefined}>
    <CircleDot className="ef-chat-goal__icon" size={16} aria-hidden="true" />
    <div className="ef-chat-goal__content">
      <div className="ef-chat-goal__heading"><span>{label}</span><span className="ef-chat-goal__status">{status}</span>{progress && <span className="ef-chat-goal__progress">{progress}</span>}</div>
      <div className="ef-chat-goal__objective" title={objective}>{objective}</div>
    </div>
    <div className="ef-chat-goal__actions">
      {onPause && <button type="button" disabled={busy} onClick={onPause} aria-label={labels.pause} title={labels.pause}><Pause size={15} aria-hidden="true" /></button>}
      {onResume && <button type="button" disabled={busy || resumeDisabled} onClick={onResume} aria-label={labels.resume} title={labels.resume}><Play size={15} aria-hidden="true" /></button>}
      {onRestart && <button type="button" disabled={busy} onClick={onRestart} aria-label={labels.restart} title={labels.restart}><RotateCcw size={15} aria-hidden="true" /></button>}
      {onDelete && <button type="button" disabled={busy} onClick={onDelete} aria-label={labels.delete} title={labels.delete}><Trash2 size={15} aria-hidden="true" /></button>}
    </div>
  </section>;
}
