import {
  cloneElement,
  createElement,
  Fragment,
  isValidElement,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  renderSurface,
  type A2UIClient,
  type ActionHandler,
  type RenderContext,
} from "@personai/agent-ui-a2ui-core";

export type A2UIStyle = Record<string, unknown>;

/**
 * Optional per-component override. Return `undefined` to fall through to the
 * built-in catalog mapping. The `A2UIClient`/`Surface`/`Action` contract stays
 * owned by `@personai/agent-ui-a2ui-core`.
 */
export type A2UIComponentRenderer = (context: RenderContext) => ReactNode;
export type A2UIComponentRegistry = Record<string, A2UIComponentRenderer>;

/** Host-tunable tokens. CSS variables from the web renderer map to these. */
export interface A2UIReactNativeTheme {
  textColor: string;
  mutedTextColor: string;
  surfaceColor: string;
  borderColor: string;
  primaryColor: string;
  primaryTextColor: string;
  dangerColor: string;
  borderRadius: number;
  spacing: number;
}

export const defaultA2UIReactNativeTheme: A2UIReactNativeTheme = {
  textColor: "#1f2328",
  mutedTextColor: "#59636e",
  surfaceColor: "#ffffff",
  borderColor: "#d1d9e0",
  primaryColor: "#0969da",
  primaryTextColor: "#ffffff",
  dangerColor: "#cf222e",
  borderRadius: 8,
  spacing: 12,
};

export interface A2UISurfaceProps {
  client: A2UIClient;
  surfaceId: string;
  onAction?: ActionHandler;
  components?: A2UIComponentRegistry;
  /** Wrap the surface root in a vertical `ScrollView` (off by default). */
  scrollable?: boolean;
  style?: A2UIStyle;
  contentContainerStyle?: A2UIStyle;
  theme?: Partial<A2UIReactNativeTheme>;
  testID?: string;
}

export interface A2UIRendererProps {
  client: A2UIClient;
  /** Defaults to every surface currently present in the client snapshot. */
  surfaceIds?: string[];
  onAction?: ActionHandler;
  components?: A2UIComponentRegistry;
  scrollable?: boolean;
  emptyLabel?: string;
  style?: A2UIStyle;
  contentContainerStyle?: A2UIStyle;
  theme?: Partial<A2UIReactNativeTheme>;
  testID?: string;
}

interface ElementOptions {
  theme: A2UIReactNativeTheme;
  scrollable: boolean;
  style?: A2UIStyle;
  contentContainerStyle?: A2UIStyle;
  testID?: string;
}

const TEXT_TAGS = new Set([
  "abbr", "b", "caption", "cite", "code", "dd", "dt", "em", "h1", "h2",
  "h3", "h4", "h5", "kbd", "mark", "output", "p", "pre", "q", "s", "small",
  "span", "strong", "sub", "summary", "sup", "td", "th", "time", "u",
]);
const CONTAINER_TAGS = new Set([
  "article", "aside", "dialog", "div", "dl", "fieldset", "figcaption",
  "figure", "footer", "form", "header", "label", "li", "main", "nav",
  "ol", "section", "table", "tbody", "tfoot", "thead", "tr", "ul",
]);
const SVG_IGNORED_TAGS = new Set(["circle", "g", "line", "path", "polygon", "polyline", "rect", "title"]);
const VARIANT_FONT_SIZE: Record<string, number> = {
  h1: 24, h2: 21, h3: 18, h4: 16, h5: 15,
};

/** Small layout constants shared by the question-card parts. */
const QUESTION = {
  gap: 8,
  optionGap: 2,
  optionPaddingX: 9,
  optionPaddingY: 8,
  navSize: 24,
  titleSize: 13,
  titleLineHeight: 19,
  optionTitleSize: 14,
  optionTitleLineHeight: 20,
  descriptionSize: 12,
  descriptionLineHeight: 17,
} as const;

const warnedTags = new Set<string>();
let warnedUnsupportedComponent = false;

