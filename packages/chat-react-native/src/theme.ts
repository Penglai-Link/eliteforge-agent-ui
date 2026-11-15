import {
  defaultA2UIReactNativeTheme,
  type A2UIReactNativeTheme,
} from "@personai/agent-ui-a2ui-react-native";

/** RN style bag. Kept local so declarations stay free of react-native types. */
export type ChatStyle = Record<string, unknown>;

/** Chat tokens extend the A2UI tokens so bubbles and rendered surfaces agree. */
export interface ChatReactNativeTheme extends A2UIReactNativeTheme {
  panelColor: string;
  userBubbleColor: string;
  userBubbleTextColor: string;
  assistantBubbleColor: string;
}

export const defaultChatReactNativeTheme: ChatReactNativeTheme = {
  ...defaultA2UIReactNativeTheme,
  panelColor: "#ffffff",
  userBubbleColor: "#0969da",
  userBubbleTextColor: "#ffffff",
  assistantBubbleColor: "#f6f8fa",
};

export function resolveChatTheme(
  theme?: Partial<ChatReactNativeTheme>,
): ChatReactNativeTheme {
  return theme ? { ...defaultChatReactNativeTheme, ...theme } : defaultChatReactNativeTheme;
}

export function chatTextStyle(theme: ChatReactNativeTheme): ChatStyle {
  return { color: theme.textColor, fontSize: 15, lineHeight: 22 };
}

export function chatMetaTextStyle(theme: ChatReactNativeTheme): ChatStyle {
  return { color: theme.mutedTextColor, fontSize: 12, lineHeight: 16 };
}