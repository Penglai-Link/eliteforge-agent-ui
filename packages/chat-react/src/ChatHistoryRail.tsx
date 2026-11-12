import type { TranscriptPresentation, ChatMessage } from "@personai/agent-ui-chat-core";
import { useMotion } from "@personai/agent-ui-motion-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { buildChatHistoryTurns } from "./chatHistory";

interface ChatHistoryRailProps {
  messages: ChatMessage[];
  transcriptRef: RefObject<HTMLElement | null>;
  presentation: TranscriptPresentation;
}

export function ChatHistoryRail({ messages, transcriptRef, presentation }: ChatHistoryRailProps) {
  const turns = useMemo(() => buildChatHistoryTurns(messages, presentation), [messages, presentation]);
  const { policy } = useMotion();
  const previewId = useId();
  const [activeId, setActiveId] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewTop, setPreviewTop] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const previewTurn = previewIndex === null ? null : turns[previewIndex];
  const activeIndex = Math.max(0, turns.findIndex(turn => turn.id === activeId));

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript || !turns.length) return;
    const nodes = new Map(Array.from(transcript.querySelectorAll<HTMLElement>("[data-chat-turn-id]"))
      .map(node => [node.dataset.chatTurnId, node]));
    function syncActive() {
      if (!transcript) return;
      const distance = transcript.scrollHeight - transcript.clientHeight;
      if (distance > 0 && transcript.scrollTop >= distance - 1) {
        setActiveId(turns.at(-1)?.id ?? "");
        return;
      }
      const top = transcript.getBoundingClientRect().top + 24;
      let bestDistance = Infinity;
      let closest = turns[0]?.id ?? "";
      for (const turn of turns) {
        const node = nodes.get(turn.id);
        if (!node) continue;
        const distance = Math.abs(node.getBoundingClientRect().top - top);
        if (distance < bestDistance) { bestDistance = distance; closest = turn.id; }
      }
      setActiveId(closest);
    }
    syncActive();
    transcript.addEventListener("scroll", syncActive, { passive: true });
    const observer = new ResizeObserver(syncActive);
    observer.observe(transcript);
    if (transcript.firstElementChild) observer.observe(transcript.firstElementChild);
    return () => { transcript.removeEventListener("scroll", syncActive); observer.disconnect(); };
  }, [transcriptRef, turns]);

  // Scroll only the index, never its chat/host ancestors.
  useLayoutEffect(() => {
    if (previewIndex !== null) return;
    const strip = markersRef.current;
    const marker = markerRefs.current[activeIndex];
    if (!strip || !marker) return;
    function reveal() {
      if (!strip || !marker) return;
      const top = marker.offsetTop;
      if (top < strip.scrollTop) strip.scrollTop = top;
      else if (top + marker.offsetHeight > strip.scrollTop + strip.clientHeight) {
        strip.scrollTop = top + marker.offsetHeight - strip.clientHeight;
      }
    }
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [activeIndex, turns.length]);

  useLayoutEffect(() => {
    const rail = railRef.current;
    const strip = markersRef.current;
    const preview = previewRef.current;
    const marker = previewIndex === null ? null : markerRefs.current[previewIndex];
    if (!rail || !strip || !preview || !marker) return;
    function measure() {
      const rect = marker!.getBoundingClientRect();
      const bounds = strip!.getBoundingClientRect();
      if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) { setPreviewIndex(null); return; }
      const center = rect.top + rect.height / 2 - rail!.getBoundingClientRect().top;
      setPreviewTop(Math.max(0, Math.min(center - preview!.offsetHeight / 2, rail!.clientHeight - preview!.offsetHeight)));
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    observer.observe(preview);
    strip.addEventListener("scroll", measure, { passive: true });
    return () => { observer.disconnect(); strip.removeEventListener("scroll", measure); };
  }, [previewIndex, previewTurn]);

  function navigate(index: number) {
    const turn = turns[index];
    const transcript = transcriptRef.current;
    if (!turn || !transcript) return;
    const node = Array.from(transcript.querySelectorAll<HTMLElement>("[data-chat-turn-id]"))
      .find(element => element.dataset.chatTurnId === turn.id);
    if (!node) return;
    const top = transcript.scrollTop + node.getBoundingClientRect().top - transcript.getBoundingClientRect().top;
    transcript.scrollTo({ top, behavior: policy === "full" ? "smooth" : "instant" });
    setPreviewIndex(null);
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowDown" ? Math.min(index + 1, turns.length - 1)
      : event.key === "ArrowUp" ? Math.max(index - 1, 0)
      : event.key === "Home" ? 0 : event.key === "End" ? turns.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const marker = markerRefs.current[next];
    const strip = markersRef.current;
    if (!marker || !strip) return;
    if (marker.offsetTop < strip.scrollTop) strip.scrollTop = marker.offsetTop;
    else if (marker.offsetTop + marker.offsetHeight > strip.scrollTop + strip.clientHeight) {
      strip.scrollTop = marker.offsetTop + marker.offsetHeight - strip.clientHeight;
    }
    marker.focus({ preventScroll: true });
  }

  if (!turns.length) return null;

  return (
    <div ref={railRef} className="ef-chat-history-rail" data-theme-part="chat-history" data-agent-motion-policy={policy}
      onMouseLeave={() => setPreviewIndex(null)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPreviewIndex(null); }}
      onKeyDown={event => { if (event.key === "Escape") { setPreviewIndex(null); event.stopPropagation(); } }}>
      <div ref={markersRef} className="ef-chat-history-rail__markers" role="navigation" aria-label="Chat history">
        {turns.map((turn, index) => (
          <button key={turn.id} ref={node => { markerRefs.current[index] = node; }} type="button"
            className="ef-chat-history-rail__marker" data-active={index === activeIndex} data-hovered={index === previewIndex}
            aria-label={turn.userPreview} aria-current={index === activeIndex ? "location" : undefined}
            aria-describedby={index === previewIndex ? previewId : undefined} tabIndex={index === activeIndex ? 0 : -1}
            onClick={() => navigate(index)} onMouseEnter={() => setPreviewIndex(index)} onFocus={() => setPreviewIndex(index)}
            onKeyDown={event => handleKey(event, index)} />
        ))}
      </div>
      {previewTurn ? (
        <div ref={previewRef} id={previewId} role="tooltip" className="ef-chat-history-rail__preview" style={{ top: previewTop }}>
          <span className="ef-chat-history-rail__preview-user">{previewTurn.userPreview}</span>
          {previewTurn.assistantPreview ? <span className="ef-chat-history-rail__preview-assistant">{previewTurn.assistantPreview}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
