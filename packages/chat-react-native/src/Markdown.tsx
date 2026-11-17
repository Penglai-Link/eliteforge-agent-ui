import { useMemo, type ReactNode } from "react";
import {
  Linking,
  Platform,
  Text,
  View,
  type TextStyle,
} from "react-native";
import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";

import {
  chatTextStyle,
  resolveChatTheme,
  type ChatReactNativeTheme,
  type ChatStyle,
} from "./theme";

const parser = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

const monoFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "break" }
  | {
      kind: "strong" | "em" | "strike" | "link";
      href?: string;
      children: InlineNode[];
    };

type BlockNode =
  | { kind: "heading"; level: number; inlines: InlineNode[] }
  | { kind: "paragraph"; inlines: InlineNode[] }
  | { kind: "list"; ordered: boolean; items: BlockNode[][] }
  | { kind: "code"; text: string; language: string | null }
  | { kind: "quote"; blocks: BlockNode[] }
  | { kind: "hr" }
  | { kind: "table"; header: InlineNode[][]; rows: InlineNode[][][] };

function inlineChildren(token: Token): InlineNode[] {
  const root: InlineNode[] = [];
  const stack: Array<{
    children: InlineNode[];
    kind?: "strong" | "em" | "strike" | "link";
    href?: string;
  }> = [{ children: root }];
  const push = (node: InlineNode) => stack[stack.length - 1].children.push(node);

  for (const child of token.children ?? []) {
    switch (child.type) {
      case "text":
        push({ kind: "text", text: child.content });
        break;
      case "code_inline":
        push({ kind: "code", text: child.content });
        break;
      case "softbreak":
      case "hardbreak":
        push({ kind: "break" });
        break;
      case "strong_open":
      case "em_open":
      case "s_open": {
        const kind: "strong" | "em" | "strike" =
          child.type === "strong_open"
            ? "strong"
            : child.type === "em_open"
              ? "em"
              : "strike";
        const children: InlineNode[] = [];
        push({ kind, children });
        stack.push({ children, kind });
        break;
      }
      case "strong_close":
      case "em_close":
      case "s_close":
        stack.pop();
        break;
      case "link_open": {
        const href = child.attrGet("href") ?? undefined;
        const node = { kind: "link" as const, href, children: [] as InlineNode[] };
        push(node);
        stack.push({ children: node.children, kind: "link", href });
        break;
      }
      case "link_close":
        stack.pop();
        break;
      case "image":
        // Remote images are not fetched on mobile; show the alt text instead.
        push({ kind: "text", text: child.content });
        break;
      case "html_inline":
        break;
      default:
        if (child.content && child.nesting === 0) {
          push({ kind: "text", text: child.content });
        }
        break;
    }
  }
  return root;
}

function inlineOf(tokens: Token[], index: number): InlineNode[] {
  const token = tokens[index];
  return token?.type === "inline" ? inlineChildren(token) : [];
}

