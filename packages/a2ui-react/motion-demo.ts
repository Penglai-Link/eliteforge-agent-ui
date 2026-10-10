import "@eliteforge/agent-ui-chat-theme/styles.css";
import { createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
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
function Demo() {
  const [mode, setMode] = useState<MotionConfig["mode"]>("system");
  const [duration, setDuration] = useState<number | undefined>(undefined),
    [replay, setReplay] = useState(0);
  return h(
    "main",
    {},
    h("h1", {}, "统一动效 · React"),
    h("p", {}, "切换策略、修改时长，再重播或展开组件。输入框草稿应保持不变。"),
    h(
      "div",
      { className: "motion-controls" },
      h(
        "label",
        {},
        "动效策略",
        h(
          "select",
          {
            value: mode,
            onChange: (event: any) => setMode(event.target.value),
          },
          ...["system", "full", "reduced", "off"].map((value) =>
            h("option", { key: value, value }, value)
          )
        )
      ),
      h(
        "label",
        {},
        "出现时长 ms",
        h("input", {
          type: "number",
          min: 0,
          max: 10000,
          value: duration ?? "",
          placeholder: "180",
          onChange: (event: any) =>
            setDuration(
              event.target.value === "" ? undefined : Number(event.target.value)
            ),
        })
      ),
      h(
        "button",
        { onClick: () => setReplay((value) => value + 1) },
        "重播出现效果"
      )
    ),
    h(
      MotionProvider,
      {
        config: {
          mode,
          duration,
          transitionDuration: 120,
          pulseDuration: 1600,
        },
      },
      h(
        AgentMotion,
        { className: "motion-sample", replayKey: replay },
        h(
          "label",
          {},
          "保留草稿",
          h("input", { defaultValue: "输入后切换策略" })
        )
      ),
      h(A2UISurface, { client, surfaceId: "common" })
    )
  );
}
createRoot(document.getElementById("app")!).render(h(Demo));
