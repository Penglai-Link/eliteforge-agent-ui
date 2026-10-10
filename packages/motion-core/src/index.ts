import "./styles.css";

export type MotionMode = "system" | "full" | "reduced" | "off";
export type MotionPreset = "enter" | "fade";
export interface MotionSettings {
  /** Milliseconds. */
  duration?: number;
  delay?: number;
  /** Pixels. */
  distance?: number;
  /** 0..1; scales the movement, not the final content opacity. */
  intensity?: number;
  easing?: string;
}
export interface MotionConfig extends MotionSettings {
  mode?: MotionMode;
  presets?: Partial<Record<MotionPreset, MotionSettings>>;
  transitionDuration?: number;
  spinDuration?: number;
  pulseDuration?: number;
  pulseEasing?: string;
}
export interface MotionEnvironment {
  reduced: boolean;
  hidden: boolean;
}
export interface ResolvedMotion {
  preset: MotionPreset;
  enabled: boolean;
  duration: number;
  delay: number;
  distance: number;
  intensity: number;
  easing: string;
}
export const defaultMotionConfig = Object.freeze({
  mode: "system" as MotionMode,
  duration: 180,
  delay: 0,
  distance: 8,
  intensity: 1,
  easing: "ease-out",
});

export function mergeMotionConfig(
  parent: MotionConfig,
  child: MotionConfig = {}
): MotionConfig {
  const settings = Object.fromEntries(
    Object.entries(child).filter(([, value]) => value !== undefined)
  );
  return {
    ...parent,
    ...settings,
    mode:
      parent.mode === "off"
        ? "off"
        : parent.mode === "reduced" && child.mode !== "off"
        ? "reduced"
        : child.mode ?? parent.mode,
    presets: {
      enter: { ...parent.presets?.enter, ...child.presets?.enter },
      fade: { ...parent.presets?.fade, ...child.presets?.fade },
    },
  };
}

const bounded = (value: unknown, fallback: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(max, value))
    : fallback;

export function motionPolicy(
  config: MotionConfig,
  environment: MotionEnvironment
): "full" | "reduced" | "off" {
  if (config.mode === "off" || environment.hidden) return "off";
  if (
    config.mode === "reduced" ||
    (config.mode !== "full" && environment.reduced)
  )
    return "reduced";
  return "full";
}

/** Config > preset CSS token > shared CSS token > defaults. CSS is read at playback time. */
export function resolveMotion(
  config: MotionConfig,
  preset: MotionPreset,
  environment: MotionEnvironment,
  element?: HTMLElement
): ResolvedMotion {
  const settings = { ...config, ...config.presets?.[preset] };
  const css = element?.ownerDocument.defaultView?.getComputedStyle(element);
  const token = (name: string) =>
    css?.getPropertyValue(`--agent-ui-motion-${preset}-${name}`).trim() ||
    css?.getPropertyValue(`--agent-ui-motion-${name}`).trim();
  const number = (
    name: string,
    value: unknown,
    fallback: number,
    max: number
  ) => {
    const raw = token(name);
    let parsed = raw ? Number.parseFloat(raw) : NaN;
    if (
      (name === "duration" || name === "delay") &&
      raw?.endsWith("s") &&
      !raw.endsWith("ms")
    )
      parsed *= 1000;
    return bounded(value, bounded(parsed, fallback, max), max);
  };
  const intensity = number("intensity", settings.intensity, 1, 1);
  const duration = number("duration", settings.duration, 180, 10000);
  return {
    preset,
    enabled:
      motionPolicy(config, environment) === "full" &&
      intensity > 0 &&
      duration > 0,
    duration,
    delay: number("delay", settings.delay, 0, 10000),
    distance:
      preset === "fade" ? 0 : number("distance", settings.distance, 8, 200),
    intensity,
    easing: settings.easing || token("easing") || "ease-out",
  };
}

