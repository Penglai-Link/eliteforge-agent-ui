import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import {
  detectToolPresentationLocale,
  hasPendingBatchItems,
  interactionToolSummary,
  toolCommandCountLabel,
  toolCompactLabel,
  toolDisplayName,
  toolOperationDetails,
  toolResultIsError,
  type ChatWorkRailLabels,
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
  /** Raw tool result payload; only used to detect a top-level failure. */
  result?: string;
  status?: ToolCardStatus | string;
  locale?: string;
  /** Optional host labels, matching the Web `ChatWorkRailLabels` contract. */
  labels?: ChatWorkRailLabels;
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

/** Collapsible native tool row. Mirrors the Web work rail: a concise tool
 * title, a status glyph and the requested operation fields on demand. Raw
 * argument/result JSON is never rendered. */
export function ToolCard({
  toolName,
  args,
  result = "",
  status = "Completed",
  locale,
  labels,
  defaultExpanded = false,
  theme: themeOverride,
  style,
}: ToolCardProps): ReactNode {
  const theme = resolveChatTheme(themeOverride);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const presentationLocale = detectToolPresentationLocale(locale, [
    labels?.ariaLabel,
    labels?.thinking,
    labels?.preparing,
    labels?.responding,
  ]);
  const hostToolName = labels?.tool?.resolveName?.(toolName, args);
  const toolLabel = hostToolName
    ? toolCompactLabel(toolName, args, hostToolName, presentationLocale)
    : toolDisplayName(toolName, args, undefined, presentationLocale);
  const commandCountLabel = toolCommandCountLabel(
    toolName,
    args,
    presentationLocale,
  );
  const title = commandCountLabel ?? toolLabel;
  const interactionInfo = useMemo(
    () => interactionToolSummary(toolName, args),
    [toolName, args],
  );
  const operations = useMemo(
    () => toolOperationDetails(toolName, args, presentationLocale),
    [toolName, args, presentationLocale],
  );
  const expandable =
    interactionInfo === null &&
    operations.some((operation) => operation.fields.length > 0);
  const partial = hasPendingBatchItems(result);
  const failed =
    !partial && (status === "Failed" || toolResultIsError(result));
  const running =
    status === "Running" || status === "Waiting" || status === "Pending";
  const complete = !running && !failed;

  useEffect(() => {
    if (complete) setExpanded(false);
  }, [complete]);

  return (
    <View style={[{ marginVertical: 2 }, style]}>
      <Pressable
        accessibilityLabel={`${title}, ${statusLabel(String(status))}`}
        accessibilityRole={expandable ? "button" : "text"}
        accessibilityState={expandable ? { expanded } : undefined}
        disabled={!expandable}
        onPress={() => setExpanded((value) => !value)}
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: 8,
          paddingVertical: 6,
        }}
      >
        <Text
          style={{
            color: failed
              ? theme.dangerColor
              : complete
                ? theme.primaryColor
                : theme.mutedTextColor,
            fontSize: 13,
            fontWeight: "600",
            width: 14,
          }}
        >
          {failed ? "✕" : complete ? "✓" : "•"}
        </Text>
        <Text
          numberOfLines={2}
          style={[chatTextStyle(theme), { flex: 1 }]}
        >
          {title}
        </Text>
        {expandable ? (
          <Text style={{ color: theme.mutedTextColor, fontSize: 12 }}>
            {expanded ? "▾" : "▸"}
          </Text>
        ) : null}
      </Pressable>
      {expandable && expanded ? (
        <View style={{ gap: 6, paddingBottom: 6, paddingLeft: 22, paddingRight: 8 }}>
          {operations.map((operation, operationIndex) =>
            operation.fields.length ? (
              <View key={operationIndex} style={{ gap: 6 }}>
                {operations.length > 1 ? (
                  <Text style={[chatMetaTextStyle(theme), { fontWeight: "600" }]}>
                    {`${operationIndex + 1}. ${toolLabel}`}
                  </Text>
                ) : null}
                {operation.fields.map((field, fieldIndex) => (
                  <View key={fieldIndex} style={{ gap: 2 }}>
                    <Text style={chatMetaTextStyle(theme)}>{field.label}</Text>
                    <Text
                      selectable
                      style={[
                        chatMetaTextStyle(theme),
                        { color: theme.textColor },
                        field.code ? { fontFamily: "monospace" } : null,
                      ]}
                    >
                      {field.value}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null,
          )}
        </View>
      ) : null}
    </View>
  );
}