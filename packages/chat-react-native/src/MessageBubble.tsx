import { useMemo, type ReactNode } from "react";
import { Text, View } from "react-native";
import {
  formatTime,
  type ChatA2uiActionHandler,
  type ChatA2uiSession,
  type ChatMessage,
} from "@personai/agent-ui-chat-core/headless";
import { A2UIClient, A2UIRenderer } from "@personai/agent-ui-a2ui-react-native";
import {
  chatMetaTextStyle,
  chatTextStyle,
  resolveChatTheme,
  type ChatReactNativeTheme,
  type ChatStyle,
} from "./theme";

export interface MessageBubbleProps {
  message: ChatMessage;
  theme?: Partial<ChatReactNativeTheme>;
  style?: ChatStyle;
  showIdentity?: boolean;
  runtime?: ChatA2uiSession;
  onA2UIAction?: ChatA2uiActionHandler;
}

function messageBody(message: ChatMessage): string {
  const response = message.interactionResponse;
  if (response) {
    if (response.summaryLabel) return response.summaryLabel;
    return response.rows.map((row) => `${row.label}: ${row.value}`).join(" · ");
  }
  return message.content;
}

function attachmentLabels(message: ChatMessage): string {
  return (message.attachments ?? [])
    .map((attachment) => attachment.fileName || attachment.title || attachment.id)
    .filter(Boolean)
    .join(", ");
}

function MessageA2UI({
  message,
  runtime,
  onA2UIAction,
  theme,
}: {
  message: ChatMessage;
  runtime?: ChatA2uiSession;
  onA2UIAction?: ChatA2uiActionHandler;
  theme: ChatReactNativeTheme;
}): ReactNode {
  const client = useMemo(() => {
    const base =
      message.a2ui?.messages.length === 0 && runtime ? runtime.client : undefined;
    const target = base ?? new A2UIClient();
    try {
      for (const envelope of message.a2ui?.messages ?? []) target.apply(envelope);
    } catch {
      // A malformed persisted envelope must not break the whole message list.
    }
    return target;
  }, [message.a2ui, runtime]);
  const surfaceIds =
    message.a2ui?.surfaceIds ?? Object.keys(client.getSnapshot().surfaces);
  if (!surfaceIds.length) return null;
  return (
    <View style={{ alignSelf: "stretch", marginTop: 6 }}>
      <A2UIRenderer
        client={client}
        onAction={(action, metadata) => {
          const surface = runtime?.getSurface(action.action.surfaceId);
          onA2UIAction?.(
            action,
            runtime && surface ? runtime.metadata(surface.ownerAgentId) : metadata,
            surface
              ? { messageId: message.messageId, sessionId: message.sessionId, surface }
              : undefined,
          );
        }}
        surfaceIds={surfaceIds}
        theme={theme}
      />
    </View>
  );
}

/**
 * Minimal native message row: identity, plain-text body, attachment names and
 * embedded A2UI surfaces. Markdown/Mermaid/annotation selection stay web-only.
 */
export function MessageBubble({
  message,
  theme: themeOverride,
  style,
  showIdentity = false,
  runtime,
  onA2UIAction,
}: MessageBubbleProps): ReactNode {
  const theme = resolveChatTheme(themeOverride);
  const user = message.role === "USER";
  const body = messageBody(message);
  const attachments = attachmentLabels(message);
  return (
    <View
      style={[
        { alignItems: user ? "flex-end" : "flex-start", marginVertical: 4 },
        style,
      ]}
    >
      {showIdentity ? (
        <Text style={[chatMetaTextStyle(theme), { marginBottom: 2 }]}>
          {`${message.actor} · ${formatTime(message.createdAt)}`}
        </Text>
      ) : null}
      {body ? (
        <View
          style={{
            backgroundColor: user ? theme.userBubbleColor : theme.assistantBubbleColor,
            borderRadius: theme.borderRadius,
            maxWidth: "92%",
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text
            selectable
            style={[
              chatTextStyle(theme),
              user ? { color: theme.userBubbleTextColor } : null,
            ]}
          >
            {body}
          </Text>
        </View>
      ) : null}
      {attachments ? (
        <Text style={[chatMetaTextStyle(theme), { marginTop: 2 }]}>{attachments}</Text>
      ) : null}
      {message.a2ui ? (
        <MessageA2UI
          message={message}
          onA2UIAction={onA2UIAction}
          runtime={runtime}
          theme={theme}
        />
      ) : null}
    </View>
  );
}