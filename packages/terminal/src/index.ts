import "@xterm/xterm/css/xterm.css";
import { Terminal } from "./terminal";
import { ITerminalInitOnlyOptions, ITerminalOptions } from "@xterm/xterm";
import type { TerminalThemeTokenOverrides } from "./terminal/types/themes";
import type { TerminalCommandBlock } from "./terminal/types/shellIntegration";
import {
  createChatTerminalI18n,
  type ChatTerminalLocale,
  type ChatTerminalMessageOverrides,
} from "./terminal/i18n";
import {
  type AIStreamEvent,
  type AITransport,
  type TerminalSession,
  type TerminalTransport,
} from "./transport";
import type { AIStreamResumeEntry } from "./transport/types";
import type {
  ModelSessionUserInputAnswer,
  ModelSessionUserInputRequest,
} from "./terminal/types/modelSession";

export type {
  ChatTerminalLocale,
  ChatTerminalMessageKey,
  ChatTerminalMessageOverrides,
  ChatTerminalMessages,
  CommandExplain,
  CommandExplainContext,
  CommandExplainPayload,
  ShellIntegrationState,
  SubshellDetection,
  TerminalCommandBlock,
} from "./terminal";
export type { TerminalThemeTokenOverrides } from "./terminal";
export * from "./transport";

export interface TerminalPrompts {
  chat?: (content: string) => string;
  explain?: (payload: { command: string; output: string }) => string;
  generate?: (content: string) => string;
}

export interface ChatTerminalOptions {
  el: HTMLElement;
  transport: {
    ai?: AITransport;
    terminal: TerminalTransport;
  };
  prompts?: TerminalPrompts;
  locale?: ChatTerminalLocale;
  messages?: ChatTerminalMessageOverrides;
  terminalOptions?: ITerminalInitOnlyOptions &
    ITerminalOptions & {
      explainTitle?: string;
      agentTips?: string;
      agentTipsGapCells?: number;
      themeTokens?: TerminalThemeTokenOverrides;
    };
  /**
   * Prefix that always routes a submitted line to the agent, defaulting to `#`.
   * It doubles as a shell comment, so a mis-route cannot execute anything.
   */
  agentPrefix?: string;
  /**
   * Overrides the heuristic used for input without the explicit prefix. By
   * default only high-confidence natural language is diverted to the agent, so
   * an ordinary shell command is never swallowed.
   */
  shouldRouteToAgent?: (input: string) => boolean;
  /** Fires when the shell process itself exits, so the host can close the tab. */
  onExit?: (exitCode: number | null) => void;
  /** Fires when the shell cannot report command boundaries. */
  onDegraded?: (session: TerminalSession) => void;
  onError?: (error: Error) => void;
}

export type IOptions = ChatTerminalOptions;

