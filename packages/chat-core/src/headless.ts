/**
 * Platform-neutral entry point for non-DOM hosts (React Native, Node, tests).
 *
 * Only modules that do not touch `document`/`window`/`HTMLElement`, load
 * `mermaid`, or import CSS are re-exported here. The root entry keeps the web
 * runtime (`annotations`, `mermaid`, `window-state`, composer helpers) so
 * existing React/Vue consumers are unchanged.
 */
export * from "./types";
export * from "./annotationTypes";
export * from "./chatMessages";
export * from "./transcript";
export * from "./aguiWork";
export * from "./toolPresentation";
export * from "./a2ui";
export * from "./a2uiInteractions";
export * from "./artifacts";
export * from "./nativeInteractions";
export * from "./interactionMessages";
export * from "./history";
export * from "./historyWork";
export * from "./workTimeline";
export * from "./toolResults";
export * from "./toolOperationDetails";
export * from "./interactionSummary";
export * from "./toolBatch";
export * from "./errorPresentation";
export * from "./display";
export * from "./normalize";
export * from "./runtimeMessages";