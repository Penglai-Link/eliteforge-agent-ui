import type { ITheme } from "@xterm/xterm";

/** 终端组件使用的语义颜色；字符串必须是浏览器可解析的 CSS 颜色值。 */
export interface TerminalThemeTokens {
  /** 终端文本和内容的颜色。 */
  primary: string;
  /** 终端背景和底色。 */
  secondary: string;
  /** 模型会话、命令卡片和解释弹窗的背景色。 */
  cardBackground: string;
  /** 分隔线、描边和引用标记的颜色。 */
  border: string;
  /** xterm 原生主题覆盖项，包括 ANSI 调色板及其他终端颜色。 */
  ansi?: Partial<ITheme>;
}

export type TerminalThemeTokenOverrides = Partial<TerminalThemeTokens>;
