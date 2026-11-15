import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type {
  ChatA2uiActionHandler,
  ChatA2uiSession,
  ChatMessage,
  ChatSubmitMode,
  ChatUserInputAnswer,
  ChatUserInputRequest,
} from "@personai/agent-ui-chat-core/headless";
import { ApprovalCard } from "./ApprovalCard";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import {
  resolveChatTheme,
  type ChatReactNativeTheme,
  type ChatStyle,
} from "./theme";

export interface ChatPanelProps {
  messages: ChatMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (mode?: ChatSubmitMode) => void;
  onStop?: () => void;
  sending?: boolean;
  disabledInput?: boolean;
  sendDisabled?: boolean;
  showComposer?: boolean;
  showHeader?: boolean;
  showIdentity?: boolean;
  title?: string;
  headerContent?: ReactNode;
  footerAddon?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  inputPlaceholder?: string;
  sendLabel?: string;
  stopLabel?: string;
  /** Pending native approvals/questions; answers go back through the RPC host. */
  userInputRequests?: ChatUserInputRequest[];
  onAnswerUserInput?: (answers: ChatUserInputAnswer[]) => void;
  approvalPending?: boolean;
  runtime?: ChatA2uiSession;
  onA2UIAction?: ChatA2uiActionHandler;
  theme?: Partial<ChatReactNativeTheme>;
  style?: ChatStyle;
  contentContainerStyle?: ChatStyle;
  testID?: string;
}

/**
 * Minimal native chat shell: header, virtualized transcript, pending approval
 * cards and composer. It owns no transport; the host feeds `ChatMessage`s from
 * the RPC client and persists A2UI envelopes through `ChatA2uiSession`.
 */
export function ChatPanel({
  messages,
  draft,
  onDraftChange,
  onSend,
  onStop,
  sending = false,
  disabledInput = false,
  sendDisabled = false,
  showComposer = true,
  showHeader = true,
  showIdentity = false,
  title = "Chat",
  headerContent,
  footerAddon,
  emptyTitle = "No messages yet",
  emptyDescription = "Send a message to start the conversation.",
  inputPlaceholder,
  sendLabel,
  stopLabel,
  userInputRequests = [],
  onAnswerUserInput,
  approvalPending = false,
  runtime,
  onA2UIAction,
  theme: themeOverride,
  style,
  contentContainerStyle,
  testID,
}: ChatPanelProps): ReactNode {
  const theme = resolveChatTheme(themeOverride);
  const pending = userInputRequests.filter((request) => request.status === "Pending");
  return (
    <View
      style={[{ backgroundColor: theme.panelColor, flex: 1 }, style]}
      testID={testID}
    >
      {showHeader ? (
        <View
          style={{
            alignItems: "center",
            borderBottomColor: theme.borderColor,
            borderBottomWidth: 1,
            flexDirection: "row",
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: theme.textColor, flex: 1, fontSize: 16, fontWeight: "600" }}>
            {title}
          </Text>
          {headerContent}
        </View>
      ) : null}
      <MessageList
        contentContainerStyle={contentContainerStyle}
        emptyDescription={emptyDescription}
        emptyTitle={emptyTitle}
        messages={messages}
        onA2UIAction={onA2UIAction}
        runtime={runtime}
        showIdentity={showIdentity}
        theme={themeOverride}
      />
      {pending.length > 0 && onAnswerUserInput ? (
        <View style={{ maxHeight: "45%", paddingHorizontal: 12 }}>
          {pending.map((request) => (
            <ApprovalCard
              key={request.requestId}
              onSubmit={onAnswerUserInput}
              pending={approvalPending}
              request={request}
              theme={themeOverride}
            />
          ))}
        </View>
      ) : null}
      {showComposer ? (
        <Composer
          disabled={disabledInput}
          onChangeText={onDraftChange}
          onSend={onSend}
          onStop={onStop}
          placeholder={inputPlaceholder}
          sendDisabled={sendDisabled}
          sendLabel={sendLabel}
          sending={sending}
          stopLabel={stopLabel}
          theme={themeOverride}
          value={draft}
        />
      ) : null}
      {footerAddon ? <View>{footerAddon}</View> : null}
    </View>
  );
}