/**
 * Stand-in for the hidden native radio inside a `QuestionCard` option. Keeping
 * the change handler on an element lets the option row own the press target
 * without nesting a second `Pressable` inside it.
 */
function QuestionRadioHandle(_props: {
  disabled: boolean;
  onSelect: () => void;
}): null {
  return null;
}

/** `color-mix()` does not exist in React Native; tint hex/rgb colors instead. */
function tint(color: string, alpha: number): string {
  const value = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value);
  const channels = hex
    ? (() => {
        const raw = hex[1].length === 3
          ? hex[1].split("").map((part) => `${part}${part}`).join("")
          : hex[1];
        return [
          Number.parseInt(raw.slice(0, 2), 16),
          Number.parseInt(raw.slice(2, 4), 16),
          Number.parseInt(raw.slice(4, 6), 16),
        ];
      })()
    : rgb
      ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
      : null;
  if (!channels) return color;
  const [red, green, blue] = channels;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function mergeTheme(theme?: Partial<A2UIReactNativeTheme>): A2UIReactNativeTheme {
  return theme ? { ...defaultA2UIReactNativeTheme, ...theme } : defaultA2UIReactNativeTheme;
}

function classNameOf(props: Record<string, any>): string {
  const value = props.class ?? props.className;
  return typeof value === "string" ? value : "";
}

function hasClass(props: Record<string, any>, name: string): boolean {
  return classNameOf(props).split(/\s+/).includes(name);
}

/** Only RN-supported layout keys survive; CSS variables and DOM-only keys drop. */
function normalizeStyle(style: unknown): A2UIStyle | undefined {
  if (!style || typeof style !== "object" || Array.isArray(style)) return undefined;
  const source = style as Record<string, unknown>;
  const keys = [
    "alignItems", "alignSelf", "aspectRatio", "columnGap", "flex",
    "flexDirection", "flexWrap", "gap", "height", "justifyContent",
    "margin", "marginBottom", "marginHorizontal", "marginLeft",
    "marginRight", "marginTop", "marginVertical", "maxHeight", "maxWidth",
    "minHeight", "minWidth", "padding", "paddingBottom", "paddingHorizontal",
    "paddingLeft", "paddingRight", "paddingTop", "paddingVertical", "rowGap",
    "width",
  ];
  const result: A2UIStyle = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return Object.keys(result).length ? result : undefined;
}

function baseTextStyle(theme: A2UIReactNativeTheme): A2UIStyle {
  return {
    color: theme.textColor,
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 22,
    minWidth: 0,
  };
}

function inputStyle(theme: A2UIReactNativeTheme): A2UIStyle {
  return {
    borderColor: theme.borderColor,
    borderRadius: theme.borderRadius,
    borderWidth: 1,
    color: theme.textColor,
    fontSize: 15,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 8,
  };
}

/** Arrays passed to a host component need keys on every element child. */
function keyedChildren(children: readonly ReactNode[]): ReactNode[] {
  return children.map((child, index) => {
    if (!isValidElement(child)) return child;
    return cloneElement(child, { key: child.key ?? `child:${index}` });
  });
}

/** Raw strings are only legal inside `<Text>`; containers wrap them first. */
function containerChildren(children: readonly ReactNode[], theme: A2UIReactNativeTheme): ReactNode[] {
  const result: ReactNode[] = [];
  children.forEach((child, index) => {
    if (child == null || typeof child === "boolean") return;
    if (typeof child === "string" || typeof child === "number") {
      result.push(
        <Text key={`text:${index}`} style={baseTextStyle(theme)}>
          {String(child)}
        </Text>,
      );
      return;
    }
    result.push(child);
  });
  return keyedChildren(result);
}

/** Convert block elements nested in a `<Text>` into inline text so RN never
 * receives a host `View` inside `Text` (which throws at runtime). */
function inlineChildren(children: ReactNode, prefix = "inline"): ReactNode {
  if (children == null || typeof children === "boolean") return null;
  if (typeof children === "string" || typeof children === "number") return children;
  if (Array.isArray(children)) {
    return keyedChildren(children.map((child, index) => inlineChild(child, `${prefix}.${index}`)));
  }
  return inlineChild(children, prefix);
}

