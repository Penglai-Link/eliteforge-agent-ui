// @vitest-environment jsdom
import { createApp, h, nextTick, shallowRef } from "vue";
import Composer from "./Composer.vue";
import { queueDragContract, queuedMessages } from "../../../tests/queueDragContract";

queueDragContract((initial, reorder) => {
  const props = shallowRef(initial);
  const container = document.createElement("div");
  document.body.append(container);
  const app = createApp({ render: () => {
    const current = props.value;
    return h(Composer, {
      composerKey: current.composerKey, draft: current.draft,
      onDraftChange: () => {}, onSend: () => {}, queuedMessages,
      onReorderQueuedMessage: current.enabled
        ? (sourceId: string, targetId: string) => reorder(sourceId, targetId, current.draft) : undefined,
    });
  } });
  app.mount(container);
  let unmounted = false;
  return {
    container,
    async update(next) { props.value = next; await nextTick(); },
    unmount() { if (!unmounted) { unmounted = true; app.unmount(); container.remove(); } },
  };
});
