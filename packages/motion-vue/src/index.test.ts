// @vitest-environment jsdom
import { createApp, defineComponent, h, nextTick, shallowRef } from "vue";
import { expect, it, vi } from "vitest";
import {
  AgentMotion,
  MotionProvider,
  type MotionConfig,
  type ResolvedMotion,
} from "./index";

it("matches React playback and preserves form state across policy and identity updates", async () => {
  const cancel = vi.fn(),
    animate = vi.fn(() => ({ cancel }));
  Object.defineProperty(HTMLElement.prototype, "animate", {
    value: animate,
    configurable: true,
  });
  const config = shallowRef<MotionConfig>({ mode: "full", duration: 350 });
  const replayKey = shallowRef("q1");
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(
        MotionProvider,
        { config: config.value },
        {
          default: () =>
            h(
              AgentMotion,
              { preset: "fade", replayKey: replayKey.value },
              { default: () => h("input", { value: "draft" }) }
            ),
        }
      ),
  });
  app.mount(host);
  try {
    const input = host.querySelector("input")!;
    input.value = "typed";
    expect(animate).toHaveBeenCalledTimes(1);
    config.value = { mode: "full", duration: 500 };
    await nextTick();
    expect(animate).toHaveBeenCalledTimes(1);
    config.value = { mode: "off" };
    await nextTick();
    expect(cancel).toHaveBeenCalled();
    config.value = { mode: "full" };
    await nextTick();
    expect(animate).toHaveBeenCalledTimes(1);
    replayKey.value = "q2";
    await nextTick();
    expect(animate).toHaveBeenCalledTimes(2);
    expect(host.querySelector("input")).toBe(input);
  } finally {
    app.unmount();
    host.remove();
    delete (HTMLElement.prototype as any).animate;
  }
});

it("passes the same effect contract to host-owned Vue adapters without remounting children", async () => {
  const seen: ResolvedMotion[] = [];
  const Effect = defineComponent({
    props: ["motion", "replayKey"],
    setup(props, { slots }) {
      return () => {
        seen.push(props.motion);
        return h("section", {}, slots.default?.());
      };
    },
  });
  const config = shallowRef<MotionConfig>({ mode: "full", distance: 16 });
  const host = document.createElement("div"),
    app = createApp({
      render: () =>
        h(
          MotionProvider,
          { config: config.value, effects: { enter: Effect } },
          {
            default: () =>
              h(
                AgentMotion,
                { replayKey: "card" },
                { default: () => h("input") }
              ),
          }
        ),
    });
  app.mount(host);
  try {
    const input = host.querySelector("input");
    expect(seen.at(-1)).toMatchObject({ enabled: true, distance: 16 });
    config.value = { mode: "reduced" };
    await nextTick();
    expect(seen.at(-1)?.enabled).toBe(false);
    expect(host.querySelector("input")).toBe(input);
  } finally {
    app.unmount();
  }
});