function inlineChild(node: ReactNode, key: string): ReactNode {
  if (node == null || typeof node === "boolean") return null;
  if (typeof node === "string" || typeof node === "number") return node;
  if (Array.isArray(node)) return inlineChildren(node, key);
  if (!isValidElement(node)) return node;
  const props = node.props as Record<string, any>;
  if (node.type === Text) {
    return createElement(Text, { key: node.key ?? key, style: props.style }, inlineChildren(props.children, `${key}.t`));
  }
  if (node.type === TextInput) {
    const value = props.value ?? props.placeholder;
    return typeof value === "string" ? value : "";
  }
  return createElement(Fragment, { key: node.key ?? key }, inlineChildren(props.children, `${key}.f`));
}

function renderInput(
  props: Record<string, any>,
  children: readonly ReactNode[],
  theme: A2UIReactNativeTheme,
  style: A2UIStyle | undefined,
): ReactNode {
  const type = typeof props.type === "string" ? props.type : "text";
  const disabled = Boolean(props.disabled) || Boolean(props.readOnly);
  if (type === "checkbox" || type === "radio") {
    const checked = Boolean(props.checked);
    const isRadio = type === "radio";
    const labelContent = inlineChildren(children);
    return (
      <Pressable
        accessibilityRole={isRadio ? "radio" : "checkbox"}
        accessibilityState={{ checked, disabled }}
        disabled={disabled}
        onPress={() => props.onChange?.({ target: { checked: !checked } })}
        style={[{ alignItems: "center", flexDirection: "row", gap: 8 }, style]}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: checked ? theme.primaryColor : "transparent",
            borderColor: checked ? theme.primaryColor : theme.borderColor,
            borderRadius: isRadio ? 10 : 5,
            borderWidth: 1.5,
            height: 20,
            justifyContent: "center",
            opacity: disabled ? 0.5 : 1,
            width: 20,
          }}
        >
          {checked ? <Text style={{ color: theme.primaryTextColor, fontSize: 12 }}>✓</Text> : null}
        </View>
        {labelContent ? (
          <Text style={[baseTextStyle(theme), disabled ? { opacity: 0.6 } : null]}>
            {labelContent}
          </Text>
        ) : null}
      </Pressable>
    );
  }
  if (type === "range") {
    return (
      <Text style={[baseTextStyle(theme), { color: theme.mutedTextColor }, style]}>
        {String(props.value ?? "")}
      </Text>
    );
  }
  const keyboardType = type === "number" ? "numeric" : "default";
  return (
    <TextInput
      accessibilityLabel={typeof props["aria-label"] === "string" ? props["aria-label"] : undefined}
      editable={!disabled}
      keyboardType={keyboardType}
      onChangeText={(text: string) => {
        props.onInput?.({ target: { value: text } });
        props.onChange?.({ target: { value: text } });
      }}
      placeholder={typeof props.placeholder === "string" ? props.placeholder : undefined}
      placeholderTextColor={theme.mutedTextColor}
      secureTextEntry={type === "password"}
      style={[inputStyle(theme), style]}
      value={props.value == null ? "" : String(props.value)}
    />
  );
}

function renderTextArea(
  props: Record<string, any>,
  theme: A2UIReactNativeTheme,
  style: A2UIStyle | undefined,
): ReactNode {
  const questionAnswer = hasClass(props, "a2ui-question-answer");
  return (
    <TextInput
      accessibilityLabel={typeof props["aria-label"] === "string" ? props["aria-label"] : undefined}
      editable={!props.disabled && !props.readOnly}
      multiline
      onChangeText={(text: string) => {
        props.onInput?.({ target: { value: text } });
        props.onChange?.({ target: { value: text } });
      }}
      placeholder={typeof props.placeholder === "string" ? props.placeholder : undefined}
      placeholderTextColor={theme.mutedTextColor}
      style={[
        questionAnswer
          ? {
              backgroundColor: theme.surfaceColor,
              borderColor: theme.borderColor,
              borderRadius: Math.max(8, theme.borderRadius - 4),
              borderWidth: 1,
              color: theme.textColor,
              flex: 1,
              fontSize: 13,
              lineHeight: 18,
              maxHeight: 96,
              minHeight: 38,
              minWidth: 0,
              paddingHorizontal: 10,
              paddingVertical: 8,
              textAlignVertical: "top",
            }
          : [inputStyle(theme), { minHeight: 96, textAlignVertical: "top" }],
        style,
      ]}
      value={props.value == null ? "" : String(props.value)}
    />
  );
}

