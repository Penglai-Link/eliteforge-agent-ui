import { useEffect, useMemo, type ReactNode } from "react";
import { View } from "react-native";
import {
  createInteractionClient,
  type ChatUserInputAnswer,
  type ChatUserInputLabels,
  type ChatUserInputRequest,
} from "@personai/agent-ui-chat-core/headless";
import { A2UISurface, type ActionMessage } from "@personai/agent-ui-a2ui-react-native";
import {
  resolveChatTheme,
  type ChatReactNativeTheme,
  type ChatStyle,
} from "./theme";

export interface ApprovalCardProps {
  request: ChatUserInputRequest;
  onSubmit: (answers: ChatUserInputAnswer[]) => void;
  disabled?: boolean;
  pending?: boolean;
  labels?: Partial<ChatUserInputLabels>;
  theme?: Partial<ChatReactNativeTheme>;
  style?: ChatStyle;
}

/**
 * Native approval/question card.
 *
 * It reuses `chat-core`'s `createInteractionClient` envelopes and the A2UI
 * interaction components (`ApprovalCard`/`QuestionCard`) rendered by
 * `a2ui-react-native`, so the response contract and tool details stay shared
 * with the web client instead of being re-implemented per platform.
 */
export function ApprovalCard({
  request,
  onSubmit,
  disabled = false,
  pending = false,
  labels,
  theme: themeOverride,
  style,
}: ApprovalCardProps): ReactNode {
  const theme = resolveChatTheme(themeOverride);
  const presentationKey = JSON.stringify([
    request.a2uiInteraction ?? null,
    request.intro,
    request.nativeInteraction?.details,
    request.nativeInteraction?.responseSchema,
    request.answers,
    request.status,
    labels ?? null,
  ]);
  const client = useMemo(
    () => createInteractionClient(request, labels as ChatUserInputLabels | undefined),
    // Rebuild only when the durable interaction presentation changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [request.requestId, presentationKey],
  );
  const surfaceId =
    request.a2uiInteraction?.surfaceId ?? `interaction:${request.requestId}`;
  const submitted = request.status !== "Pending";
  const expired =
    typeof request.expiresAtMs === "number" && request.expiresAtMs <= Date.now();
  const locked = disabled || pending || submitted || expired;

  useEffect(() => {
    try {
      client.apply({
        version: "v0.9.1",
        updateDataModel: {
          path: "/status",
          surfaceId,
          value: locked ? "Submitting" : request.status,
        },
      });
    } catch {
      // A missing surface simply leaves the rendered status unchanged.
    }
  }, [client, locked, request.status, surfaceId]);

  function handleAction(message: ActionMessage): void {
    if (locked) return;
    if (request.a2uiInteraction) {
      onSubmit([
        {
          answerKind: "Other",
          optionId: null,
          otherText: JSON.stringify(message.action.context.response),
          questionId: request.requestId,
        },
      ]);
      return;
    }
    const value = message.action.context.answer;
    if (typeof value === "boolean") {
      const option = Object.entries(
        request.nativeInteraction?.optionPayloads ?? {},
      ).find(([, payload]) => payload === value);
      if (option) {
        onSubmit([
          {
            answerKind: "Option",
            optionId: option[0],
            otherText: null,
            questionId: request.requestId,
          },
        ]);
      }
      return;
    }
    onSubmit(Object.values(value ?? {}) as ChatUserInputAnswer[]);
  }

  return (
    <View
      style={[
        {
          marginVertical: 6,
          ...(locked ? { opacity: 0.7 } : null),
        },
        style,
      ]}
    >
      <A2UISurface
        client={client}
        onAction={handleAction}
        surfaceId={surfaceId}
        theme={theme}
      />
    </View>
  );
}