export function initTerminal(options: ChatTerminalOptions) {
  const { terminalOptions } = options;
  const terminalTransport = options.transport.terminal;
  const aiTransport = options.transport.ai;
  const i18n = createChatTerminalI18n({
    locale: options.locale,
    messages: {
      ...(terminalOptions?.agentTips
        ? { agentTips: terminalOptions.agentTips }
        : {}),
      ...(terminalOptions?.explainTitle
        ? { explainTitle: terminalOptions.explainTitle }
        : {}),
      ...options.messages,
    },
  });
  let session: TerminalSession | undefined;
  let disposed = false;
  const termRef: { current?: Terminal } = {};
  const pendingContinuations = new Map<
    string,
    (
      requestId: string,
      answers: ModelSessionUserInputAnswer[],
    ) => Promise<void>
  >();
  const pendingContinuationResolvers = new Map<
    string,
    { resolve: () => void; reject: (error: unknown) => void }
  >();
  const activeChatControllers = new Map<string, AbortController>();
  const cancelledChatRequests = new Set<string>();

  const writeToShell = (
    data: string,
    clearBuffer?: boolean,
    inputLine?: string,
  ) => {
    const integration = termRef.current?.shellIntegrationAddon;
    const sanitizedData = integration?.sanitizeInput(data) ?? data;
    integration?.noteInput(sanitizedData);
    terminalTransport.input(sanitizedData, clearBuffer, inputLine);
  };

  const commandChat = aiTransport
    ? async (content: string) => {
        const requestId =
          globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
        const controller = new AbortController();
        activeChatControllers.set(requestId, controller);
        let interrupted: ModelSessionUserInputRequest | undefined;
        const stream = async (resume?: AIStreamResumeEntry[]) => {
          await aiTransport.stream(
            resume ? "" : options.prompts?.chat?.(content) ?? content,
            {
              resume,
              signal: controller.signal,
              onChunk: ({ delta }) => {
                if (disposed) return;
                termRef.current?.modelSessionAddon?.appendMessageChunk({
                  conversationId: "default",
                  requestId,
                  response: delta,
                });
              },
              onEvent: (event) => {
                if (disposed) return;
                const request = parseUserInputRequest(event);
                if (request) {
                  interrupted = request;
                  termRef.current?.modelSessionAddon?.appendUserInputRequest({
                    conversationId: "default",
                    requestId,
                    request,
                    response: "",
                  });
                  return;
                }
                if (isAgentActivityEvent(event)) {
                  termRef.current?.modelSessionAddon?.appendActivityEvent({
                    conversationId: "default",
                    event,
                    requestId,
                  });
                }
              },
            },
          );
        };
        try {
          termRef.current?.modelSessionAddon?.startSession({
            conversationId: "default",
            requestId,
          });
          await stream();
        } finally {
          activeChatControllers.delete(requestId);
          if (
            !disposed &&
            !interrupted &&
            !cancelledChatRequests.has(requestId)
          ) {
            await (termRef.current?.modelSessionAddon?.complete(requestId) ??
              Promise.resolve());
          }
        }
        if (interrupted && !disposed) {
          let resolveContinuation!: () => void;
          let rejectContinuation!: (error: unknown) => void;
          const continuationDone = new Promise<void>((resolve, reject) => {
            resolveContinuation = resolve;
            rejectContinuation = reject;
          });
          pendingContinuationResolvers.set(requestId, {
            resolve: resolveContinuation,
            reject: rejectContinuation,
          });
          pendingContinuations.set(requestId, async (interactionId, answers) => {
            const addon = termRef.current?.modelSessionAddon;
            addon?.clearUserInputRequest(requestId, interactionId, answers);
            interrupted = undefined;
            try {
              await stream([
                {
                  interruptId: interactionId,
                  status: "resolved",
                  payload: { answers },
                },
              ]);
              if (!interrupted) {
                await addon?.complete(requestId);
                resolveContinuation();
              }
            } catch (error) {
              rejectContinuation(error);
              throw error;
            } finally {
              addon?.setUserInputSubmitting(requestId, false);
              if (!interrupted) {
                pendingContinuations.delete(requestId);
                pendingContinuationResolvers.delete(requestId);
              }
            }
          });
          await continuationDone;
        }
      }
    : undefined;

  const commandExplain = aiTransport
    ? async (
        payload: { command: string; output: string },
        {
          onChunk,
          signal,
        }: { onChunk?: (delta: string) => void; signal: AbortSignal },
      ) => {
        let content = "";
        await aiTransport.stream(
          options.prompts?.explain?.(payload) ??
            `Command:\n${payload.command}\n\nOutput:\n${payload.output}`,
          {
            onChunk: ({ delta }) => {
              content += delta;
              onChunk?.(delta);
            },
            signal,
          },
        );
        return content;
      }
    : undefined;

  const commandGenerate = aiTransport
    ? (content: string) =>
        aiTransport.request(options.prompts?.generate?.(content) ?? content)
    : undefined;

  const executeCommand = (command: string) => {
    const instance = termRef.current;
    return instance
      ? instance.executeCommand(command)
      : Promise.reject(new Error("终端尚未完成初始化"));
  };

  // The terminal activates addons during construction. Keep the reference
  // outside the constructor because inputRouter may synchronously query it
  // from its initial state notification.
  const termInstance = new Terminal(options.el, {
    cursorBlink: true,
    cursorStyle: "bar",
    cursorWidth: 2,
    ...terminalOptions,
    shellIntegration: {
      write: writeToShell,
    },
    inputRouter: {
      write: writeToShell,
      isAtPrompt: () =>
        termRef.current?.shellIntegrationAddon?.isAtPrompt() ?? false,
      readInputLine: () =>
        termRef.current?.shellIntegrationAddon?.readInputLine() ?? "",
      clearInputLine: () =>
        termRef.current?.shellIntegrationAddon?.clearInputLine(),
      onAgentRequest: (request) => commandChat?.(request),
      agentPrefix: options.agentPrefix,
      shouldRouteToAgent: options.shouldRouteToAgent,
    },
    blocks: {
      i18n,
      explainTitle: terminalOptions?.explainTitle,
      onExplain: commandExplain,
      onExplainCancel: aiTransport?.cancel,
      onAskAgent: commandChat
        ? (block) =>
            commandChat(buildBlockQuestion(block, i18n.t("blockAskPrompt")))
        : undefined,
      onRerun: async (command) => {
        await executeCommand(command);
      },
    },
    subshell: {
      i18n,
      write: writeToShell,
      getBootstrap: () => session?.subshellBootstrap ?? "",
    },
    agentPrompt: commandChat
      ? {
          i18n,
          textKey: "agentTips",
          gapCells: terminalOptions?.agentTipsGapCells || 1,
        }
      : undefined,
    modelSession:
      commandChat || commandGenerate
        ? {
            i18n,
            onExecuteCommand: async ({ command }) => {
              await executeCommand(command);
            },
            onModifyCommand: async ({ command }) => command.trim(),
            onGenerateCommand: ({ command }) => {
              if (!commandGenerate) {
                return Promise.reject(new Error("未配置 AI 命令生成能力"));
              }
              return commandGenerate(command);
            },
            onUserInputSubmit: async ({
              requestId: inputRequestId,
              requestId,
              answers,
            }) => {
              const continuation = pendingContinuations.get(inputRequestId);
              if (!continuation) return;
              await continuation(requestId, answers);
            },
            onCancelSession: async ({ requestId: inputRequestId }) => {
              cancelledChatRequests.add(inputRequestId);
              pendingContinuations.delete(inputRequestId);
              pendingContinuationResolvers.get(inputRequestId)?.resolve();
              pendingContinuationResolvers.delete(inputRequestId);
              const controller = activeChatControllers.get(inputRequestId);
              controller?.abort(new DOMException("会话已终止", "AbortError"));
              await aiTransport?.cancel?.(
                controller?.signal ?? new AbortController().signal,
              );
              await termRef.current?.modelSessionAddon?.complete(
                inputRequestId,
              );
              cancelledChatRequests.delete(inputRequestId);
            },
          }
        : undefined,
  });
  termRef.current = termInstance;

  const outputDisposable = terminalTransport.onOutput((data) => {
    termInstance.terminal.write(data, () => {
      // Only after xterm parsed the chunk do the OSC handlers know whether a
      // nested shell announced itself, so the subshell watch is nudged here.
      termInstance.shellIntegrationAddon?.noteOutput(data);
    });
  });
  const sessionDisposable = terminalTransport.onSessionChange((next) => {
    session = next;
    termInstance.shellIntegrationAddon?.setCwd(next.currentDirectory);
    if (!next.supportsBlocks) {
      options.onDegraded?.(next);
    }
  });
  const exitDisposable = terminalTransport.onExit((exitCode) => {
    options.onExit?.(exitCode);
  });
  const errorDisposable = terminalTransport.onError((error) => {
    reportError(error);
  });
  const resizeDisposable = termInstance.terminal.onResize((size) => {
    if (termInstance.shouldNotifyTransportResize()) {
      terminalTransport.resize(size);
    }
  });

  void terminalTransport.connect().catch((error: unknown) => {
    reportError(toError(error));
  });

  function reportError(error: Error) {
    if (options.onError) {
      options.onError(error);
    } else {
      console.warn(error);
    }
  }

  return {
    dispose() {
      disposed = true;
      outputDisposable.dispose();
      sessionDisposable.dispose();
      exitDisposable.dispose();
      errorDisposable.dispose();
      resizeDisposable.dispose();
      terminalTransport.dispose();
      aiTransport?.dispose?.();
      termInstance.dispose();
    },
    /** Runs a command through the real prompt, producing a normal block. */
    executeCommand(command: string) {
      return termInstance.executeCommand(command);
    },
    appendChatChunk(
      response: string,
      ids?: { requestId?: string; conversationId?: string },
    ) {
      termInstance.modelSessionAddon?.appendMessageChunk({
        requestId: ids?.requestId ?? "default",
        conversationId: ids?.conversationId ?? "default",
        response,
      });
    },
    completeChat(requestId = "default") {
      return (
        termInstance.modelSessionAddon?.complete(requestId) ?? Promise.resolve()
      );
    },
    setThemeTokens(tokens: TerminalThemeTokenOverrides) {
      termInstance.setThemeTokens(tokens);
    },
    resetTheme() {
      termInstance.resetTheme();
    },
    refreshTheme() {
      termInstance.refreshTheme();
    },
    setLocale(
      locale: ChatTerminalLocale,
      messages?: ChatTerminalMessageOverrides,
    ) {
      i18n.setLocale(locale);
      if (messages) {
        i18n.setMessages(messages);
      }
      termInstance.refreshLocale();
    },
    setMessages(messages: ChatTerminalMessageOverrides) {
      i18n.setMessages(messages);
      termInstance.refreshLocale();
    },
  };
}