function renderButton(
  props: Record<string, any>,
  children: readonly ReactNode[],
  theme: A2UIReactNativeTheme,
  style: A2UIStyle | undefined,
): ReactNode {
  const disabled = Boolean(props.disabled);
  const accessibilityLabel = typeof props["aria-label"] === "string" ? props["aria-label"] : undefined;
  if (hasClass(props, "a2ui-question-nav-button")) {
    const back = props["data-nav"] === "back";
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={8}
        onPress={() => {
          if (!disabled) props.onClick?.({ currentTarget: undefined });
        }}
        style={[
          {
            alignItems: "center",
            backgroundColor: "transparent",
            borderRadius: Math.max(6, theme.borderRadius - 6),
            height: QUESTION.navSize,
            justifyContent: "center",
            opacity: disabled ? 0.35 : 1,
            padding: 0,
            width: QUESTION.navSize,
          },
          style,
        ]}
      >
        <Text
          style={{
            color: theme.mutedTextColor,
            fontSize: 20,
            fontWeight: "500",
            lineHeight: 22,
            textAlign: "center",
          }}
        >
          {back ? "‹" : "›"}
        </Text>
      </Pressable>
    );
  }
  const variant = props["data-variant"];
  const danger = hasClass(props, "approval-reject") || hasClass(props, "question-reject");
  const confirm = hasClass(props, "a2ui-question-confirm");
  const skip = hasClass(props, "a2ui-question-skip");
  const compact = confirm || skip;
  const primary = !danger && !confirm && (variant === "primary"
    || hasClass(props, "approval-approve"));
  const background = confirm
    ? theme.textColor
    : danger
      ? theme.dangerColor
      : primary
        ? theme.primaryColor
        : compact
          ? "transparent"
          : theme.surfaceColor;
  const color = confirm
    ? theme.surfaceColor
    : danger || primary
      ? theme.primaryTextColor
      : theme.textColor;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        if (!disabled) props.onClick?.({ currentTarget: undefined });
      }}
      style={[
        {
          alignItems: "center",
          backgroundColor: background,
          borderColor: confirm || danger || primary ? background : theme.borderColor,
          borderRadius: compact ? 8 : theme.borderRadius,
          borderWidth: 1,
          justifyContent: "center",
          opacity: disabled ? 0.5 : 1,
          paddingHorizontal: compact ? 11 : 14,
          paddingVertical: compact ? 5 : 9,
        },
        style,
      ]}
    >
      <Text style={{ color, fontSize: compact ? 12 : 14, fontWeight: "600", lineHeight: compact ? 17 : 20 }}>
        {inlineChildren(children)}
      </Text>
    </Pressable>
  );
}

function renderLink(
  props: Record<string, any>,
  children: readonly ReactNode[],
  theme: A2UIReactNativeTheme,
): ReactNode {
  const href = typeof props.href === "string" ? props.href : undefined;
  return (
    <Text
      onPress={() => {
        if (href && /^(https?:|mailto:|tel:)/i.test(href)) void Linking.openURL(href).catch(() => undefined);
      }}
      style={[baseTextStyle(theme), { color: theme.primaryColor, textDecorationLine: "underline" }]}
    >
      {inlineChildren(children)}
    </Text>
  );
}

