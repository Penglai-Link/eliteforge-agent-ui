import "@eliteforge/agent-ui-chat-theme/styles.css";
import { createApp, h, ref } from "vue";
import { A2UIClient } from "@eliteforge/agent-ui-a2ui-core";
import { initializeCommonDemo } from "@eliteforge/agent-ui-a2ui-core/demo";
import {
  AgentMotion,
  A2UISurface,
  MotionProvider,
  type MotionConfig,
} from "./src/index";
const client = new A2UIClient();
initializeCommonDemo(client);
createApp({
  setup() {
    const mode = ref<MotionConfig["mode"]>("system"),
      duration = ref<number | undefined>(),
      replay = ref(0);
    return () =>
      h("main", {}, [
        h("h1", {}, "统一动效 · Vue"),
        h(
          "p",
          {},
          "切换策略、修改时长，再重播或展开组件。输入框草稿应保持不变。"
        ),
        h("div", { class: "motion-controls" }, [
          h("label", {}, [
            "动效策略",
            h(
              "select",
              {
                value: mode.value,
                onChange: (event: any) => (mode.value = event.target.value),
              },
              ["system", "full", "reduced", "off"].map((value) =>
                h("option", { value }, value)
              )
            ),
          ]),
          h("label", {}, [
            "出现时长 ms",
            h("input", {
              type: "number",
              min: 0,
              max: 10000,
              value: duration.value ?? "",
              placeholder: "180",
              onInput: (event: any) =>
                (duration.value =
                  event.target.value === ""
                    ? undefined
                    : Number(event.target.value)),
            }),
          ]),
          h("button", { onClick: () => replay.value++ }, "重播出现效果"),
        ]),
        h(
          MotionProvider,
          {
            config: {
              mode: mode.value,
              duration: duration.value,
              transitionDuration: 120,
              pulseDuration: 1600,
            },
          },
          {
            default: () => [
              h(
                AgentMotion,
                { class: "motion-sample", replayKey: replay.value },
                {
                  default: () =>
                    h("label", {}, [
                      "保留草稿",
                      h("input", { placeholder: "输入后切换策略" }),
                    ]),
                }
              ),
              h(A2UISurface, { client, surfaceId: "common" }),
            ],
          }
        ),
      ]);
  },
}).mount("#app");
