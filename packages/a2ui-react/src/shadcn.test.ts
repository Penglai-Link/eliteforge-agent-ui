// @vitest-environment jsdom
import { it } from "vitest";
import { initializeComponentGallery } from "@eliteforge/agent-ui-a2ui-core/demo";
import { A2UISurface } from "./index";
import { exerciseShadcn } from "../../../tests/shadcn-acceptance";
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";
it("new primitives edit, navigate, dispatch and restore state", async () => {
  const gallery = initializeComponentGallery(),
    host = document.createElement("div");
  document.body.append(host);
  const actions: any[] = [];
  const onAction = (message: any) => {
    actions.push(message);
  };
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(host);
  await act(async () =>
    root.render(
      h(
        "div",
        {},
        ...gallery.entries.map((e) =>
          h(
            "section",
            { key: e.name, "data-example": e.name },
            h(A2UISurface, {
              client: gallery.client,
              surfaceId: e.surfaceId,
              onAction,
            })
          )
        )
      )
    )
  );
  const flush = async (fn: () => void) => {
    await act(async () => fn());
  };
  const dispose = async () => {
    await act(async () => root.unmount());
  };
  try {
    await exerciseShadcn(host, gallery.client, flush, actions);
  } finally {
    await dispose();
    host.remove();
  }
});