function renderImage(
  props: Record<string, any>,
  theme: A2UIReactNativeTheme,
  style: A2UIStyle | undefined,
): ReactNode {
  const src = typeof props.src === "string" ? props.src : undefined;
  if (!src) {
    return (
      <View style={[{ alignItems: "center", padding: theme.spacing }, style]}>
        <Text style={[baseTextStyle(theme), { color: theme.mutedTextColor }]}>[image]</Text>
      </View>
    );
  }
  const objectFit = (props.style as Record<string, unknown> | undefined)?.objectFit;
  const resizeMode = objectFit === "contain" || objectFit === "scale-down"
    ? "contain"
    : objectFit === "cover"
      ? "cover"
      : "stretch";
  return (
    <Image
      accessibilityLabel={typeof props.alt === "string" ? props.alt : undefined}
      resizeMode={resizeMode}
      source={{ uri: src }}
      style={[{ borderRadius: theme.borderRadius, height: 180, width: "100%" }, style]}
    />
  );
}

function renderProgress(
  props: Record<string, any>,
  theme: A2UIReactNativeTheme,
  style: A2UIStyle | undefined,
): ReactNode {
  const max = Number(props.max ?? 1) || 1;
  const value = Number(props.value ?? 0);
  const ratio = Math.max(0, Math.min(1, value / max));
  return (
    <View style={[{ gap: 6 }, style]}>
      <View style={{ backgroundColor: theme.borderColor, borderRadius: 4, height: 8, overflow: "hidden" }}>
        <View
          style={{
            backgroundColor: theme.primaryColor,
            height: "100%",
            width: `${Math.round(ratio * 100)}%`,
          }}
        />
      </View>
    </View>
  );
}

function renderText(
  tag: string,
  props: Record<string, any>,
  children: readonly ReactNode[],
  theme: A2UIReactNativeTheme,
  style: A2UIStyle | undefined,
): ReactNode {
  const unsupported = props["data-a2ui-unsupported"];
  if (typeof unsupported === "string" && unsupported) {
    if (!warnedUnsupportedComponent && typeof console !== "undefined") {
      warnedUnsupportedComponent = true;
      console.warn(`[a2ui-react-native] Unsupported A2UI component "${unsupported}" rendered as fallback.`);
    }
    return (
      <Text style={[baseTextStyle(theme), { color: theme.mutedTextColor, fontStyle: "italic" }, style]}>
        {`Unsupported component: ${unsupported}`}
      </Text>
    );
  }
  const missing = props["data-a2ui-missing"];
  if (typeof missing === "string" && missing) {
    return (
      <Text style={[baseTextStyle(theme), { color: theme.mutedTextColor }, style]}>
        {`Missing component: ${missing}`}
      </Text>
    );
  }
  if (hasClass(props, "a2ui-question-arrow")) {
    return (
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          baseTextStyle(theme),
          { alignSelf: "center", color: theme.primaryColor, fontSize: 14, fontWeight: "700", lineHeight: 20 },
          style,
        ]}
      >
        {"✓"}
      </Text>
    );
  }
  const variant = typeof props["data-variant"] === "string" ? props["data-variant"] : undefined;
  const fontSize = variant ? VARIANT_FONT_SIZE[variant] : undefined;
  const inline = inlineChildren(children);
  const partStyle: A2UIStyle = {};
  if (tag === "strong" || tag === "b") partStyle.fontWeight = "600";
  if (tag === "em" || tag === "i") partStyle.fontStyle = "italic";
  if (tag === "u") partStyle.textDecorationLine = "underline";
  if (tag === "code" || tag === "kbd" || tag === "pre") {
    partStyle.fontFamily = "monospace";
  }
  if (tag === "small") {
    partStyle.color = theme.mutedTextColor;
    partStyle.fontSize = QUESTION.descriptionSize;
    partStyle.lineHeight = QUESTION.descriptionLineHeight;
  }
  if (hasClass(props, "a2ui-question-progress")) {
    partStyle.color = theme.mutedTextColor;
    partStyle.fontSize = 11;
    partStyle.lineHeight = 15;
  }
  if (hasClass(props, "a2ui-question-title")) {
    partStyle.color = theme.textColor;
    partStyle.flexShrink = 1;
    partStyle.fontSize = QUESTION.titleSize;
    partStyle.fontWeight = "600";
    partStyle.lineHeight = QUESTION.titleLineHeight;
    partStyle.minWidth = 0;
  }
  if (hasClass(props, "a2ui-question-option-title")) {
    partStyle.fontSize = QUESTION.optionTitleSize;
    partStyle.fontWeight = "500";
    partStyle.lineHeight = QUESTION.optionTitleLineHeight;
  }
  if (hasClass(props, "a2ui-question-description")) {
    partStyle.color = theme.mutedTextColor;
    partStyle.fontSize = QUESTION.descriptionSize;
    partStyle.lineHeight = QUESTION.descriptionLineHeight;
  }
  if (hasClass(props, "a2ui-interaction-status")) {
    partStyle.color = theme.mutedTextColor;
    partStyle.fontSize = QUESTION.descriptionSize;
    partStyle.lineHeight = QUESTION.descriptionLineHeight;
  }
  return (
    <Text
      accessibilityLabel={typeof props["aria-label"] === "string" ? props["aria-label"] : undefined}
      selectable={false}
      style={[
        baseTextStyle(theme),
        fontSize ? { fontSize, fontWeight: "600", lineHeight: fontSize + 6 } : null,
        partStyle,
        style,
      ]}
    >
      {inline}
    </Text>
  );
}