/** Only explicit values are written, so ancestor theme tokens remain inheritable. */
export function motionTokens(config: MotionConfig): Record<string, string> {
  const result: Record<string, string> = {};
  const write = (settings: MotionSettings, prefix: string) => {
    for (const key of [
      "duration",
      "delay",
      "distance",
      "intensity",
      "easing",
    ] as const) {
      const value = settings[key];
      if (value === undefined) continue;
      const unit =
        key === "duration" || key === "delay"
          ? "ms"
          : key === "distance"
          ? "px"
          : "";
      result[`--agent-ui-motion-${prefix}${key}`] = `${value}${unit}`;
    }
  };
  write(config, "");
  for (const [key, token] of [
    ["transitionDuration", "transition-duration"],
    ["spinDuration", "spin-duration"],
    ["pulseDuration", "pulse-duration"],
  ] as const) {
    if (config[key] !== undefined)
      result[`--agent-ui-motion-${token}`] = `${bounded(
        config[key],
        120,
        10000
      )}ms`;
  }
  if (config.pulseEasing)
    result["--agent-ui-motion-pulse-easing"] = config.pulseEasing;
  for (const preset of ["enter", "fade"] as const)
    write(config.presets?.[preset] ?? {}, `${preset}-`);
  return result;
}

const serverEnvironment: MotionEnvironment = Object.freeze({
  reduced: true,
  hidden: false,
});
const stores = new WeakMap<
  Document,
  ReturnType<typeof createEnvironmentStore>
>();
function createEnvironmentStore(doc: Document) {
  let snapshot: MotionEnvironment = {
    reduced:
      doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)")
        .matches ?? false,
    hidden: doc.visibilityState === "hidden",
  };
  const listeners = new Set<() => void>();
  let stop = () => {};
  return {
    getSnapshot: () => {
      // Preferences may change while there are no mounted consumers.
      if (!listeners.size) {
        const reduced =
          doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)")
            .matches ?? false;
        const hidden = doc.visibilityState === "hidden";
        if (snapshot.reduced !== reduced || snapshot.hidden !== hidden)
          snapshot = { reduced, hidden };
      }
      return snapshot;
    },
    subscribe(listener: () => void) {
      if (!listeners.size) {
        const media = doc.defaultView?.matchMedia?.(
          "(prefers-reduced-motion: reduce)"
        );
        const update = () => {
          const reduced = media?.matches ?? false,
            hidden = doc.visibilityState === "hidden";
          if (snapshot.reduced === reduced && snapshot.hidden === hidden)
            return;
          snapshot = { reduced, hidden };
          for (const notify of listeners) notify();
        };
        update();
        media?.addEventListener?.("change", update);
        doc.addEventListener("visibilitychange", update);
        stop = () => {
          media?.removeEventListener?.("change", update);
          doc.removeEventListener("visibilitychange", update);
        };
      }
      listeners.add(listener);
      listener();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) stop();
      };
    },
  };
}
export function getMotionEnvironmentStore(
  doc: Document | undefined = typeof document === "undefined"
    ? undefined
    : document
) {
  if (!doc)
    return {
      getSnapshot: () => serverEnvironment,
      subscribe: (_listener: () => void) => () => {},
    };
  let store = stores.get(doc);
  if (!store) {
    store = createEnvironmentStore(doc);
    stores.set(doc, store);
  }
  return store;
}

export interface MotionHandle {
  cancel(): void;
}
export type MotionDriver = (
  element: HTMLElement,
  motion: ResolvedMotion
) => MotionHandle | undefined;
export const nativeMotionDriver: MotionDriver = (element, motion) => {
  if (!motion.enabled || typeof element.animate !== "function") return;
  let animation: Animation;
  try {
    const frames =
      motion.preset === "fade"
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            {
              opacity: 0,
              transform: `translateY(${motion.distance * motion.intensity}px)`,
            },
            { opacity: 1, transform: "translateY(0)" },
          ];
    animation = element.animate(frames, {
      duration: motion.duration,
      delay: motion.delay,
      easing: motion.easing,
      fill: "backwards",
    });
  } catch {
    return;
  } // Unsupported host easing must never hide or break content.
  animation.finished?.then(
    () => animation.cancel(),
    () => {}
  );
  return { cancel: () => animation.cancel() };
};

/** One playback per identity; content/config updates never replay a live form. */
export function createMotionPlayback(element: HTMLElement) {
  let initialized = false,
    identity: string | number | undefined,
    preset: MotionPreset;
  let handle: MotionHandle | undefined;
  return {
    update(
      motion: ResolvedMotion,
      replayKey?: string | number,
      driver: MotionDriver = nativeMotionDriver
    ) {
      const replay =
        !initialized || identity !== replayKey || preset !== motion.preset;
      initialized = true;
      identity = replayKey;
      preset = motion.preset;
      if (!motion.enabled || replay) {
        handle?.cancel();
        handle = undefined;
      }
      if (motion.enabled && replay) handle = driver(element, motion);
    },
    dispose() {
      handle?.cancel();
      handle = undefined;
    },
  };
}
