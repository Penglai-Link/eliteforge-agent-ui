import { useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import {
  ARTIFACT_COLLAPSED_COUNT,
  parseArtifacts,
  resolveArtifactLabels,
  type ChatArtifactAction,
  type ChatArtifactItem,
  type ChatArtifactsProps,
} from "@personai/agent-ui-chat-core/headless";
import {
  chatMetaTextStyle,
  resolveChatTheme,
  type ChatReactNativeTheme,
  type ChatStyle,
} from "./theme";

export interface ArtifactListProps extends ChatArtifactsProps {
  theme?: Partial<ChatReactNativeTheme>;
  style?: ChatStyle;
  testID?: string;
}

/**
 * Delivered-file list for one native assistant message.
 *
 * The action row is inline (no hover, no overflow menu); the host resolves
 * which actions exist and reports pending/failed execution through `states`.
 * Preview never opens a URL on native: without `onPreview` it is not rendered.
 */
export function ArtifactList({
  artifacts,
  onAction,
  onPreview,
  labels: labelOverrides,
  locale,
  states,
  theme: themeOverride,
  style,
  testID,
}: ArtifactListProps): ReactNode {
  const theme = resolveChatTheme(themeOverride);
  const labels = useMemo(
    () => resolveArtifactLabels(locale, labelOverrides),
    [labelOverrides, locale],
  );
  const parsed = useMemo(() => parseArtifacts(artifacts), [artifacts]);
  const [isExpanded, setExpanded] = useState(false);
  const lastActions = useRef<Record<string, ChatArtifactAction>>({});

  if (!parsed || parsed.items.length === 0) return null;

  const visibleItems = isExpanded
    ? parsed.items
    : parsed.items.slice(0, ARTIFACT_COLLAPSED_COUNT);

  function actionsFor(item: ChatArtifactItem) {
    return (item.actions ?? []).filter((action) => (
      action === "preview" ? Boolean(onPreview) : Boolean(onAction)
    ));
  }

  function dispatch(item: ChatArtifactItem, action: ChatArtifactAction) {
    lastActions.current[item.id] = action;
    try {
      if (action === "preview") {
        onPreview?.(item);
        return;
      }
      void Promise.resolve(onAction?.(item, action)).catch(() => {
        // The host owns error reporting through `states`.
      });
    } catch {
      // A malformed host callback must not break the transcript.
    }
  }

  function retryActionFor(item: ChatArtifactItem) {
    const prior = lastActions.current[item.id];
    if (prior && (prior === "preview" ? onPreview : onAction)) return prior;
    return actionsFor(item)[0];
  }

  function itemHint(item: ChatArtifactItem) {
    return [
      item.mediaType ? labels.type(item.mediaType) : "",
      item.byteSize !== undefined ? labels.size(item.byteSize) : "",
    ].filter(Boolean).join(" · ");
  }

  return (
    <View
      style={[
        { alignSelf: "stretch", gap: 6, marginTop: 8, minWidth: 0 },
        style,
      ]}
      testID={testID}
    >
      <Text
        style={{
          color: theme.mutedTextColor,
          fontSize: 13,
          fontWeight: "600",
        }}
      >
        {labels.title}
      </Text>
      {visibleItems.map((item) => {
        const state = states?.[item.id];
        const pending = state === "pending";
        const failed = state === "failed";
        const actions = actionsFor(item);
        const hint = itemHint(item);
        const retryAction = failed ? retryActionFor(item) : undefined;
        return (
          <View
            key={item.id}
            style={{
              borderColor: failed ? theme.dangerColor : theme.borderColor,
              borderRadius: theme.borderRadius,
              borderWidth: 1,
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
            }}
            testID={testID ? `${testID}-item-${item.id}` : undefined}
          >
            <View style={{ flexGrow: 1, flexShrink: 1, gap: 2, minWidth: "60%" }}>
              <Text
                selectable
                style={{ color: theme.textColor, fontSize: 13, fontWeight: "500" }}
              >
                {item.display}
              </Text>
              {item.description ? (
                <Text selectable style={[chatMetaTextStyle(theme), { fontSize: 12 }]}>
                  {item.description}
                </Text>
              ) : null}
              {hint ? (
                <Text style={[chatMetaTextStyle(theme), { fontSize: 11 }]}>{hint}</Text>
              ) : null}
              {pending ? (
                <Text accessibilityLiveRegion="polite" style={chatMetaTextStyle(theme)}>
                  {labels.pending}
                </Text>
              ) : null}
              {failed ? (
                <Text
                  accessibilityLiveRegion="assertive"
                  style={{ color: theme.dangerColor, fontSize: 12 }}
                >
                  {labels.failed}
                </Text>
              ) : null}
            </View>
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 6,
              }}
            >
              {failed && retryAction ? (
                <Pressable
                  accessibilityLabel={labels.retry}
                  accessibilityRole="button"
                  onPress={() => dispatch(item, retryAction)}
                  style={({ pressed }) => ({
                    borderColor: theme.dangerColor,
                    borderRadius: theme.borderRadius,
                    borderWidth: 1,
                    minHeight: 28,
                    opacity: pressed ? 0.7 : 1,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                  })}
                >
                  <Text style={{ color: theme.dangerColor, fontSize: 12 }}>
                    {labels.retry}
                  </Text>
                </Pressable>
              ) : null}
              {actions.map((action, index) => (
                <Pressable
                  key={action}
                  accessibilityLabel={labels.action(action)}
                  accessibilityRole="button"
                  accessibilityState={{ busy: pending, disabled: pending }}
                  disabled={pending}
                  onPress={() => dispatch(item, action)}
                  style={({ pressed }) => ({
                    backgroundColor: index === 0 ? theme.primaryColor : theme.surfaceColor,
                    borderColor: index === 0 ? theme.primaryColor : theme.borderColor,
                    borderRadius: theme.borderRadius,
                    borderWidth: 1,
                    minHeight: 28,
                    opacity: pending ? 0.55 : pressed ? 0.7 : 1,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                  })}
                >
                  <Text
                    style={{
                      color: index === 0 ? theme.primaryTextColor : theme.textColor,
                      fontSize: 12,
                    }}
                  >
                    {labels.action(action)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
      {parsed.items.length > ARTIFACT_COLLAPSED_COUNT ? (
        <Pressable
          accessibilityLabel={isExpanded ? labels.less : labels.more(parsed.items.length)}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          onPress={() => setExpanded((current) => !current)}
          style={{ alignSelf: "flex-start", minHeight: 28, justifyContent: "center" }}
        >
          <Text style={{ color: theme.mutedTextColor, fontSize: 12 }}>
            {isExpanded ? labels.less : labels.more(parsed.items.length)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}