function parseBlocks(
  tokens: Token[],
  start: number,
  stopType?: string,
): { blocks: BlockNode[]; next: number } {
  const blocks: BlockNode[] = [];
  let index = start;

  while (index < tokens.length) {
    const token = tokens[index];
    if (stopType && token.type === stopType) {
      return { blocks, next: index + 1 };
    }

    switch (token.type) {
      case "heading_open": {
        const level = Number(token.tag.slice(1)) || 1;
        blocks.push({ kind: "heading", level, inlines: inlineOf(tokens, index + 1) });
        index += 3;
        break;
      }
      case "paragraph_open": {
        const inlines: InlineNode[] = [];
        let cursor = index + 1;
        while (cursor < tokens.length && tokens[cursor].type !== "paragraph_close") {
          if (tokens[cursor].type === "inline") {
            inlines.push(...inlineChildren(tokens[cursor]));
          }
          cursor += 1;
        }
        blocks.push({ kind: "paragraph", inlines });
        index = cursor + 1;
        break;
      }
      case "bullet_list_open":
      case "ordered_list_open": {
        const ordered = token.type === "ordered_list_open";
        const closeType = ordered ? "ordered_list_close" : "bullet_list_close";
        const items: BlockNode[][] = [];
        let cursor = index + 1;
        while (cursor < tokens.length && tokens[cursor].type !== closeType) {
          if (tokens[cursor].type === "list_item_open") {
            const item = parseBlocks(tokens, cursor + 1, "list_item_close");
            items.push(item.blocks);
            cursor = item.next;
            continue;
          }
          cursor += 1;
        }
        blocks.push({ kind: "list", ordered, items });
        index = cursor + 1;
        break;
      }
      case "fence":
      case "code_block":
        blocks.push({
          kind: "code",
          text: token.content,
          language: token.info?.trim() || null,
        });
        index += 1;
        break;
      case "blockquote_open": {
        const inner = parseBlocks(tokens, index + 1, "blockquote_close");
        blocks.push({ kind: "quote", blocks: inner.blocks });
        index = inner.next;
        break;
      }
      case "hr":
        blocks.push({ kind: "hr" });
        index += 1;
        break;
      case "table_open": {
        const header: InlineNode[][] = [];
        const rows: InlineNode[][][] = [];
        let currentRow: InlineNode[][] | null = null;
        let inHeader = false;
        let rowIsHeader = false;
        let cursor = index + 1;
        while (cursor < tokens.length && tokens[cursor].type !== "table_close") {
          const cell = tokens[cursor];
          if (cell.type === "thead_open") inHeader = true;
          else if (cell.type === "thead_close") inHeader = false;
          else if (cell.type === "tr_open") {
            currentRow = [];
            rowIsHeader = inHeader;
          } else if (cell.type === "tr_close") {
            if (currentRow) {
              if (rowIsHeader) header.push(...currentRow);
              else rows.push(currentRow);
            }
            currentRow = null;
            rowIsHeader = false;
          } else if (
            (cell.type === "th_open" || cell.type === "td_open") &&
            currentRow
          ) {
            currentRow.push(inlineOf(tokens, cursor + 1));
            cursor += 2;
            continue;
          }
          cursor += 1;
        }
        blocks.push({ kind: "table", header, rows });
        index = cursor + 1;
        break;
      }
      case "html_block":
        index += 1;
        break;
      default:
        index += 1;
        break;
    }
  }

  return { blocks, next: index };
}

function inlineStyle(
  theme: ChatReactNativeTheme,
  base: TextStyle,
  kind: InlineNode["kind"],
): TextStyle[] {
  switch (kind) {
    case "strong":
      return [base, { fontWeight: "700" }];
    case "em":
      return [base, { fontStyle: "italic" }];
    case "strike":
      return [base, { textDecorationLine: "line-through" }];
    case "link":
      return [base, { color: theme.primaryColor, textDecorationLine: "underline" }];
    case "code":
      return [
        base,
        {
          fontFamily: monoFont,
          fontSize: 13,
          color: theme.textColor,
          backgroundColor: theme.surfaceColor,
        },
      ];
    default:
      return [base];
  }
}

function renderInline(
  nodes: InlineNode[],
  theme: ChatReactNativeTheme,
  base: TextStyle,
  keyPrefix: string,
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.kind === "text") return <Text key={key}>{node.text}</Text>;
    if (node.kind === "code") {
      return (
        <Text key={key} style={inlineStyle(theme, base, "code")}>
          {node.text}
        </Text>
      );
    }
    if (node.kind === "break") return <Text key={key}>{"\n"}</Text>;
    const style = inlineStyle(theme, base, node.kind);
    const content = renderInline(node.children, theme, base, key);
    if (node.kind === "link" && node.href) {
      return (
        <Text
          key={key}
          style={style}
          onPress={() => {
            void Linking.openURL(node.href as string).catch(() => undefined);
          }}
        >
          {content}
        </Text>
      );
    }
    return (
      <Text key={key} style={style}>
        {content}
      </Text>
    );
  });
}

