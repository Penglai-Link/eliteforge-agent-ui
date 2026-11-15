import type { ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { ChatSubmitMode } from "@personai/agent-ui-chat-core/headless";
import {
  chatMetaTextStyle,
  resolveChatTheme,
  type ChatReactNativeTheme,
  type ChatStyle,
} from "./theme";

export interface ComposerProps {
  value: string;
  onChangeText: (value: string) => void;
  onSend: (mode?: ChatSubmitMode) => void;
  onStop?: () => void;
  sending?: boolean;
  disabled?: boolean;
  sendDisabled?: boolean;
  placeholder?: string;
  sendLabel?: string;
  stopLabel?: string;
  autoFocus?: boolean;
  maxLength?: number;
  /** Host controls rendered above the input surface. */
  header?: ReactNode;
  theme?: Partial<ChatReactNativeTheme>;
  style?: ChatStyle;
  testID?: string;
}

/**
 * Controlled native composer. Draft ownership stays with the host (the same
 * `draft`/`onDraftChange` contract as the React composer), which keeps it
 * compatible with `chat-core` queues and RPC-backed chat state.
 */
export function Composer({
  value,
  onChangeText,
  onSend,
  onStop,
  sending = false,
  disabled = false,
  sendDisabled = false,
  placeholder = "Message…",
  sendLabel = "Send",
  stopLabel = "Stop",
  autoFocus = false,
  maxLength,
  header,
  theme: themeOverride,
  style,
  testID,
}: ComposerProps): ReactNode {
  const theme = resolveChatTheme(themeOverride);
  const canSend = !disabled && !sendDisabled && !sending;
  return (
    <View
      style={[
        {
          borderTopColor: theme.borderColor,
          borderTopWidth: 1,
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 8,
        },
        style,
      ]}
      testID={testID}
    >
      {header}
      <View style={{ alignItems: "flex-end", flexDirection: "row", gap: 8 }}>
        <TextInput
          accessibilityLabel={placeholder}
          autoFocus={autoFocus}
          editable={!disabled}
          maxLength={maxLength}
          multiline
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.mutedTextColor}
          style={[
            {
              backgroundColor: theme.assistantBubbleColor,
              borderColor: theme.borderColor,
              borderRadius: theme.borderRadius,
              borderWidth: 1,
              color: theme.textColor,
              flex: 1,
              fontSize: 15,
              maxHeight: 132,
              minHeight: 44,
              paddingHorizontal: 10,
              paddingVertical: 8,
              textAlignVertical: "top",
            },
          ]}
          value={value}
        />
        {sending && onStop ? (
          <Pressable
            accessibilityLabel={stopLabel}
            onPress={onStop}
            style={{
              alignItems: "center",
              backgroundColor: theme.dangerColor,
              borderRadius: theme.borderRadius,
              justifyContent: "center",
              minHeight: 44,
              paddingHorizontal: 14,
            }}
          >
            <Text style={{ color: theme.primaryTextColor, fontSize: 14, fontWeight: "600" }}>
              {stopLabel}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel={sendLabel}
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={() => onSend()}
            style={{
              alignItems: "center",
              backgroundColor: theme.primaryColor,
              borderRadius: theme.borderRadius,
              justifyContent: "center",
              minHeight: 44,
              opacity: canSend ? 1 : 0.5,
              paddingHorizontal: 14,
            }}
          >
            <Text style={{ color: theme.primaryTextColor, fontSize: 14, fontWeight: "600" }}>
              {sendLabel}
            </Text>
          </Pressable>
        )}
      </View>
      {disabled && !sending ? (
        <Text style={chatMetaTextStyle(theme)}>Input is disabled.</Text>
      ) : null}
    </View>
  );
}