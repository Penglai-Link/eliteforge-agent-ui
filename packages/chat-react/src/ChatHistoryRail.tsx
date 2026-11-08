import type { TranscriptPresentation, ChatMessage } from "@personai/agent-ui-chat-core";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";


import { buildChatHistoryTurns } from "./chatHistory";

interface ChatHistoryRailProps {
  messages: ChatMessage[];
  transcriptRef: RefObject<HTMLElement | null>;
  presentation: TranscriptPresentation;
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function closestTurnToViewportTop(
  container: HTMLElement,
  turnIds: string[],
) {
  const scrollableDistance = container.scrollHeight - container.clientHeight;
  if (scrollableDistance > 0 && container.scrollTop >= scrollableDistance - 1) {
    return turnIds.at(-1) ?? "";
  }
  const containerTop = container.getBoundingClientRect().top;
  let activeTurnId = turnIds[0] ?? "";
  let bestDistance = Number.POSITIVE_INFINITY;

  turnIds.forEach((turnId) => {
    const node = container.querySelector<HTMLElement>(`[data-chat-turn-id="${turnId}"]`);
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const distance = Math.abs(rect.top - containerTop - 24);
    if (distance < bestDistance) {
      bestDistance = distance;
      activeTurnId = turnId;
    }
  });

  return activeTurnId;
}

function markerInfluence(distance: number) {
  const radius = 60;
  const normalized = Math.max(0, 1 - distance / radius);
  return normalized * normalized;
}

function closestMarkerIndex(offsets: number[], pointerOffset: number) {
  let matchedIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  offsets.forEach((offset, index) => {
    const distance = Math.abs(offset - pointerOffset);
    if (distance < bestDistance) {
      bestDistance = distance;
      matchedIndex = index;
    }
  });
  return matchedIndex;
}

export function ChatHistoryRail({
  messages,
  transcriptRef,
  presentation,
}: ChatHistoryRailProps) {
  const turns = useMemo(
    () => buildChatHistoryTurns(messages, presentation),
    [messages, presentation],
  );
  const [activeTurnId, setActiveTurnId] = useState("");
  const [hoveredTurnId, setHoveredTurnId] = useState("");
  const [hoveredMarkerIndex, setHoveredMarkerIndex] = useState<number | null>(null);
  const [markerOffsets, setMarkerOffsets] = useState<number[]>([]);
  const railRef = useRef<HTMLDivElement | null>(null);
  const markerRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript || !turns.length) {
      setActiveTurnId("");
      return;
    }

    const turnIds = turns.map((turn) => turn.id);

    function syncActiveTurn() {
      const container = transcriptRef.current;
      if (!container) return;
      setActiveTurnId(closestTurnToViewportTop(container, turnIds));
    }

    syncActiveTurn();
    transcript.addEventListener("scroll", syncActiveTurn, { passive: true });
    window.addEventListener("resize", syncActiveTurn);

    return () => {
      transcript.removeEventListener("scroll", syncActiveTurn);
      window.removeEventListener("resize", syncActiveTurn);
    };
  }, [transcriptRef, turns]);

  useEffect(() => {
    if (!turns.some((turn) => turn.id === hoveredTurnId)) {
      setHoveredTurnId("");
    }
  }, [hoveredTurnId, turns]);

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) {
      setMarkerOffsets([]);
      return;
    }

    function measureMarkers() {
      const railRect = rail!.getBoundingClientRect();
      setMarkerOffsets(
        markerRefs.current.map((node) => {
          if (!node) return 0;
          const rect = node.getBoundingClientRect();
          return rect.top - railRect.top + rect.height / 2;
        }),
      );
    }

    measureMarkers();
    window.addEventListener("resize", measureMarkers);
    return () => window.removeEventListener("resize", measureMarkers);
  }, [turns]);

  useEffect(() => {
    if (hoveredMarkerIndex === null) {
      setHoveredTurnId("");
      return;
    }
    const hoveredTurn = turns[hoveredMarkerIndex];
    setHoveredTurnId(hoveredTurn?.id ?? "");
  }, [hoveredMarkerIndex, turns]);

  const handleRailClick = () => {
    if (hoveredMarkerIndex === null) return;
    const turn = turns[hoveredMarkerIndex];
    if (!turn) return;
    const transcript = transcriptRef.current;
    const target = transcript?.querySelector<HTMLElement>(
      `[data-chat-turn-id="${turn.id}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const hoveredTurn = turns.find((turn) => turn.id === hoveredTurnId) ?? null;
  const hoveredMarkerOffset = hoveredMarkerIndex !== null ? markerOffsets[hoveredMarkerIndex] : null;

  if (!turns.length) return null;

  return (
    <div
      className="ef-chat-history-rail"
      ref={railRef}
      onMouseLeave={() => setHoveredMarkerIndex(null)}
      onMouseMove={(event) => {
        const rail = railRef.current;
        if (!rail || markerOffsets.length === 0) return;
        const rect = rail.getBoundingClientRect();
        const pointerOffset = event.clientY - rect.top;
        setHoveredMarkerIndex(closestMarkerIndex(markerOffsets, pointerOffset));
      }}
      onClick={handleRailClick}
    >
      <div className="ef-chat-history-rail__markers" aria-label="Chat history">
        {turns.map((turn, index) => {
          const active = hoveredMarkerIndex === null && turn.id === activeTurnId;
          const hovered = hoveredMarkerIndex === index;
          const anchorOffset = hoveredMarkerIndex === null ? null : (markerOffsets[hoveredMarkerIndex] ?? null);
          const distance = anchorOffset === null
            ? Number.POSITIVE_INFINITY
            : Math.abs((markerOffsets[index] ?? 0) - anchorOffset);
          const influence = markerInfluence(distance);

          const width = hovered
            ? 24
            : 6 + influence * 14 + (active ? 8 : 0);
          return (
            <button
              key={turn.id}
              className={cx(
                "ef-chat-history-rail__marker",
                active && "ef-chat-history-rail__marker--active",
              )}
              type="button"
              aria-label={turn.userPreview}
              data-active={active ? "true" : "false"}
              data-hovered={hovered ? "true" : "false"}
              ref={(node) => {
                markerRefs.current[index] = node;
              }}
              style={{
                width: hoveredMarkerIndex !== null ? `${width}px` : `${active ? 14 : 6}px`,
              }}
              onClick={() => {
                const transcript = transcriptRef.current;
                const target = transcript?.querySelector<HTMLElement>(
                  `[data-chat-turn-id="${turn.id}"]`,
                );
                target?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              onMouseEnter={() => setHoveredMarkerIndex(index)}
              onFocus={() => {
                setHoveredMarkerIndex(index);
              }}
              onBlur={() => setHoveredMarkerIndex((current) => (current === index ? null : current))}
            >
              <span className="ef-chat-history-rail__sr-only">{turn.userPreview}</span>
            </button>
          );
        })}
      </div>
      {hoveredTurn && hoveredMarkerOffset !== null ? (
        <span
          className={cx(
            "ef-chat-history-rail__preview",
            !hoveredTurn.hasAssistantReply &&
            hoveredTurn.hasWorkActivity &&
            "ef-chat-history-rail__preview--compact",
          )}
          role="tooltip"
          style={{
            top: `${hoveredMarkerOffset}px`,
          }}
        >
          <span className="ef-chat-history-rail__preview-user">
            {hoveredTurn.userPreview}
          </span>
          {hoveredTurn.hasAssistantReply ? (
            <span className="ef-chat-history-rail__preview-assistant markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]} >
                {hoveredTurn.assistantPreview}
              </ReactMarkdown>
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
