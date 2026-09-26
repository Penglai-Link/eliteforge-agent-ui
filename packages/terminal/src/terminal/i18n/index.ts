import zhCN from "./locales/zh-CN";
import enUS from "./locales/en-US";

export type ChatTerminalLocale = "zh-CN" | "en-US";

export type ChatTerminalMessageKey = string;

export type ChatTerminalMessages = Record<string, string>;

export type ChatTerminalMessageOverrides = Partial<ChatTerminalMessages>;

export interface ChatTerminalI18n {
  readonly locale: ChatTerminalLocale;
  setLocale(locale: ChatTerminalLocale): void;
  setMessages(messages: ChatTerminalMessageOverrides): void;
  t(key: string): string;
}

const DEFAULT_LOCALE: ChatTerminalLocale = "zh-CN";

const DEFAULT_MESSAGES: Record<ChatTerminalLocale, ChatTerminalMessages> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

export function createChatTerminalI18n(options?: {
  locale?: ChatTerminalLocale;
  messages?: ChatTerminalMessageOverrides;
}): ChatTerminalI18n {
  let currentLocale = options?.locale ?? DEFAULT_LOCALE;
  let overrides = options?.messages ?? {};

  return {
    get locale() {
      return currentLocale;
    },
    setLocale(locale) {
      currentLocale = locale;
    },
    setMessages(messages) {
      overrides = {
        ...overrides,
        ...messages,
      };
    },
    t(key) {
      return (
        overrides[key] ??
        DEFAULT_MESSAGES[currentLocale]?.[key] ??
        DEFAULT_MESSAGES[DEFAULT_LOCALE][key]
      );
    },
  };
}
