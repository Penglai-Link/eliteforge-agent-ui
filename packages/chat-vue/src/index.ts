import "./styles.css";

import ChatPanel from "./components/ChatPanel.vue";
import ChatRuntimeWindow from "./components/ChatRuntimeWindow.vue";
import ChatWindow from "./components/ChatWindow.vue";

export type {
  ChatPanelProps,
  ChatRuntimeWindowProps,
  ToastLikeCallback,
  ChatWindowProps,
} from "./types";

export { ChatPanel, ChatRuntimeWindow, ChatWindow };

export { MotionProvider, AgentMotion, useMotion } from "@personai/agent-ui-motion-vue";
export type { MotionConfig, MotionEffects, MotionPreset, ResolvedMotion } from "@personai/agent-ui-motion-vue";
