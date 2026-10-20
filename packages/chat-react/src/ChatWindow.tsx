import { Bot, Maximize2, Minus, X, Plus } from "lucide-react";
import {
  clampFloatingStateToViewport,
  defaultFloatingState,
  floatingStatesEqual,
  readFloatingState,
  reduceFloatingState,
  resolveFloatingViewportBounds,
  writeFloatingState,
  type ChatFloatingState,
} from "@eliteforge/agent-ui-chat-core";
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChatPanel, type ChatPanelProps } from "./ChatPanel";

interface ChatWindowProps extends Omit<
  ChatPanelProps,
  "headerContent" | "showHeader"
> {
  state?: ChatFloatingState;
  showNewSession?: boolean;
  storageKey?: string;
  title?: string;
  titleSubtitle?: string;
  resizeHint?: string;
  onStateChange?: (state: ChatFloatingState) => void;
}

export function ChatWindow({
  onStateChange,
  showNewSession = true,
  state,
  storageKey = "eliteforge.agent-ui.chat.window",
  title = "Chat",
  titleSubtitle = "AI assistant",
  resizeHint = "Drag to resize the window. Arrow keys fine-tune the size; hold Shift for larger steps.",
  ...panelProps
}: ChatWindowProps) {
  const isControlled = Boolean(state && onStateChange);
  const [localState, setLocalState] = useState(() =>
    readFloatingState(storageKey, defaultFloatingState),
  );
  const [transientState, setTransientState] = useState<ChatFloatingState | null>(null);
  const [viewportRevision, setViewportRevision] = useState(0);
  const [resizing, setResizing] = useState(false);
  const activeState = transientState ?? (isControlled ? (state as ChatFloatingState) : localState);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  const normalizedStateRef = useRef<string | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    width: number;
    height: number;
  } | null>(null);

  function isInteractiveTarget(target: EventTarget | null) {
    return (
      target instanceof Element &&
      Boolean(
        target.closest("button, a, input, textarea, select, [role='button']"),
      )
    );
  }

  useEffect(() => {
    if (!isControlled) writeFloatingState(storageKey, localState);
  }, [isControlled, localState, storageKey]);

  const buildViewportState = useCallback((next: ChatFloatingState) => {
    if (typeof window === "undefined") {
      return next;
    }

    return clampFloatingStateToViewport(next, {
      ...resolveFloatingViewportBounds(window.innerWidth),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    });
  }, []);

  const applyState = useCallback(
    (next: ChatFloatingState, normalize = true) => {
      const resolvedState = normalize ? buildViewportState(next) : next;
      if (isControlled) {
        onStateChange?.(resolvedState);
        return;
      }
      setLocalState(resolvedState);
    },
    [buildViewportState, isControlled, onStateChange],
  );

  const visibleState = useMemo(
    () => buildViewportState(activeState),
    [activeState, buildViewportState, viewportRevision],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !visibleState.open || transientState !== null) {
      normalizedStateRef.current = null;
      return;
    }

    const normalizationKey = [
      window.innerWidth,
      window.innerHeight,
      activeState.collapsed,
      activeState.height,
      activeState.open,
      activeState.width,
      activeState.x,
      activeState.y,
      visibleState.collapsed,
      visibleState.height,
      visibleState.open,
      visibleState.width,
      visibleState.x,
      visibleState.y,
    ].join(":");

    if (floatingStatesEqual(activeState, visibleState)) {
      normalizedStateRef.current = null;
      return;
    }

    if (normalizedStateRef.current === normalizationKey) {
      return;
    }

    normalizedStateRef.current = normalizationKey;
    applyState(visibleState, false);
  }, [activeState, applyState, visibleState, transientState]);

  useEffect(() => {
    if (typeof window === "undefined" || !visibleState.open) {
      return;
    }

    function handleViewportResize() {
      setViewportRevision((current) => current + 1);
    }

    window.addEventListener("resize", handleViewportResize);
    return () => window.removeEventListener("resize", handleViewportResize);
  }, [visibleState.open]);

  const panelStyle = useMemo(
    () => ({
      height: visibleState.collapsed ? 72 : visibleState.height,
      transform: `translate(${-visibleState.x}px, ${-visibleState.y}px)`,
      width: visibleState.width,
    }),
    [visibleState],
  );

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (visibleState.collapsed || isInteractiveTarget(event.target)) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: visibleState.x,
      y: visibleState.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setTransientState(visibleState);
  }

  function handleDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId)
      return;
    const next = reduceFloatingState(visibleState, {
      type: "move",
      x: dragRef.current.x - (event.clientX - dragRef.current.startX),
      y: dragRef.current.y - (event.clientY - dragRef.current.startY),
    });
    setTransientState(next);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId)
      return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (transientState) {
      applyState(transientState);
      setTransientState(null);
    }
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      height: visibleState.height,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: visibleState.width,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
    setTransientState(visibleState);
  }

  function handleResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!resizeRef.current || resizeRef.current.pointerId !== event.pointerId)
      return;
    const next = reduceFloatingState(visibleState, {
      type: "resize",
      height:
        resizeRef.current.height - (event.clientY - resizeRef.current.startY),
      width:
        resizeRef.current.width - (event.clientX - resizeRef.current.startX),
    });
    setTransientState(next);
  }

  function endResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!resizeRef.current || resizeRef.current.pointerId !== event.pointerId)
      return;
    resizeRef.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (transientState) {
      applyState(transientState);
      setTransientState(null);
    }
  }

  function handleResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 40 : 10;
    // The window is anchored at the bottom right; its top-left corner moves.
    applyState(reduceFloatingState(visibleState, {
      type: "resize",
      width: visibleState.width + (event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0),
      height: visibleState.height + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0),
    }));
  }

  return (
    <div className="ef-chat-window">
      {!visibleState.open ? (
        <button
          className="ef-chat__button ef-chat-window__fab"
          type="button"
          onClick={() =>
            applyState(
              reduceFloatingState(visibleState, {
                type: "toggle-open",
                open: true,
              }),
            )
          }
        >
          <Bot size={16} />
          <span>{title}</span>
        </button>
      ) : (
        <div
          className={
            visibleState.collapsed
              ? "ef-chat-window__panel ef-chat-window__panel--collapsed"
              : "ef-chat-window__panel"
          }
          ref={panelRef}
          style={panelStyle}
        >
          <div
            className="ef-chat-window__header"
            onPointerDown={startDrag}
            onPointerMove={handleDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="ef-chat-window__title">
              <Bot size={18} aria-hidden="true" />
              <div className="ef-chat-window__title-text">
                <span className="ef-chat-window__title-main">{title}</span>
              </div>
            </div>
            <div className="ef-chat-window__actions">
              {showNewSession ? <button
                className="ef-chat-window__control"
                type="button"
                title="New chat"
                aria-label="New chat"
                onClick={() => panelProps.onNewSession?.()}
              >
                <Plus size={16} />
              </button> : null}
              <button
                className="ef-chat-window__control"
                type="button"
                title={visibleState.collapsed ? "Expand chat" : "Collapse chat"}
                aria-label={visibleState.collapsed ? "Expand chat" : "Collapse chat"}
                onClick={() =>
                  applyState(
                    reduceFloatingState(visibleState, {
                      type: "toggle-collapsed",
                    }),
                  )
                }
              >
                {visibleState.collapsed ? <Maximize2 size={16} /> : <Minus size={16} />}
              </button>
              <button
                className="ef-chat-window__control"
                type="button"
                aria-label="Close chat"
                onClick={() =>
                  applyState(
                    reduceFloatingState(visibleState, {
                      type: "toggle-open",
                      open: false,
                    }),
                  )
                }
              >
                <X size={16} />
              </button>
            </div>
          </div>
          {!visibleState.collapsed ? (
            <div className="ef-chat-window__body">
              <ChatPanel {...panelProps} showHeader={false} />
            </div>
          ) : null}
          {!visibleState.collapsed ? (
            <div
              className="ef-chat-window__resize"
              role="group"
              tabIndex={0}
              title={resizeHint}
              aria-label={resizeHint}
              data-resizing={resizing || undefined}
              onPointerDown={startResize}
              onPointerMove={handleResize}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              onLostPointerCapture={endResize}
              onKeyDown={handleResizeKeyDown}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
