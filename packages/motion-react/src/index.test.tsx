// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { AgentMotion, MotionProvider, type MotionEffectProps } from "./index";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as any).animate;
});

it("preserves DOM and drafts across content/config/policy updates and explicit replay", () => {
  const cancel = vi.fn(),
    animate = vi.fn(() => ({ cancel }));
  Object.defineProperty(HTMLElement.prototype, "animate", {
    value: animate,
    configurable: true,
  });
  const view = (mode: "full" | "off", replayKey = "q1") =>
    h(
      MotionProvider,
      { config: { mode, duration: 350 } },
      h(
        AgentMotion,
        { replayKey, preset: "fade" },
        h("input", { defaultValue: "draft" })
      )
    );
  const result = render(view("full")),
    input = result.container.querySelector("input")!;
  input.value = "typed";
  expect(animate).toHaveBeenCalledTimes(1);
  result.rerender(view("full"));
  expect(animate).toHaveBeenCalledTimes(1);
  result.rerender(view("off"));
  expect(cancel).toHaveBeenCalled();
  result.rerender(view("full"));
  expect(animate).toHaveBeenCalledTimes(1);
  result.rerender(view("full", "q2"));
  expect(animate).toHaveBeenCalledTimes(2);
  expect(result.container.querySelector("input")).toBe(input);
  expect(input.value).toBe("typed");
});

it("provides a stable host effect component with policy and replay identity", () => {
  const seen: MotionEffectProps[] = [];
  const Effect = (props: MotionEffectProps) => {
    seen.push(props);
    return h("section", {}, props.children);
  };
  const effects = { enter: Effect };
  const view = (mode: "full" | "reduced") =>
    h(
      MotionProvider,
      { config: { mode, distance: 16 }, effects },
      h(
        AgentMotion,
        { replayKey: "card" },
        h("input", { defaultValue: "draft" })
      )
    );
  const result = render(view("full")),
    input = result.container.querySelector("input");
  expect(seen.at(-1)?.motion).toMatchObject({ enabled: true, distance: 16 });
  result.rerender(view("reduced"));
  expect(seen.at(-1)?.motion.enabled).toBe(false);
  expect(result.container.querySelector("input")).toBe(input);
  expect(
    result.container
      .querySelector("[data-agent-motion-policy]")
      ?.getAttribute("data-agent-motion-policy")
  ).toBe("reduced");
});