function findRadioHandle(
  children: readonly ReactNode[],
): { props: { disabled?: boolean; onSelect?: () => void } } | null {
  for (const child of children) {
    if (!isValidElement(child)) continue;
    if (child.type === QuestionRadioHandle) {
      return child as { props: { disabled?: boolean; onSelect?: () => void } };
    }
    const nested = (child.props as Record<string, any>)?.children;
    if (nested == null) continue;
    const found = findRadioHandle(Array.isArray(nested) ? nested : [nested]);
    if (found) return found;
  }
  return null;
}

/**
 * A question option is one press target. The DOM nests a visually hidden radio
 * inside the label; React Native has neither label activation nor radio groups,
 * so mirror the whole-row target and expose the radio semantics on it.
 */
function renderQuestionOption(
  props: Record<string, any>,
  children: readonly ReactNode[],
  theme: A2UIReactNativeTheme,
  style: A2UIStyle | undefined,
): ReactNode {
  const selected = props["data-selected"] === true || props["data-selected"] === "true";
  const handle = findRadioHandle(children);
  const disabled = Boolean(handle?.props.disabled);
  const content = containerChildren(children, theme);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={() => {
        if (!disabled) handle?.props.onSelect?.();
      }}
      style={({ pressed }) => [
        {
          alignItems: "flex-start",
          backgroundColor: selected ? tint(theme.textColor, 0.06) : "transparent",
          borderColor: selected ? tint(theme.textColor, 0.18) : "transparent",
          borderRadius: Math.max(8, theme.borderRadius - 4),
          borderWidth: 1,
          flexDirection: "row",
          gap: QUESTION.gap,
          minWidth: 0,
          paddingHorizontal: QUESTION.optionPaddingX,
          paddingVertical: QUESTION.optionPaddingY,
        },
        pressed && !selected && !disabled ? { backgroundColor: tint(theme.textColor, 0.04) } : null,
        disabled ? { opacity: 0.5 } : null,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

function renderContainer(
  tag: string,
  props: Record<string, any>,
  children: readonly ReactNode[],
  theme: A2UIReactNativeTheme,
  style: A2UIStyle | undefined,
): ReactNode {
  if (tag === "label" && hasClass(props, "a2ui-question-option")) {
    return renderQuestionOption(props, children, theme, style);
  }
  const content = containerChildren(children, theme);
  const base: A2UIStyle = {
    flexDirection: hasClass(props, "a2ui-row") || tag === "tr" ? "row" : "column",
    minWidth: 0,
  };
  if (hasClass(props, "a2ui-row")) base.gap = theme.spacing / 2;
  if (hasClass(props, "a2ui-column")) base.gap = theme.spacing / 2;
  if (hasClass(props, "a2ui-list")) {
    base.gap = theme.spacing / 2;
    if (props["data-direction"] === "horizontal") base.flexDirection = "row";
  }
  if (hasClass(props, "a2ui-card") || hasClass(props, "a2ui-approvalcard")) {
    base.backgroundColor = theme.surfaceColor;
    base.borderColor = theme.borderColor;
    base.borderRadius = theme.borderRadius;
    base.borderWidth = 1;
    base.gap = theme.spacing;
    base.padding = theme.spacing;
  }
  if (hasClass(props, "a2ui-approval-header")) {
    base.flexDirection = "row";
    base.gap = theme.spacing / 2;
  }
  if (hasClass(props, "a2ui-questioncard")) {
    base.backgroundColor = theme.surfaceColor;
    base.borderColor = theme.borderColor;
    base.borderRadius = theme.borderRadius;
    base.borderWidth = 1;
    base.gap = QUESTION.gap;
    base.padding = theme.spacing;
    base.width = "100%";
  }
  if (hasClass(props, "a2ui-question-header")) {
    base.alignItems = "flex-start";
    base.flexDirection = "row";
    base.flexWrap = "wrap";
    base.gap = QUESTION.gap;
    base.justifyContent = "space-between";
    base.marginBottom = QUESTION.gap;
    base.padding = 0;
    base.width = "100%";
  }
  if (hasClass(props, "a2ui-question-navigation")) {
    base.alignItems = "center";
    base.flexDirection = "row";
    base.flexShrink = 0;
    base.gap = 2;
    base.marginLeft = "auto";
  }
  if (hasClass(props, "a2ui-question-options")) {
    base.gap = QUESTION.optionGap;
    base.padding = 0;
    base.width = "100%";
  }
  if (hasClass(props, "a2ui-question-content")) {
    base.flex = 1;
    base.gap = 2;
    base.minWidth = 0;
  }
  if (hasClass(props, "a2ui-question-actions")) {
    base.alignItems = "center";
    base.borderTopColor = theme.borderColor;
    base.borderTopWidth = 1;
    base.flexDirection = "row";
    base.flexWrap = "wrap";
    base.gap = QUESTION.gap;
    base.paddingTop = QUESTION.gap;
    base.width = "100%";
  }
  if (hasClass(props, "a2ui-question-other")) {
    base.alignItems = "center";
    base.flex = 1;
    base.flexDirection = "row";
    base.gap = QUESTION.gap;
    base.minWidth = 0;
  }
  return <View style={[base, style]}>{content}</View>;
}

function makeElement(
  tag: string,
  props: Record<string, any>,
  children: readonly ReactNode[],
  options: ElementOptions,
): ReactNode {
  const theme = options.theme;
  const style = normalizeStyle(props.style);
  const isSurfaceRoot = hasClass(props, "a2ui-surface");

  if (isSurfaceRoot) {
    const content = containerChildren(children, theme);
    if (options.scrollable) {
      return (
        <ScrollView
          contentContainerStyle={[{ gap: theme.spacing, padding: theme.spacing }, options.contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          style={options.style}
          testID={options.testID}
        >
          {content}
        </ScrollView>
      );
    }
    return (
      <View
        style={[{ alignSelf: "stretch", gap: theme.spacing, minWidth: 0 }, options.style]}
        testID={options.testID}
      >
        {content}
      </View>
    );
  }

  if (tag === "input" && hasClass(props, "a2ui-question-radio")) {
    return (
      <QuestionRadioHandle
        disabled={Boolean(props.disabled) || Boolean(props.readOnly)}
        onSelect={() => props.onChange?.({ target: { checked: true } })}
      />
    );
  }
  if (tag === "input") return renderInput(props, children, theme, style);
  if (tag === "textarea") return renderTextArea(props, theme, style);
  if (tag === "button") return renderButton(props, children, theme, style);
  if (tag === "a") return renderLink(props, children, theme);
  if (tag === "img") return renderImage(props, theme, style);
  if (tag === "video" || tag === "audio") {
    return (
      <View style={[{ alignItems: "center", padding: theme.spacing }, style]}>
        <Text style={[baseTextStyle(theme), { color: theme.mutedTextColor }]}>{`[${tag}]`}</Text>
      </View>
    );
  }
  if (tag === "progress") return renderProgress(props, theme, style);
  if (tag === "svg") {
    if (hasClass(props, "a2ui-interaction-icon")) return null;
    return <Text style={{ color: theme.mutedTextColor, fontSize: 14 }}>•</Text>;
  }
  if (SVG_IGNORED_TAGS.has(tag)) return null;
  if (tag === "legend" && hasClass(props, "a2ui-question-header")) {
    return renderContainer(tag, props, children, theme, style);
  }
  if (TEXT_TAGS.has(tag)) {
    // These spans/legends hold layout and buttons in the shared composition;
    // flattening them into a single <Text> would drop the press targets.
    if (
      hasClass(props, "a2ui-question-header")
      || hasClass(props, "a2ui-question-navigation")
      || hasClass(props, "a2ui-question-content")
    ) {
      return renderContainer(tag, props, children, theme, style);
    }
    return renderText(tag, props, children, theme, style);
  }
  if (CONTAINER_TAGS.has(tag)) return renderContainer(tag, props, children, theme, style);

  if (!warnedTags.has(tag) && typeof console !== "undefined") {
    warnedTags.add(tag);
    console.warn(`[a2ui-react-native] Unknown element <${tag}>, rendered as View.`);
  }
  return renderContainer(tag, props, children, theme, style);
}

function createFactory(options: ElementOptions) {
  return (tag: string, props: Record<string, any>, children: any[]): ReactNode =>
    makeElement(tag, props, children, options);
}

function useA2UIClient(client: A2UIClient) {
  return useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
}

/**
 * Render one A2UI surface with React Native primitives.
 *
 * Rendering and interaction logic come from `a2ui-core`'s framework-neutral
 * `renderSurface`; this adapter only owns element creation and styling, so
 * catalog semantics, data binding, validation and action envelopes behave the
 * same as the web React/Vue renderers.
 */
export function A2UISurface({
  client,
  surfaceId,
  onAction,
  components,
  scrollable = false,
  style,
  contentContainerStyle,
  theme,
  testID,
}: A2UISurfaceProps): ReactNode {
  useA2UIClient(client);
  return renderSurface(
    client,
    surfaceId,
    createFactory({
      contentContainerStyle,
      scrollable,
      style,
      testID,
      theme: mergeTheme(theme),
    }),
    components,
    onAction,
  ) as ReactNode;
}

/** Render every current surface of a client; used by chat message bubbles. */
export function A2UIRenderer({
  client,
  surfaceIds,
  onAction,
  components,
  scrollable = false,
  emptyLabel,
  style,
  contentContainerStyle,
  theme,
  testID,
}: A2UIRendererProps): ReactNode {
  const snapshot = useA2UIClient(client);
  const mergedTheme = mergeTheme(theme);
  const ids = surfaceIds ?? Object.keys(snapshot.surfaces);
  if (!ids.length) {
    return emptyLabel ? (
      <Text style={[baseTextStyle(mergedTheme), { color: mergedTheme.mutedTextColor }]}>{emptyLabel}</Text>
    ) : null;
  }
  const surfaces = ids.map((id) => (
    <A2UISurface
      client={client}
      components={components}
      key={id}
      onAction={onAction}
      scrollable={false}
      surfaceId={id}
      theme={theme}
    />
  ));
  if (scrollable) {
    return (
      <ScrollView
        contentContainerStyle={[{ gap: mergedTheme.spacing }, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        style={style}
        testID={testID}
      >
        {surfaces}
      </ScrollView>
    );
  }
  return (
    <View style={[{ gap: mergedTheme.spacing }, style]} testID={testID}>
      {surfaces}
    </View>
  );
}

export { A2UIClient } from "@personai/agent-ui-a2ui-core";
export type { ActionHandler, RenderContext } from "@personai/agent-ui-a2ui-core";
export type { ActionMessage, ActionMetadata, Surface } from "@personai/agent-ui-a2ui-core";