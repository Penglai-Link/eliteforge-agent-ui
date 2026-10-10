// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMotionPlayback,
  getMotionEnvironmentStore,
  mergeMotionConfig,
  motionTokens,
  resolveMotion,
} from "./index";
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
const environment = { reduced: false, hidden: false };

describe("shared motion contract", () => {
  it("respects explicit off/reduced, system preference, visibility and zero intensity", () => {
    for (const mode of ["off", "reduced"] as const)
      expect(resolveMotion({ mode }, "enter", environment).enabled).toBe(false);
    expect(
      resolveMotion({}, "enter", { ...environment, reduced: true }).enabled
    ).toBe(false);
    expect(
      resolveMotion({ mode: "full" }, "enter", {
        ...environment,
        reduced: true,
      }).enabled
    ).toBe(true);
    expect(
      resolveMotion({ mode: "full" }, "enter", { ...environment, hidden: true })
        .enabled
    ).toBe(false);
    expect(resolveMotion({ intensity: 0 }, "enter", environment).enabled).toBe(
      false
    );
  });

  it("inherits partial config and resolves preset/config/CSS precedence with bounded inputs", () => {
    const config = mergeMotionConfig(
      { duration: 400, presets: { enter: { distance: 12 } } },
      { delay: 20, duration: undefined }
    );
    expect(config.duration).toBe(400);
    expect(mergeMotionConfig({ mode: "off" }, { mode: "full" }).mode).toBe(
      "off"
    );
    expect(mergeMotionConfig({ mode: "reduced" }, { mode: "full" }).mode).toBe(
      "reduced"
    );
    expect(resolveMotion(config, "enter", environment)).toMatchObject({
      duration: 400,
      delay: 20,
      distance: 12,
    });
    const node = document.createElement("div");
    document.body.append(node);
    node.style.setProperty("--agent-ui-motion-duration", "0.6s");
    node.style.setProperty("--agent-ui-motion-enter-distance", "22px");
    expect(resolveMotion({}, "enter", environment, node)).toMatchObject({
      duration: 600,
      distance: 22,
    });
    expect(
      resolveMotion(
        { duration: 300, presets: { enter: { duration: 250 } } },
        "enter",
        environment,
        node
      ).duration
    ).toBe(250);
    expect(
      resolveMotion(
        { duration: NaN, distance: Infinity, delay: -20, intensity: 4 },
        "enter",
        environment,
        node
      )
    ).toMatchObject({ duration: 600, distance: 22, delay: 0, intensity: 1 });
    expect(
      motionTokens({ duration: 300, presets: { fade: { delay: 10 } } })
    ).toEqual({
      "--agent-ui-motion-duration": "300ms",
      "--agent-ui-motion-fade-delay": "10ms",
    });
  });

  it("replays only for a new identity, cancels when disabled and does not replay on re-enable", () => {
    const cancel = vi.fn(),
      driver = vi.fn(() => ({ cancel }));
    const player = createMotionPlayback(document.createElement("div"));
    const motion = resolveMotion({}, "enter", environment);
    player.update(motion, "question-1", driver);
    player.update({ ...motion, duration: 500 }, "question-1", driver);
    expect(driver).toHaveBeenCalledTimes(1);
    player.update({ ...motion, enabled: false }, "question-1", driver);
    expect(cancel).toHaveBeenCalledTimes(1);
    player.update(motion, "question-1", driver);
    expect(driver).toHaveBeenCalledTimes(1);
    player.update(motion, "question-2", driver);
    expect(driver).toHaveBeenCalledTimes(2);
    player.dispose();
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it("does not animate historical content first mounted disabled", () => {
    const driver = vi.fn(),
      player = createMotionPlayback(document.createElement("div"));
    player.update(
      resolveMotion({ mode: "off" }, "fade", environment),
      "history",
      driver
    );
    player.update(resolveMotion({}, "fade", environment), "history", driver);
    expect(driver).not.toHaveBeenCalled();
  });

  it("shares and releases browser observers, including runtime changes", () => {
    let mediaListener = () => {};
    const media = {
      matches: false,
      addEventListener: vi.fn((_name, listener) => {
        mediaListener = listener;
      }),
      removeEventListener: vi.fn(),
    };
    const doc = document.implementation.createHTMLDocument();
    Object.defineProperty(doc, "defaultView", {
      value: { matchMedia: () => media },
    });
    Object.defineProperty(doc, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    const store = getMotionEnvironmentStore(doc),
      a = vi.fn(),
      b = vi.fn();
    const stopA = store.subscribe(a),
      stopB = store.subscribe(b);
    expect(media.addEventListener).toHaveBeenCalledTimes(1);
    media.matches = true;
    mediaListener();
    expect(store.getSnapshot().reduced).toBe(true);
    Object.defineProperty(doc, "visibilityState", { value: "hidden" });
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(store.getSnapshot().hidden).toBe(true);
    stopA();
    expect(media.removeEventListener).not.toHaveBeenCalled();
    stopB();
    expect(media.removeEventListener).toHaveBeenCalledTimes(1);
  });
});
