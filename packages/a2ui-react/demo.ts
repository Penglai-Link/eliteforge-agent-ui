import "@eliteforge/agent-ui-chat-theme/styles.css";
import { createElement, type ElementType } from "react";
const h = (tag: ElementType, props: any, ...children: any[]) => {
  const { class: className, ...rest } = props ?? {};
  return createElement(
    tag,
    { ...rest, ...(className ? { className } : {}) },
    ...children.flat()
  );
};
import { createRoot } from "react-dom/client";
import { A2UISurface } from "./src/index";
import {
  createProfileDemo,
  initializeComponentGallery,
  initializeAtomicDemo,
  initializeCommonDemo,
  initializeStatisticsDemo,
} from "@eliteforge/agent-ui-a2ui-core/demo";
const gallery = initializeComponentGallery();
const demo = createProfileDemo();
const onStatisticsAction = initializeStatisticsDemo(demo.client);
const onAtomicAction = initializeAtomicDemo(demo.client);
const onCommonAction = initializeCommonDemo(demo.client);
createRoot(document.getElementById("app")!).render(
  h(
    "main",
    {},
    h("h1", {}, "A2UI · React"),
    h("nav", { class: "demo-nav", "aria-label": "展示区域" }, [
      h("a", { href: "#atomic-gallery" }, "原子组件"),
      h("a", { href: "#composed-examples" }, "组合示例"),
    ]),
    h(
      "section",
      { id: "atomic-gallery", "aria-labelledby": "gallery-heading" },
      [
        h("h2", { id: "gallery-heading" }, "原子组件 · 39 个"),
        h(
          "p",
          {},
          "每个示例独立展示一个组件。Row、Column、Card 等容器包含必要的子内容。"
        ),
        h(
          "div",
          { class: "demo-gallery" },
          gallery.entries.map(({ name, surfaceId }) =>
            h(
              "article",
              {
                key: name,
                class: "demo-example",
                "data-demo-component": name,
                "aria-labelledby": `label-${name}`,
              },
              [
                h("h3", { id: `label-${name}` }, name),
                h(A2UISurface, { client: gallery.client, surfaceId }),
              ]
            )
          )
        ),
      ]
    ),
    h("h2", { id: "composed-examples" }, "组合示例"),
    h(
      "p",
      {},
      "以下示例通过多个组件组合而成，可测试数据绑定、表单提交和布局。"
    ),
    h(A2UISurface, {
      client: demo.client,
      surfaceId: "statistics",
      onAction: onStatisticsAction,
    }),
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
    h(
      "h2",
      {},
      "媒体与偏好表单 · Card + Column + Image + Slider + DateTimeInput"
    ),
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
    h("h2", {}, "设置与反馈 · Tabs + Grid + Table + Modal"),
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
