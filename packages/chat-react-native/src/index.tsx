export * from "./theme";
export * from "./MessageBubble";
export * from "./Markdown";
export * from "./MessageList";
export * from "./Composer";
export * from "./ApprovalCard";
export * from "./InteractionReceipt";
export * from "./ToolCard";
export * from "./ChatPanel";

/**
 * Re-export the A2UI native renderer so a host only needs this package for a
 * basic chat screen. The components stay owned by `a2ui-react-native` — this
 * is a convenience export, not a fork.
 */
export { A2UIRenderer, A2UISurface } from "@personai/agent-ui-a2ui-react-native";
export type {
  A2UIReactNativeTheme,
  A2UIRendererProps,
  A2UISurfaceProps,
} from "@personai/agent-ui-a2ui-react-native";