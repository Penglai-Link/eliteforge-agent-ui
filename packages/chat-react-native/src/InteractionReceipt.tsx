import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { formatTime, type ChatMessage } from "@personai/agent-ui-chat-core/headless";
import { chatMetaTextStyle, chatTextStyle, type ChatReactNativeTheme } from "./theme";

/**
 * Native equivalent of the web `InteractionReceipt`: a compact, right-aligned
 * chip that expands into the accepted answers. It mirrors React/Vue so an
 * answered question stays visible in the transcript instead of disappearing
 * with the pending card.
 */
export function InteractionReceipt({
  message,
  actorName,
  hideMessageIdentity = false,
  theme,
}: {
  message: ChatMessage;
  actorName: string;
  hideMessageIdentity?: boolean;
  theme: ChatReactNativeTheme;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const response = message.interactionResponse;
  if (!response) return null;
  const label = response.summaryLabel ?? response.rows[0]?.value ?? "";
  const glyph = response.approval
    ? response.approval.approved ? "✓" : "✕"
    : response.kind === "form" ? "▤" : "?";
  const accent = response.approval && !response.approval.approved
    ? theme.dangerColor
    : theme.mutedTextColor;
  return (
    <View style={{ alignItems: "flex-end", alignSelf: "stretch", marginVertical: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{
          alignItems: "center",
          backgroundColor: theme.surfaceColor,
          borderColor: theme.borderColor,
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: "row",
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 6,
        }}
      >
        <Text style={{ color: accent, fontSize: 13, fontWeight: "700", lineHeight: 16 }}>{glyph}</Text>
        <Text style={[chatMetaTextStyle(theme), { color: theme.textColor, fontSize: 12 }]}>{label}</Text>
      </Pressable>
      {open ? (
        <View
          style={{
            backgroundColor: theme.surfaceColor,
            borderColor: theme.borderColor,
            borderRadius: theme.borderRadius,
            borderWidth: 1,
            gap: 8,
            marginTop: 6,
            maxWidth: "92%",
            padding: 12,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {!hideMessageIdentity ? (
              <Text style={chatMetaTextStyle(theme)}>{actorName}</Text>
            ) : <View />}
            {response.answeredAt != null ? (
              <Text style={chatMetaTextStyle(theme)}>{formatTime(message.createdAt)}</Text>
            ) : null}
          </View>
          {response.rows.map((row, index) => (
            <View key={`${row.label}:${index}`} style={{ gap: 2 }}>
              <Text style={[chatMetaTextStyle(theme), { fontSize: 11 }]}>{row.label}</Text>
              <Text style={[chatTextStyle(theme), { fontSize: 13, lineHeight: 19 }]}>{row.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}