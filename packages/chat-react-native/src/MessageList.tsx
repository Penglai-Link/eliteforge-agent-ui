import { useEffect, useRef, type ReactNode } from "react";
import { FlatList, Text, View } from "react-native";
import type {
  ChatA2uiActionHandler,
  ChatA2uiSession,
  ChatMessage,
} from "@personai/agent-ui-chat-core/headless";
import { MessageBubble } from "./MessageBubble";
import {
  chatMetaTextStyle,
  resolveChatTheme,
  type ChatReactNativeTheme,
  type ChatStyle,
} from "./theme";

export interface MessageListProps {
  messages: ChatMessage[];
  theme?: Partial<ChatReactNativeTheme>;
  style?: ChatStyle;
  contentContainerStyle?: ChatStyle;
  showIdentity?: boolean;
  runtime?: ChatA2uiSession;
  onA2UIAction?: ChatA2uiActionHandler;
  emptyTitle?: string;
  emptyDescription?: string;
  autoScrollToEnd?: boolean;
  /** Extra dependency for auto-scroll; bump when a footer grows (e.g. pending cards). */
  scrollToEndKey?: string | number;
  ListHeaderComponent?: ReactNode;
  ListFooterComponent?: ReactNode;
}

/**
 * Native transcript list. Powered by `FlatList` so long transcripts stay
 * virtualized; messages are the same `ChatMessage` shape produced by
 * `chat-core` history/transcript helpers.
 */
export function MessageList({
  messages,
  theme: themeOverride,
  style,
  contentContainerStyle,
  showIdentity = false,
  runtime,
  onA2UIAction,
  emptyTitle = "No messages yet",
  emptyDescription,
  autoScrollToEnd = true,
  scrollToEndKey,
  ListHeaderComponent,
  ListFooterComponent,
}: MessageListProps): ReactNode {
  const theme = resolveChatTheme(themeOverride);
  const listRef = useRef<any>(null);
  useEffect(() => {
    if (!autoScrollToEnd || (!messages.length && scrollToEndKey === undefined)) return;
    listRef.current?.scrollToEnd?.({ animated: true });
  }, [autoScrollToEnd, messages.length, scrollToEndKey]);
  return (
    <FlatList
      contentContainerStyle={[
        { flexGrow: 1, paddingHorizontal: 12, paddingVertical: 8 },
        contentContainerStyle,
      ]}
      data={messages}
      keyExtractor={(message: ChatMessage) => message.messageId}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        <View style={{ alignItems: "center", flex: 1, justifyContent: "center", padding: 24 }}>
          <Text style={{ color: theme.textColor, fontSize: 16, fontWeight: "600" }}>
            {emptyTitle}
          </Text>
          {emptyDescription ? (
            <Text style={[chatMetaTextStyle(theme), { marginTop: 6, textAlign: "center" }]}>
              {emptyDescription}
            </Text>
          ) : null}
        </View>
      }
      ListFooterComponent={
        ListFooterComponent ? <>{ListFooterComponent}</> : undefined
      }
      ListHeaderComponent={
        ListHeaderComponent ? <>{ListHeaderComponent}</> : undefined
      }
      ref={listRef}
      renderItem={({ item }: { item: ChatMessage }) => (
        <MessageBubble
          message={item}
          onA2UIAction={onA2UIAction}
          runtime={runtime}
          showIdentity={showIdentity}
          theme={themeOverride}
        />
      )}
      style={[{ flex: 1 }, style]}
    />
  );
}