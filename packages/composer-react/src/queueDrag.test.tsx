// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { Composer } from "./Composer";
import { queueDragContract, queuedMessages, type QueueDragProps } from "../../../tests/queueDragContract";

queueDragContract((initial, reorder) => {
  const component = (props: QueueDragProps) => <Composer
    composerKey={props.composerKey} draft={props.draft} onDraftChange={() => {}} onSend={() => {}}
    queuedMessages={queuedMessages}
    onReorderQueuedMessage={props.enabled ? (sourceId, targetId) => reorder(sourceId, targetId, props.draft) : undefined}
  />;
  const host = render(component(initial));
  let unmounted = false;
  return {
    container: host.container,
    async update(props) { host.rerender(component(props)); },
    unmount() { if (!unmounted) { unmounted = true; host.unmount(); } },
  };
});