function buildBlockQuestion(block: TerminalCommandBlock, instruction: string) {
  return [
    instruction,
    "",
    `command: ${block.command}`,
    `exit code: ${block.exitCode ?? "unknown"}`,
    "",
    "output:",
    block.readOutput(),
  ].join("\n");
}

function isAgentActivityEvent(event: AIStreamEvent) {
  const type = event.type.toUpperCase();
  return (
    type.startsWith("REASONING_") ||
    type.startsWith("TOOL_CALL_") ||
    type === "ACTIVITY_DELTA" ||
    type === "ACTIVITY_SNAPSHOT" ||
    type === "RUN_ERROR"
  );
}

function parseUserInputRequest(
  event: AIStreamEvent,
): ModelSessionUserInputRequest | undefined {
  if (event.type.toUpperCase() !== "RUN_FINISHED") return undefined;
  const outcome = event.outcome;
  const interrupt =
    isRecord(outcome) && outcome.type === "interrupt"
      ? Array.isArray(outcome.interrupts)
        ? outcome.interrupts[0]
        : undefined
      : isRecord(event.result) && isRecord(event.result.userInputRequest)
      ? event.result.userInputRequest
      : undefined;
  if (!isRecord(interrupt)) return undefined;
  const metadata = isRecord(interrupt.metadata)
    ? interrupt.metadata
    : interrupt;
  const requestId =
    readString(metadata.requestId) ?? readString(interrupt.id);
  const questions = metadata.questions;
  if (!requestId || !Array.isArray(questions)) return undefined;
  const normalizedQuestions = questions
    .filter(isRecord)
    .map((question) => ({
      questionId: readString(question.questionId) ?? "",
      question: readString(question.question) ?? "",
      options: Array.isArray(question.options)
        ? question.options
            .filter(isRecord)
            .map((option) => ({
              optionId: readString(option.optionId) ?? "",
              label: readString(option.label) ?? "",
              description: readString(option.description),
            }))
            .filter((option) => option.optionId && option.label)
        : [],
    }))
    .filter((question) => question.questionId && question.question);
  if (!normalizedQuestions.length) return undefined;
  return {
    requestId,
    intro: readString(interrupt.message) ?? readString(metadata.intro) ?? "",
    questions: normalizedQuestions,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
