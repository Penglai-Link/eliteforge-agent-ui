import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  createMotionPlayback,
  getMotionEnvironmentStore,
  mergeMotionConfig,
  motionPolicy,
  motionTokens,
  resolveMotion,
  type MotionConfig,
  type MotionEnvironment,
  type MotionPreset,
  type ResolvedMotion,
} from "@eliteforge/agent-ui-motion-core";
import "@eliteforge/agent-ui-motion-core/styles.css";
export type {
  MotionConfig,
  MotionPreset,
  ResolvedMotion,
} from "@eliteforge/agent-ui-motion-core";

export interface MotionEffectProps {
  children?: ReactNode;
  motion: ResolvedMotion;
  replayKey?: string | number;
}
export type MotionEffects = Partial<
  Record<MotionPreset, ComponentType<MotionEffectProps>>
>;
interface MotionContextValue {
  config: MotionConfig;
  effects: MotionEffects;
}
const empty: MotionContextValue = { config: {}, effects: {} };
const MotionContext = createContext(empty);

export function useMotionEnvironment(): MotionEnvironment {
  const store = getMotionEnvironmentStore();
  const [environment, setEnvironment] = useState(store.getSnapshot);
  useEffect(
    () => store.subscribe(() => setEnvironment(store.getSnapshot())),
    [store]
  );
  return environment;
}
export function useMotion() {
  const context = useContext(MotionContext);
  const environment = useMotionEnvironment();
  return {
    ...context,
    environment,
    policy: motionPolicy(context.config, environment),
  };
}
export interface MotionProviderProps extends HTMLAttributes<HTMLDivElement> {
  config?: MotionConfig;
  effects?: MotionEffects;
}
export function MotionProvider({
  config,
  effects,
  children,
  style,
  ...attrs
}: MotionProviderProps) {
  const parent = useContext(MotionContext);
  const value = useMemo(
    () => ({
      config: mergeMotionConfig(parent.config, config),
      effects: { ...parent.effects, ...effects },
    }),
    [parent, config, effects]
  );
  const environment = useMotionEnvironment();
  return createElement(
    MotionContext.Provider,
    { value },
    createElement(
      "div",
      {
        ...attrs,
        "data-agent-motion-policy": motionPolicy(value.config, environment),
        style: { display: "contents", ...motionTokens(value.config), ...style },
      },
      children
    )
  );
}
export interface AgentMotionProps extends HTMLAttributes<HTMLElement> {
  as?: string;
  preset?: MotionPreset;
  replayKey?: string | number;
  disabled?: boolean;
  /** Preserves native A2UI refs, including focus and dialog lifecycle hooks. */
  elementRef?: (element: HTMLElement | null) => void;
}
export function AgentMotion({
  as = "div",
  preset = "enter",
  replayKey,
  disabled,
  elementRef,
  children,
  ...attrs
}: AgentMotionProps) {
  const { config, effects, environment } = useMotion();
  const element = useRef<HTMLElement>(null);
  const playback = useRef<ReturnType<typeof createMotionPlayback> | undefined>(
    undefined
  );
  const [themedMotion, setThemedMotion] = useState<ResolvedMotion>();
  const Effect = effects[preset];
  const motion = resolveMotion(
    disabled ? { ...config, mode: "off" } : config,
    preset,
    environment,
    element.current ?? undefined
  );
  useLayoutEffect(() => {
    if (!Effect || !element.current) return;
    const next = resolveMotion(
      disabled ? { ...config, mode: "off" } : config,
      preset,
      environment,
      element.current
    );
    if (JSON.stringify(next) !== JSON.stringify(themedMotion))
      setThemedMotion(next);
  });
  useEffect(() => {
    if (!element.current || Effect) return;
    const player = createMotionPlayback(element.current);
    playback.current = player;
    return () => {
      player.dispose();
      playback.current = undefined;
    };
  }, [Effect, as]);
  useEffect(() => {
    if (!element.current) return;
    playback.current?.update(
      resolveMotion(
        disabled ? { ...config, mode: "off" } : config,
        preset,
        environment,
        element.current
      ),
      replayKey
    );
  });
  const content = createElement(
    as,
    {
      ...attrs,
      "data-agent-motion": preset,
      ref: (node: HTMLElement | null) => {
        element.current = node;
        elementRef?.(node);
      },
    },
    children
  );
  return Effect
    ? createElement(
        Effect,
        { motion: themedMotion ?? motion, replayKey },
        content
      )
    : content;
}
