import { useEffect, useId, useRef, useState } from "react";
import { Check, CircleHelp, FileText, X } from "lucide-react";
import { formatTime, type ChatMessage } from "@personai/agent-ui-chat-core";

/** A display-only receipt. The original interaction and timeline stay unchanged. */
export function InteractionReceipt({ message, actorName, hideMessageIdentity = false }: { message: ChatMessage; actorName: string; hideMessageIdentity?: boolean }) {
  const response = message.interactionResponse!;
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pinned = useRef(false);
  const [open, setOpen] = useState(false);
  const label = response.summaryLabel ?? response.rows[0]?.value ?? "";
  const Icon = response.approval ? response.approval.approved ? Check : X : response.kind === "form" ? FileText : CircleHelp;

  function cancelClose() { clearTimeout(timer.current); }
  function close() { cancelClose(); panel.current?.hidePopover(); pinned.current = false; }
  function show() {
    cancelClose();
    if (!trigger.current || !panel.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const above = rect.top > window.innerHeight - rect.bottom;
    Object.assign(panel.current.style, {
      width: `${Math.min(420, window.innerWidth - 24)}px`,
      left: `${Math.max(12, Math.min(rect.left, window.innerWidth - Math.min(420, window.innerWidth - 24) - 12))}px`,
      top: above ? "auto" : `${rect.bottom + 8}px`,
      bottom: above ? `${window.innerHeight - rect.top + 8}px` : "auto",
      maxHeight: `${Math.max(80, (above ? rect.top : window.innerHeight - rect.bottom) - 24)}px`,
    });
    panel.current.showPopover();
  }
  function scheduleClose() {
    cancelClose();
    if (!pinned.current) timer.current = setTimeout(close, 180);
  }
  useEffect(() => {
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      panel.current?.hidePopover();
      pinned.current = false;
    };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => { clearTimeout(timer.current); window.removeEventListener("scroll", dismiss, true); window.removeEventListener("resize", dismiss); };
  }, []);

  return <div className="ef-chat__interaction-receipt" data-message-id={message.messageId} data-history-interaction-id={response.requestId}
    onMouseEnter={show} onMouseLeave={scheduleClose}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
    <button ref={trigger} type="button" className="ef-chat__interaction-chip" aria-expanded={open} aria-controls={id} aria-haspopup="dialog"
      onFocus={show} onClick={() => { if (pinned.current) close(); else { pinned.current = true; show(); } }}>
      <Icon size={14} aria-hidden="true" /><span>{label}</span>
    </button>
    <div ref={panel} id={id} popover="auto" role="dialog" aria-label={label} tabIndex={0}
      className="ef-chat__interaction-popover" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}
      onToggle={event => { const visible = event.newState === "open"; setOpen(visible); if (!visible) pinned.current = false; }}>
      <div className="ef-chat__interaction-meta">{!hideMessageIdentity && <span>{actorName}</span>}{response.answeredAt != null && <time>{formatTime(message.createdAt)}</time>}</div>
      <dl className="ef-chat__interaction-summary">{response.rows.map((row, index) => <div key={index}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
    </div>
  </div>;
}
