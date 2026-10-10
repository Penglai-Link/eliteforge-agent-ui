// @vitest-environment jsdom
import { it } from "vitest";
import { initializeComponentGallery } from "@eliteforge/agent-ui-a2ui-core/demo";
import { A2UISurface } from "./index";
import { exerciseShadcn } from "../../../tests/shadcn-acceptance";
import { createApp, h, nextTick } from "vue";
it("new primitives edit, navigate, dispatch and restore state", async () => {
  const gallery = initializeComponentGallery(),
    host = document.createElement("div");
  document.body.append(host);
  const actions: any[] = [];
  const onAction = (message: any) => {
    actions.push(message);
  };
  const app = createApp({
    render: () =>
      h(
        "div",
        {},
        gallery.entries.map((e) =>
          h("section", { key: e.name, "data-example": e.name }, [
            h(A2UISurface, {
              client: gallery.client,
              surfaceId: e.surfaceId,
              onAction,
            }),
          ])
        )
      ),
  });
  app.mount(host);
  const flush = async (fn: () => void) => {
    fn();
    await nextTick();
  };
  const dispose = async () => app.unmount();
  try {
    await exerciseShadcn(host, gallery.client, flush, actions);
  } finally {
    await dispose();
    host.remove();
  }
});
