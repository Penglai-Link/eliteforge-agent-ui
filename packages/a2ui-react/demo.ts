import "@eliteforge/agent-ui-chat-theme/styles.css";
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { A2UISurface } from "./src/index";
import {
  createProfileDemo,
  initializeAtomicDemo,
  initializeCommonDemo,
} from "@eliteforge/agent-ui-a2ui-core/demo";
const demo = createProfileDemo();
const onAtomicAction = initializeAtomicDemo(demo.client);
const onCommonAction = initializeCommonDemo(demo.client);
createRoot(document.getElementById("app")!).render(
  h(
    "main",
    {},
    h("h1", {}, "A2UI · React"),
    h("button", { onClick: () => demo.next() }, "接收下一条消息"),
    h(A2UISurface, {
      client: demo.client,
      surfaceId: "profile",
      onAction: (message, metadata) => {
        document.getElementById("action")!.textContent = JSON.stringify(
          { message, metadata },
          null,
          2
        );
        demo.onAction(message, metadata);
      },
    }),
    h("pre", { id: "action" }),
    h("h2", {}, "更多原子组件"),
    h(A2UISurface, {
      client: demo.client,
      surfaceId: "atoms",
      onAction: (message, metadata) => {
        document.getElementById("atomic-action")!.textContent = JSON.stringify(
          { message, metadata },
          null,
          2
        );
        onAtomicAction(message, metadata);
      },
    }),
    h("pre", { id: "atomic-action" }),
    h("h2", {}, "布局、数据与反馈"),
    h(A2UISurface, {
      client: demo.client,
      surfaceId: "common",
      onAction: (message, metadata) => {
        document.getElementById("common-action")!.textContent = JSON.stringify(
          { message, metadata },
          null,
          2
        );
        onCommonAction(message, metadata);
      },
    }),
    h("pre", { id: "common-action" })
  )
);
