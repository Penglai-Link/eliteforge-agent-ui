import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clampFloatingStateToViewport,
  defaultFloatingState,
  floatingStatesEqual,
  readFloatingState,
  reduceFloatingState,
  resolveFloatingViewportBounds,
  writeFloatingState,
} from "./window-state";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reduceFloatingState", () => {
  it("clamps resize operations and supports open/collapse toggles", () => {
    const resized = reduceFloatingState(defaultFloatingState, {
      type: "resize",
      height: 200,
      width: 120,
    });
    expect(resized.width).toBe(320);
    expect(resized.height).toBe(420);

    const closed = reduceFloatingState(defaultFloatingState, { type: "toggle-open", open: false });
    expect(closed.open).toBe(false);

    const collapsed = reduceFloatingState(defaultFloatingState, { type: "toggle-collapsed", collapsed: true });
    expect(collapsed.collapsed).toBe(true);
  });
});

describe("floating state persistence", () => {
  it("round-trips state through localStorage", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem(key: string) {
          return storage.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          storage.set(key, value);
        },
      },
    });

    const state = {
      ...defaultFloatingState,
      height: 720,
      open: false,
      width: 560,
      x: 64,
      y: 88,
    };

    writeFloatingState("eliteforge.agent-ui.chat.test", state);
    expect(readFloatingState("eliteforge.agent-ui.chat.test")).toEqual(state);
  });

  it("falls back cleanly when storage contains invalid JSON", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem() {
          return "{not-valid-json";
        },
        setItem() {
          // noop
        },
      },
    });

    expect(readFloatingState("eliteforge.agent-ui.chat.test")).toEqual(defaultFloatingState);
  });
});

describe("clampFloatingStateToViewport", () => {
  it("keeps the floating window inside the current viewport", () => {
    const clamped = clampFloatingStateToViewport(
      {
        ...defaultFloatingState,
        height: 900,
        width: 900,
        x: 500,
        y: 500,
      },
      {
        ...resolveFloatingViewportBounds(800),
        viewportHeight: 640,
        viewportWidth: 800,
      },
    );

    expect(clamped.width).toBe(764);
    expect(clamped.height).toBe(604);
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(0);
  });

  it("uses the collapsed height when constraining vertical position", () => {
    const clamped = clampFloatingStateToViewport(
      {
        ...defaultFloatingState,
        collapsed: true,
        height: 680,
        y: 900,
      },
      {
        ...resolveFloatingViewportBounds(1280),
        viewportHeight: 720,
        viewportWidth: 1280,
      },
    );

    expect(clamped.height).toBe(680);
    expect(clamped.y).toBe(612);
  });

  it("shrinks below the nominal minimum when the viewport is smaller than the default window size", () => {
    const clamped = clampFloatingStateToViewport(
      {
        ...defaultFloatingState,
        height: 680,
        width: 440,
      },
      {
        ...resolveFloatingViewportBounds(360),
        viewportHeight: 360,
        viewportWidth: 360,
      },
    );

    expect(clamped.width).toBe(336);
    expect(clamped.height).toBe(336);
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(0);
  });
});

describe("floatingStatesEqual", () => {
  it("compares all persisted fields", () => {
    expect(floatingStatesEqual(defaultFloatingState, { ...defaultFloatingState })).toBe(true);
    expect(floatingStatesEqual(defaultFloatingState, { ...defaultFloatingState, y: 40 })).toBe(false);
  });
});
