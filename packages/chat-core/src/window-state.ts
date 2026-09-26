import type { ChatFloatingState } from "./types";

const FLOATING_WINDOW_MIN_WIDTH = 320;
const FLOATING_WINDOW_MIN_HEIGHT = 420;
const FLOATING_WINDOW_COLLAPSED_HEIGHT = 72;

export const defaultFloatingState: ChatFloatingState = {
  collapsed: false,
  height: 680,
  open: true,
  width: 440,
  x: 24,
  y: 24,
};

export interface ChatFloatingViewportBounds {
  viewportWidth: number;
  viewportHeight: number;
  anchorBottom?: number;
  anchorRight?: number;
  edgeGap?: number;
  panelHeight?: number;
  panelWidth?: number;
}

export function resolveFloatingViewportBounds(viewportWidth: number) {
  return viewportWidth <= 720
    ? { anchorBottom: 12, anchorRight: 12, edgeGap: 12 }
    : { anchorBottom: 24, anchorRight: 24, edgeGap: 12 };
}

export type FloatingWindowAction =
  | { type: "toggle-open"; open?: boolean }
  | { type: "toggle-collapsed"; collapsed?: boolean }
  | { type: "move"; x: number; y: number }
  | { type: "resize"; width: number; height: number };

function clampValue(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function floatingStatesEqual(left: ChatFloatingState, right: ChatFloatingState) {
  return left.collapsed === right.collapsed
    && left.height === right.height
    && left.open === right.open
    && left.width === right.width
    && left.x === right.x
    && left.y === right.y;
}

export function clampFloatingStateToViewport(
  state: ChatFloatingState,
  viewport: ChatFloatingViewportBounds,
): ChatFloatingState {
  const defaults = resolveFloatingViewportBounds(viewport.viewportWidth);
  const {
    anchorBottom = defaults.anchorBottom,
    anchorRight = defaults.anchorRight,
    edgeGap = defaults.edgeGap,
    viewportHeight,
    viewportWidth,
  } = viewport;
  const maxWidth = Math.max(0, viewportWidth - anchorRight - edgeGap);
  const maxHeight = Math.max(0, viewportHeight - anchorBottom - edgeGap);
  const minWidth = Math.min(FLOATING_WINDOW_MIN_WIDTH, maxWidth);
  const minHeight = Math.min(FLOATING_WINDOW_MIN_HEIGHT, maxHeight);

  const nextWidth = clampValue(
    state.width,
    minWidth,
    maxWidth,
  );
  const nextHeight = clampValue(
    state.height,
    minHeight,
    maxHeight,
  );
  const panelWidth = viewport.panelWidth ?? nextWidth;
  const panelHeight = viewport.panelHeight ?? (state.collapsed ? FLOATING_WINDOW_COLLAPSED_HEIGHT : nextHeight);
  const maxX = Math.max(0, viewportWidth - anchorRight - edgeGap - panelWidth);
  const maxY = Math.max(0, viewportHeight - anchorBottom - edgeGap - panelHeight);

  return {
    ...state,
    height: nextHeight,
    width: nextWidth,
    x: clampValue(state.x, 0, maxX),
    y: clampValue(state.y, 0, maxY),
  };
}

export function reduceFloatingState(
  state: ChatFloatingState,
  action: FloatingWindowAction,
): ChatFloatingState {
  switch (action.type) {
    case "toggle-open":
      return { ...state, open: action.open ?? !state.open };
    case "toggle-collapsed":
      return { ...state, collapsed: action.collapsed ?? !state.collapsed };
    case "move":
      return { ...state, x: action.x, y: action.y };
    case "resize":
      return {
        ...state,
        width: Math.max(FLOATING_WINDOW_MIN_WIDTH, action.width),
        height: Math.max(FLOATING_WINDOW_MIN_HEIGHT, action.height),
      };
    default:
      return state;
  }
}

export function readFloatingState(storageKey: string, fallback = defaultFloatingState) {
  if (typeof window === "undefined" || !storageKey) return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ChatFloatingState>;
    return {
      collapsed: Boolean(parsed.collapsed),
      height: typeof parsed.height === "number" ? parsed.height : fallback.height,
      open: parsed.open ?? fallback.open,
      width: typeof parsed.width === "number" ? parsed.width : fallback.width,
      x: typeof parsed.x === "number" ? parsed.x : fallback.x,
      y: typeof parsed.y === "number" ? parsed.y : fallback.y,
    };
  } catch {
    return fallback;
  }
}

export function writeFloatingState(storageKey: string, state: ChatFloatingState) {
  if (typeof window === "undefined" || !storageKey) return;
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}
