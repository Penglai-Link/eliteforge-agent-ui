import {
  defineComponent,
  h,
  shallowRef,
  watch,
  onBeforeUnmount,
  type PropType,
  type VNodeChild,
} from "vue";
import {
  renderSurface,
  type A2UIClient,
  type ActionHandler,
  type RenderContext,
} from "@eliteforge/agent-ui-a2ui-core";
import "./styles.css";
export const A2UISurface = defineComponent({
  name: "A2UISurface",
  props: {
    client: { type: Object as PropType<A2UIClient>, required: true },
    surfaceId: { type: String, required: true },
    onAction: Function as PropType<ActionHandler>,
    components: Object as PropType<
      Record<string, (context: RenderContext) => VNodeChild>
    >,
  },
  setup(props) {
    const snapshot = shallowRef(props.client.getSnapshot());
    let unsubscribe = () => {};
    watch(
      () => props.client,
      (client) => {
        unsubscribe();
        snapshot.value = client.getSnapshot();
        unsubscribe = client.subscribe(() => {
          snapshot.value = client.getSnapshot();
        });
      },
      { immediate: true }
    );
    onBeforeUnmount(() => unsubscribe());
    return () => {
      snapshot.value;
      return renderSurface(
        props.client,
        props.surfaceId,
        (tag, attrs, children) => {
          const svgAttrs: Record<string, string> = {
            onKeyDown: "onKeydown",
            onContextMenu: "onContextmenu",
            onMouseDown: "onMousedown",
            onMouseEnter: "onMouseenter",
            onMouseLeave: "onMouseleave",
            onPointerDown: "onPointerdown",
            onPointerMove: "onPointermove",
            onPointerUp: "onPointerup",
            autoFocus: "autofocus",
            strokeWidth: "stroke-width",
            textAnchor: "text-anchor",
            fontSize: "font-size",
            strokeLinecap: "stroke-linecap",
            strokeLinejoin: "stroke-linejoin",
          };
          return h(
            tag,
            Object.fromEntries(
              Object.entries(attrs).map(([key, value]) => [
                svgAttrs[key] ?? key,
                value,
              ])
            ),
            children
          );
        },
        props.components,
        props.onAction
      );
    };
  },
});
