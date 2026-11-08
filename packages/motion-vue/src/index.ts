import {
  computed,
  defineComponent,
  h,
  inject,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  provide,
  shallowRef,
  type Component,
  type InjectionKey,
  type PropType,
} from "vue";
import {
  createMotionPlayback,
  getMotionEnvironmentStore,
  mergeMotionConfig,
  motionPolicy,
  motionTokens,
  resolveMotion,
  type MotionConfig,
  type MotionPreset,
  type ResolvedMotion,
} from "@personai/agent-ui-motion-core";
import "@personai/agent-ui-motion-core/styles.css";
export type {
  MotionConfig,
  MotionPreset,
  ResolvedMotion,
} from "@personai/agent-ui-motion-core";
export interface MotionEffectProps {
  motion: ResolvedMotion;
  replayKey?: string | number;
}
export type MotionEffects = Partial<Record<MotionPreset, Component>>;
interface MotionContextValue {
  config: MotionConfig;
  effects: MotionEffects;
}
const empty: MotionContextValue = { config: {}, effects: {} };
const motionKey: InjectionKey<() => MotionContextValue> =
  Symbol("agent-ui-motion");
export function useMotionEnvironment() {
  const store = getMotionEnvironmentStore();
  const environment = shallowRef(store.getSnapshot());
  let stop = () => {};
  onMounted(() => {
    stop = store.subscribe(() => {
      environment.value = store.getSnapshot();
    });
  });
  onBeforeUnmount(() => stop());
  return environment;
}
export function useMotion() {
  const context = inject(motionKey, () => empty);
  const environment = useMotionEnvironment();
  return computed(() => ({
    ...context(),
    environment: environment.value,
    policy: motionPolicy(context().config, environment.value),
  }));
}
export const MotionProvider = defineComponent({
  name: "MotionProvider",
  inheritAttrs: false,
  props: {
    config: Object as PropType<MotionConfig>,
    effects: Object as PropType<MotionEffects>,
  },
  setup(props, { attrs, slots }) {
    const parent = inject(motionKey, () => empty);
    const context = computed(() => ({
      config: mergeMotionConfig(parent().config, props.config),
      effects: { ...parent().effects, ...props.effects },
    }));
    provide(motionKey, () => context.value);
    const environment = useMotionEnvironment();
    return () =>
      h(
        "div",
        {
          ...attrs,
          "data-agent-motion-policy": motionPolicy(
            context.value.config,
            environment.value
          ),
          style: [
            { display: "contents", ...motionTokens(context.value.config) },
            attrs.style as any,
          ],
        },
        slots.default?.()
      );
  },
});
export const AgentMotion = defineComponent({
  name: "AgentMotion",
  inheritAttrs: false,
  props: {
    as: { type: String, default: "div" },
    preset: { type: String as PropType<MotionPreset>, default: "enter" },
    replayKey: [String, Number],
    disabled: Boolean,
    elementRef: Function as PropType<(element: HTMLElement | null) => void>,
  },
  setup(props, { attrs, slots }) {
    const state = useMotion();
    let element: HTMLElement | null = null;
    let playbackElement: HTMLElement | null = null;
    let player: ReturnType<typeof createMotionPlayback> | undefined;
    const themedMotion = shallowRef<ResolvedMotion>();
    const resolved = () =>
      resolveMotion(
        props.disabled
          ? { ...state.value.config, mode: "off" }
          : state.value.config,
        props.preset,
        state.value.environment,
        element ?? undefined
      );
    const update = () => {
      if (!element) return;
      if (state.value.effects[props.preset]) {
        player?.dispose();
        player = undefined;
        const next = resolved();
        if (JSON.stringify(next) !== JSON.stringify(themedMotion.value))
          themedMotion.value = next;
        return;
      }
      if (element !== playbackElement) {
        player?.dispose();
        player = undefined;
        playbackElement = element;
      }
      player ??= createMotionPlayback(element);
      player.update(resolved(), props.replayKey);
    };
    onMounted(update);
    onUpdated(update);
    onBeforeUnmount(() => player?.dispose());
    return () => {
      const Effect = state.value.effects[props.preset];
      const content = h(
        props.as,
        {
          ...attrs,
          "data-agent-motion": props.preset,
          ref: (node: any) => {
            element = node;
            props.elementRef?.(node);
          },
        },
        slots.default?.()
      );
      return Effect
        ? h(
            Effect,
            {
              motion: themedMotion.value ?? resolved(),
              replayKey: props.replayKey,
            },
            { default: () => content }
          )
        : content;
    };
  },
});
