import { useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import {
  formatJsonBlockValue,
  presentToolCall,
  toolResultPreview,
  truncateLabel,
} from "@personai/agent-ui-chat-core/headless";
import {
  chatMetaTextStyle,
  chatTextStyle,
  resolveChatTheme,
  type ChatReactNativeTheme,
  type ChatStyle,
} from "./theme";

export type ToolCardStatus =
  | "Pending"
  | "Waiting"
  | "Running"
  | "Completed"
  | "Failed"
  | "NotExecuted"
  | "Unknown";

export interface ToolCardProps {
  toolName: string;
  args?: unknown;
  /** Raw tool result payload; summarised through `chat-core`'s preview parser. */
  result?: string;
  status?: ToolCardStatus | string;
  locale?: string;
  defaultExpanded?: boolean;
  theme?: Partial<ChatReactNativeTheme>;
  style?: ChatStyle;
}

function statusLabel(status: string): string {
  switch (status) {
    case "Running":
      return "Running";
    case "Waiting":
      return "Waiting";
    case "Completed":
      return "Completed";
    case "Failed":
      return "Failed";
    case "NotExecuted":
      return "Not executed";
    case "Pending":
      return "Pending";
    default:
      return status;
  }
}

function resultSummary(result: string): string {
  const preview = toolResultPreview(result);
  const text = preview.texts.join("\n").trim();
  return truncateLabel(text || result, 1200);
}

/** Collapsible native tool call card: title from tool presentation, parameters
 * and result summary on demand. */
export function ToolCard({
  toolName,
  args,
  result = "",
  status = "Completed",
  locale,
  defaultExpanded = false,
  theme: themeOverride,
  style,
}: ToolCardProps): ReactNode {
  const theme = resolveChatTheme(themeOverride);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const title = useMemo(
    () => presentToolCall(toolName, args, { locale }).title,
    [toolName, args, locale],
  );
  const parameters = useMemo(
    () => (args == null ? "" : formatJsonBlockValue(args)),
    [args],
  );
  const resultText = useMemo(() => (result.trim() ? resultSummary(result) : ""), [result]);
  const failed = status === "Failed";
  return (
    <View
      style={[
        {
          backgroundColor: theme.surfaceColor,
          borderColor: failed ? theme.dangerColor : theme.borderColor,
          borderRadius: theme.borderRadius,
          borderWidth: 1,
          marginVertical: 4,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <Text style={{ color: theme.mutedTextColor, fontSize: 12 }}>{expanded ? "▾" : "▸"}</Text>
        <Text style={[chatTextStyle(theme), { flex: 1, fontWeight: "600" }]} numberOfLines={2}>
          {title}
        </Text>
        <Text
          style={[
            chatMetaTextStyle(theme),
            failed ? { color: theme.dangerColor } : null,
          ]}
        >
          {statusLabel(String(status))}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={{ borderTopColor: theme.borderColor, borderTopWidth: 1, gap: 8, padding: 12 }}>
          {parameters ? (
            <View style={{ gap: 4 }}>
              <Text style={[chatMetaTextStyle(theme), { fontWeight: "600" }]}>Parameters</Text>
              <Text style={[chatMetaTextStyle(theme), { fontFamily: "monospace" }]}>
                {parameters}
              </Text>
            </View>
          ) : null}
          {resultText ? (
            <View style={{ gap: 4 }}>
              <Text style={[chatMetaTextStyle(theme), { fontWeight: "600" }]}>Result</Text>
              <Text selectable style={[chatMetaTextStyle(theme), { color: theme.textColor }]}>
                {resultText}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}