function renderBlocks(
  blocks: BlockNode[],
  theme: ChatReactNativeTheme,
  keyPrefix: string,
): ReactNode[] {
  const textStyle = chatTextStyle(theme) as TextStyle;
  return blocks.map((block, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (block.kind) {
      case "heading": {
        const size = [22, 19, 17, 16, 15, 14][Math.min(block.level, 6) - 1] ?? 16;
        return (
          <Text
            key={key}
            selectable
            style={[
              textStyle,
              {
                fontSize: size,
                lineHeight: size + 6,
                fontWeight: "700",
                marginTop: index === 0 ? 0 : 12,
                marginBottom: 6,
              },
            ]}
          >
            {renderInline(block.inlines, theme, { ...textStyle, fontSize: size }, key)}
          </Text>
        );
      }
      case "paragraph":
        return (
          <Text
            key={key}
            selectable
            style={[textStyle, { marginBottom: 8 }]}
          >
            {renderInline(block.inlines, theme, textStyle, key)}
          </Text>
        );
      case "list":
        return (
          <View key={key} style={{ marginBottom: 8, gap: 4 }}>
            {block.items.map((item, itemIndex) => (
              <View key={`${key}-${itemIndex}`} style={{ flexDirection: "row", gap: 6 }}>
                <Text style={[textStyle, { color: theme.mutedTextColor, minWidth: block.ordered ? 20 : 12 }]}>
                  {block.ordered ? `${itemIndex + 1}.` : "•"}
                </Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {renderBlocks(item, theme, `${key}-${itemIndex}`)}
                </View>
              </View>
            ))}
          </View>
        );
      case "code":
        return (
          <View
            key={key}
            style={{
              backgroundColor: theme.surfaceColor,
              borderColor: theme.borderColor,
              borderWidth: 1,
              borderRadius: Math.min(theme.borderRadius, 10),
              marginBottom: 8,
              overflow: "hidden",
            }}
          >
            <Text
              selectable
              style={{
                color: theme.textColor,
                fontFamily: monoFont,
                fontSize: 12,
                lineHeight: 18,
                padding: 10,
              }}
            >
              {block.text}
            </Text>
          </View>
        );
      case "quote":
        return (
          <View
            key={key}
            style={{
              borderLeftColor: theme.primaryColor,
              borderLeftWidth: 3,
              paddingLeft: 10,
              marginBottom: 8,
              opacity: 0.9,
            }}
          >
            {renderBlocks(block.blocks, theme, key)}
          </View>
        );
      case "hr":
        return (
          <View
            key={key}
            style={{
              height: 1,
              backgroundColor: theme.borderColor,
              marginVertical: 10,
            }}
          />
        );
      case "table": {
        const columns = Math.max(
          block.header.length,
          ...block.rows.map((row) => row.length),
        );
        const cellStyle: TextStyle = {
          ...textStyle,
          fontSize: 13,
          lineHeight: 18,
        };
        const renderRow = (
          cells: InlineNode[][],
          rowKey: string,
          header: boolean,
        ) => (
          <View key={rowKey} style={{ flexDirection: "row" }}>
            {Array.from({ length: columns }, (_, cellIndex) => (
              <View
                key={`${rowKey}-${cellIndex}`}
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  minWidth: 0,
                  paddingHorizontal: 6,
                  paddingVertical: 5,
                  borderRightWidth: cellIndex === columns - 1 ? 0 : 1,
                  borderColor: theme.borderColor,
                  backgroundColor: header ? theme.surfaceColor : "transparent",
                }}
              >
                <Text
                  selectable
                  style={[cellStyle, header ? { fontWeight: "700" } : null]}
                >
                  {renderInline(
                    cells[cellIndex] ?? [],
                    theme,
                    cellStyle,
                    `${rowKey}-${cellIndex}`,
                  )}
                </Text>
              </View>
            ))}
          </View>
        );
        return (
          <View
            key={key}
            style={{
              marginBottom: 10,
              borderColor: theme.borderColor,
              borderRadius: Math.min(theme.borderRadius, 8),
              borderWidth: 1,
              overflow: "hidden",
            }}
          >
            {block.header.length ? renderRow(block.header, `${key}-head`, true) : null}
            {block.rows.map((row, rowIndex) => (
              <View
                key={`${key}-${rowIndex}`}
                style={{
                  borderTopColor: theme.borderColor,
                  borderTopWidth: 1,
                }}
              >
                {renderRow(row, `${key}-${rowIndex}`, false)}
              </View>
            ))}
          </View>
        );
      }
      default:
        return null;
    }
  });
}

export interface MarkdownProps {
  content: string;
  theme?: Partial<ChatReactNativeTheme>;
  style?: ChatStyle;
}

/**
 * Native Markdown renderer for chat bodies. Supports headings, emphasis,
 * inline/fenced code, lists, blockquotes, links and GFM tables. Images are
 * shown as their alt text; HTML is not rendered.
 */
export function Markdown({ content, theme: themeOverride, style }: MarkdownProps): ReactNode {
  const theme = resolveChatTheme(themeOverride);
  const blocks = useMemo(() => {
    if (!content.trim()) return [];
    const tokens = parser.parse(content, {});
    return parseBlocks(tokens, 0).blocks;
  }, [content]);

  if (!blocks.length) return null;
  return <View style={style}>{renderBlocks(blocks, theme, "md")}</View>;
}
