import type { MaybePromise } from "./common";
import type { ChatTerminalI18n, ChatTerminalMessageKey } from "../i18n";
import type { AIStreamEvent } from "../../transport/types";

export type ModelSessionCommandStatus =
  | "pending"
  | "editing"
  | "executing"
  | "executed"
  | "rejected"
  | "error";

export type ModelSessionToken =
  | ModelSessionMarkdownToken
  | ModelSessionCommandToken;

export interface ModelSessionMarkdownToken {
  type: "markdown";
  content: string;
}

export interface ModelSessionCommandToken {
  type: "execute_command";
  blockId: string;
  requestId: string;
  conversationId: string;
  command: string;
}

export interface ModelSessionMessageChunk {
  requestId: string;
  conversationId: string;
  response: string;
}

export interface ModelSessionActivityEvent {
  requestId: string;
  conversationId: string;
  event: AIStreamEvent;
}

export interface ModelSessionUserInputOption {
  optionId: string;
  label: string;
  description?: string;
}

export interface ModelSessionUserInputQuestion {
  questionId: string;
  question: string;
  options: ModelSessionUserInputOption[];
}

export interface ModelSessionUserInputRequest {
  requestId: string;
  intro: string;
  questions: ModelSessionUserInputQuestion[];
}

export interface ModelSessionUserInputState {
  request: ModelSessionUserInputRequest;
  currentIndex: number;
  selected: Readonly<Record<string, string>>;
  otherText: Readonly<Record<string, string>>;
  submitting: boolean;
}

export interface ModelSessionUserInputSummary {
  request: ModelSessionUserInputRequest;
  answers: ModelSessionUserInputAnswer[];
}

export interface ModelSessionCommandActionPayload {
  requestId: string;
  conversationId: string;
  blockId: string;
  command: string;
}

export interface ModelSessionCommandCardState {
  status: ModelSessionCommandStatus;
  command: string;
  draftCommand: string;
  isGenerating?: boolean;
  editorHeight?: number;
  output?: string;
  error?: string;
  errorMessageKey?: ChatTerminalMessageKey;
}

export interface ModelSessionAddonOptions {
  enabled?: boolean;
  visible?: boolean;
  i18n?: ChatTerminalI18n;
  onSessionStateChange?: (active: boolean) => void;
  /** Invoked when a rendered model-session card changes width. */
  onLayoutResize?: () => void;
  onExecuteCommand?: (
    payload: ModelSessionCommandActionPayload,
  ) => MaybePromise<string | void>;
  onModifyCommand?: (
    payload: ModelSessionCommandActionPayload,
  ) => MaybePromise<string | undefined>;
  onGenerateCommand?: (
    payload: ModelSessionCommandActionPayload,
  ) => MaybePromise<string>;
  onRejectCommand?: (
    payload: ModelSessionCommandActionPayload,
  ) => MaybePromise<void>;
  onUserInputSubmit?: (
    payload: {
      requestId: string;
      conversationId: string;
      interactionId: string;
      answers: ModelSessionUserInputAnswer[];
    },
  ) => MaybePromise<void>;
  onCancelSession?: (payload: {
    requestId: string;
    conversationId: string;
  }) => MaybePromise<void>;
}

export interface ModelSessionUserInputAnswer {
  questionId: string;
  answerKind: "Option" | "Other" | "Skipped";
  optionId: string | null;
  otherText: string | null;
}

export interface ModelSessionRenderState {
  tokens: ModelSessionToken[];
  activityEvents: readonly AIStreamEvent[];
  activityStartedAt: number;
  activityNow: number;
  activityComplete: boolean;
  commandStates: ReadonlyMap<string, ModelSessionCommandCardState>;
  userInput?: ModelSessionUserInputState;
  userInputHistory?: readonly ModelSessionUserInputSummary[];
  i18n: ChatTerminalI18n;
}

export interface ModelSessionRenderActions {
  onExecuteCommand: (token: ModelSessionCommandToken) => void;
  onStartEditCommand: (
    token: ModelSessionCommandToken,
    editorHeight?: number,
  ) => void;
  onDraftCommandChange: (
    token: ModelSessionCommandToken,
    command: string,
  ) => void;
  onSaveCommandEdit: (token: ModelSessionCommandToken) => void;
  onGenerateCommand?: (token: ModelSessionCommandToken) => void;
  onCancelCommandEdit: (token: ModelSessionCommandToken) => void;
  onRejectCommand: (token: ModelSessionCommandToken) => void;
  onUserInputSelect?: (questionId: string, optionId: string) => void;
  onUserInputOtherText?: (questionId: string, value: string) => void;
  onUserInputNavigate?: (delta: number) => void;
  onUserInputSkip?: () => void;
  onUserInputSubmit?: () => void;
  onCancelSession?: () => void;
}
