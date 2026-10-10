import { AgentMotion } from "@eliteforge/agent-ui-motion-react";
import { createElement, useSyncExternalStore, type ReactNode } from "react";
import {
  renderSurface,
  type A2UIClient,
  type ActionHandler,
  type RenderContext,
} from "@eliteforge/agent-ui-a2ui-core";
import "./styles.css";
export interface A2UISurfaceProps {
  client: A2UIClient;
  surfaceId: string;
  onAction?: ActionHandler;
  components?: Record<string, (context: RenderContext) => ReactNode>;
}
export function A2UISurface({
  client,
  surfaceId,
  onAction,
  components,
}: A2UISurfaceProps): ReactNode {
  useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot
  );
  return renderSurface(
    client,
    surfaceId,
    (tag, props, children) => {
      const { class: className, ...rest } = props;
      if (tag === "option") delete rest.selected;
      if (props["data-agent-motion"]) {
        const { ref, ...motionAttrs } = rest;
        return createElement(AgentMotion, {
          ...motionAttrs, className, as: tag,
          preset: props["data-agent-motion"],
          replayKey: props["data-agent-motion-key"],
          disabled: Boolean(props["data-agent-motion-disabled"]) || Boolean(props.hidden),
          elementRef: ref,
        }, ...children);
      }
      return createElement(tag, { ...rest, className }, ...children);
    },
    components,
    onAction
  );
}

export { MotionProvider, AgentMotion, useMotion } from "@eliteforge/agent-ui-motion-react";
export type { MotionConfig, MotionEffects, MotionPreset, ResolvedMotion } from "@eliteforge/agent-ui-motion-react";
