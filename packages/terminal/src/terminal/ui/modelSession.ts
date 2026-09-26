import { html, render } from "lit-html";
import { guard } from "lit-html/directives/guard.js";
import type {
  ModelSessionCommandCardState,
  ModelSessionCommandToken,
  ModelSessionRenderActions,
  ModelSessionRenderState,
  ModelSessionToken,
  ModelSessionUserInputQuestion,
  ModelSessionUserInputSummary,
} from "../types/modelSession";
import type { ChatTerminalI18n } from "../i18n";
import { renderAgentActivity } from "./agentActivity";
import { renderMarkdown as renderMarkdownContent } from "../utils/markdown";

export function createModelSessionHost() {
  const host = document.createElement("div");
  host.className = "ai-terminal-model-session-host";
  attachModelSessionHostInteractions(host);
  return host;
}

export function createModelSessionUserInputHost() {
  const host = document.createElement("div");
  host.className = "ai-terminal-model-session-user-input-host";
  attachModelSessionHostInteractions(host);
  return host;
}

function attachModelSessionHostInteractions(host: HTMLElement) {
  let lastTouchY: number | null = null;
  const handleWheel = (event: WheelEvent) => {
    if (canConsumeScroll(host, event.target, event.deltaY, event.deltaX)) {
      event.stopPropagation();
    }
  };
  const handleTouchStart = (event: TouchEvent) => {
    lastTouchY = readTouchY(event);
  };
  const handleTouchMove = (event: TouchEvent) => {
    const touchY = readTouchY(event);
    const deltaY = lastTouchY !== null && touchY !== null
      ? lastTouchY - touchY
      : 0;
    if (canConsumeScroll(host, event.target, deltaY, 0)) {
      event.stopPropagation();
    }
    lastTouchY = touchY;
  };
  const resetTouch = () => {
    lastTouchY = null;
  };
  host.addEventListener("mousedown", (event) => event.stopPropagation());
  host.addEventListener("wheel", handleWheel);
  host.addEventListener("touchstart", handleTouchStart, { passive: true });
  host.addEventListener("touchmove", handleTouchMove);
  host.addEventListener("touchend", resetTouch, { passive: true });
  host.addEventListener("touchcancel", resetTouch, { passive: true });
}

function canConsumeScroll(
  host: HTMLElement,
  target: EventTarget | null,
  deltaY: number,
  deltaX: number,
) {
  let element = target instanceof HTMLElement ? target : null;
  while (element && element !== host) {
    if (elementCanConsumeScroll(element, deltaY, deltaX)) {
      return true;
    }
    element = element.parentElement;
  }
  return element === host && elementCanConsumeScroll(host, deltaY, deltaX);
}

function elementCanConsumeScroll(
  element: HTMLElement,
  deltaY: number,
  deltaX: number,
) {
  const canScrollVertically = element.scrollHeight > element.clientHeight;
  const canScrollHorizontally = element.scrollWidth > element.clientWidth;
  if (!canScrollVertically && !canScrollHorizontally) {
    return false;
  }

  if (deltaY !== 0 && canScrollVertically) {
    return deltaY < 0
      ? element.scrollTop > 0
      : element.scrollTop + element.clientHeight < element.scrollHeight;
  }
  if (deltaX !== 0 && canScrollHorizontally) {
    return deltaX < 0
      ? element.scrollLeft > 0
      : element.scrollLeft + element.clientWidth < element.scrollWidth;
  }
  return deltaY === 0 && deltaX === 0;
}

function readTouchY(event: TouchEvent) {
  return event.touches[0]?.clientY ?? event.changedTouches[0]?.clientY ?? null;
}

export function renderModelSession(
  host: HTMLElement,
  state: ModelSessionRenderState,
  actions: ModelSessionRenderActions,
) {
  render(
    html`
      <section
        class=${state.activityComplete
          ? "ai-terminal-model-session ai-terminal-model-session--complete"
          : "ai-terminal-model-session ai-terminal-model-session--running"}
      >
        <div class=${`ai-terminal-model-session__body${!state.activityComplete ? " ai-terminal-model-session__body--running" : ""}`}>
          ${!state.activityComplete && actions.onCancelSession
            ? html`<button
                class="ai-terminal-model-session__cancel-button"
                type="button"
                @click=${actions.onCancelSession}
              >
                ${state.i18n.t("terminateSession")}
              </button>`
            : null}
          ${renderAgentActivity(state)}
          ${state.userInput?.request.intro
            ? html`<p class="ai-terminal-model-session__user-input-intro">${state.userInput.request.intro}</p>`
            : null}
          ${state.userInputHistory?.length
            ? renderUserInputHistory(state.userInputHistory, state.i18n)
            : null}
          ${state.tokens.map((token) =>
            renderModelSessionToken(token, state, actions),
          )}
        </div>
      </section>
    `,
    host,
  );
}

export function renderModelSessionUserInput(
  host: HTMLElement,
  userInput: ModelSessionRenderState["userInput"],
  actions: ModelSessionRenderActions,
  i18n: ChatTerminalI18n,
) {
  host.hidden = !userInput;
  render(userInput ? renderUserInput(userInput, actions, i18n, false) : html``, host);
}

function renderUserInputHistory(
  history: readonly ModelSessionUserInputSummary[],
  i18n: ChatTerminalI18n,
) {
  const questionCount = history.reduce((count, item) => count + item.answers.length, 0);
  return html`
    <section class="ai-terminal-model-session__user-input-history" aria-label="${i18n.t("userInputAsked")} ${questionCount}">
      <div class="ai-terminal-model-session__user-input-history-title">
        <span aria-hidden="true" class="ai-terminal-model-session__user-input-history-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square-text-icon lucide-message-square-text"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M7 11h10"/><path d="M7 15h6"/><path d="M7 7h8"/></svg>
        </span>
        <strong>${i18n.t("userInputAsked")} ${questionCount} ${i18n.t("userInputQuestionSuffix")}</strong>
      </div>
      <div class="ai-terminal-model-session__user-input-history-list">
        ${history.flatMap((item) => item.answers.map((answer) => {
          const question = item.request.questions.find((entry) => entry.questionId === answer.questionId);
          const option = question?.options.find((entry) => entry.optionId === answer.optionId);
          const answerText = answer.answerKind === "Other"
            ? answer.otherText || i18n.t("userInputNoAnswer")
            : answer.answerKind === "Skipped"
              ? i18n.t("userInputSkip")
              : option?.label || answer.optionId || i18n.t("userInputNoAnswer");
          return html`<div class="ai-terminal-model-session__user-input-history-item">
            <span class="ai-terminal-model-session__user-input-history-question">${question?.question || answer.questionId}</span>
            <span class="ai-terminal-model-session__user-input-history-answer">${answerText}</span>
          </div>`;
        }))}
      </div>
    </section>
  `;
}

function renderUserInput(
  state: NonNullable<ModelSessionRenderState["userInput"]>,
  actions: ModelSessionRenderActions,
  i18n: ChatTerminalI18n,
  includeIntro = true,
) {
  const { request } = state;
  const question = request.questions[state.currentIndex] ?? request.questions[0];
  const selected = state.selected[question.questionId] ?? "";
  const otherText = state.otherText[question.questionId] ?? "";
  const complete = Boolean(selected || otherText.trim());
  const isFirst = state.currentIndex === 0;
  const isLast = state.currentIndex >= request.questions.length - 1;

  return html`
    ${includeIntro && request.intro
      ? html`<p class="ai-terminal-model-session__user-input-intro">${request.intro}</p>`
      : null}
    <section class="ai-terminal-model-session__user-input" role="dialog" aria-modal="true" aria-label="${question.question}">
      <header class="ai-terminal-model-session__user-input-header">
        <strong>${question.question}</strong>
        <nav class="ai-terminal-model-session__user-input-navigation" aria-label="Question navigation">
          <button type="button" aria-label="Previous question" ?disabled=${state.submitting || isFirst || !actions.onUserInputNavigate} @click=${() => actions.onUserInputNavigate?.(-1)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-left-icon lucide-chevron-left"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <span>${state.currentIndex + 1} / ${request.questions.length}</span>
          <button type="button" aria-label="Next question" ?disabled=${state.submitting || isLast || !complete || !actions.onUserInputNavigate} @click=${() => actions.onUserInputNavigate?.(1)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right-icon lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </nav>
      </header>
      ${renderUserInputQuestion(question, state.currentIndex, state, actions, i18n)}
      ${isLast ? html`<div class="ai-terminal-model-session__user-input-actions">
        <button class="ai-terminal-model-session__user-input-submit" type="button" ?disabled=${state.submitting || !complete} @click=${actions.onUserInputSubmit}>${state.submitting ? i18n.t("userInputContinuing") : i18n.t("userInputContinue")}</button>
      </div>` : null}
    </section>
  `;
}

function renderUserInputQuestion(
  question: ModelSessionUserInputQuestion,
  index: number,
  state: NonNullable<ModelSessionRenderState["userInput"]>,
  actions: ModelSessionRenderActions,
  i18n: ChatTerminalI18n,
) {
  const selected = state.selected[question.questionId] ?? "";
  const otherText = state.otherText[question.questionId] ?? "";
  return html`
    <fieldset class="ai-terminal-model-session__user-input-question">
      <legend class="ai-terminal-model-session__user-input-question-label">${question.question}</legend>
      <div class="ai-terminal-model-session__user-input-options">
        ${question.options.filter((option) => !option.optionId.startsWith("OTHER-") && !option.optionId.startsWith("SKIP-")).map((option, optionIndex) => html`
          <label class="ai-terminal-model-session__user-input-option${selected === option.optionId ? " is-selected" : ""}">
            <input
              type="radio"
              name="${question.questionId}"
              value="${option.optionId}"
              .checked=${selected === option.optionId}
              ?disabled=${state.submitting}
              @change=${() => actions.onUserInputSelect?.(question.questionId, option.optionId)}
            />
            <span class="ai-terminal-model-session__user-input-option-index">${optionIndex + 1}</span>
            <span class="ai-terminal-model-session__user-input-option-content">
              <strong>${option.label}</strong>
              ${option.description ? html`<small>${option.description}</small>` : null}
            </span>
          </label>
        `)}
      </div>
      <div class="ai-terminal-model-session__user-input-other-row">
        <input
          aria-label="${`Custom answer for question ${index + 1}`}"
          placeholder="${i18n.t("userInputOtherPlaceholder")}"
          .value=${otherText}
          ?disabled=${state.submitting}
          @input=${(event: Event) => actions.onUserInputOtherText?.(question.questionId, (event.currentTarget as HTMLTextAreaElement).value)}
        ></input>
        <button
          class="ai-terminal-model-session__user-input-skip"
          type="button"
          ?disabled=${state.submitting}
          @click=${actions.onUserInputSkip}
        >${i18n.t("userInputSkip")}</button>
      </div>
    </fieldset>
  `;
}

function renderModelSessionToken(
  token: ModelSessionToken,
  state: ModelSessionRenderState,
  actions: ModelSessionRenderActions,
) {
  if (token.type === "markdown") {
    return html`<div
      class="ai-terminal-model-session__markdown ai-terminal-markdown"
    >
      ${guard([token.content], () => renderMarkdownContent(token.content))}
    </div>`;
  }

  const cardState = state.commandStates.get(token.blockId) ?? {
    status: "pending" as const,
    command: token.command,
    draftCommand: token.command,
  };

  return renderCommandCard(token, cardState, actions, state.i18n);
}

function renderCommandCard(
  token: ModelSessionCommandToken,
  state: ModelSessionCommandCardState,
  actions: ModelSessionRenderActions,
  i18n: ChatTerminalI18n,
) {
  const isGenerating = state.isGenerating === true;
  const isBusy = state.status === "executing" || isGenerating;
  const isTerminal = state.status === "executed" || state.status === "rejected";
  const canExecute =
    !isBusy && (state.status === "pending" || state.status === "error");
  const canEdit = !isBusy && !isTerminal;
  const canReject =
    !isBusy && state.status !== "executed" && state.status !== "rejected";

  return html`
    <article
      class=${`ai-terminal-model-session-command ai-terminal-model-session-command--${state.status}`}
    >
      <div class="ai-terminal-model-session-command__meta">
        <span class="ai-terminal-model-session-command__type">
          ${i18n.t("commandConfirm")}
        </span>
        ${state.status === "pending" || state.status === "editing"
          ? html`<div class="ai-terminal-model-session-command__actions">
              <button
                class="ai-terminal-model-session-command__button ai-terminal-model-session-command__button--primary"
                type="button"
                ?disabled=${!canExecute}
                @click=${() => actions.onExecuteCommand(token)}
              >
                ${i18n.t("commandExecute")}
              </button>
              ${state.status === "editing"
                ? html`
                    <button
                      class="ai-terminal-model-session-command__button ai-terminal-model-session-command__button--info"
                      type="button"
                      ?disabled=${isBusy}
                      @click=${() => actions.onSaveCommandEdit(token)}
                    >
                      ${i18n.t("commandSave")}
                    </button>
                  `
                : html`
                    <button
                      class="ai-terminal-model-session-command__button ai-terminal-model-session-command__button--default"
                      type="button"
                      ?disabled=${!canEdit}
                      @click=${(event: MouseEvent) => {
                        const button = event.currentTarget as HTMLElement;
                        const commandDisplay = button
                          .closest<HTMLElement>(
                            ".ai-terminal-model-session-command",
                          )
                          ?.querySelector<HTMLElement>(
                            ".ai-terminal-model-session-command__code",
                          );

                        actions.onStartEditCommand(
                          token,
                          commandDisplay?.getBoundingClientRect().height,
                        );
                      }}
                    >
                      ${i18n.t("commandEdit")}
                    </button>
                  `}
              <button
                class="ai-terminal-model-session-command__button ai-terminal-model-session-command__button--default"
                type="button"
                ?disabled=${!canReject}
                @click=${() => actions.onRejectCommand(token)}
              >
                ${i18n.t("commandReject")}
              </button>
            </div>`
          : state.status === "executed" || state.status === "rejected"
          ? html`<span class="ai-terminal-model-session-command__status">
              ${renderCommandStatus(state.status, i18n)}
            </span>`
          : null}
      </div>

      ${html`
            <div
              class="ai-terminal-model-session-command__editor"
              style=${
                state.editorHeight ? `height:${state.editorHeight}px;` : ""
              }
            >
              <input
                .readOnly=${state.status !== "editing" || isGenerating}
                .value=${
                  state.status === "editing"
                    ? state.draftCommand
                    : state.command
                }
                @input=${(event: Event) => {
                  const target = event.currentTarget as HTMLInputElement;
                  actions.onDraftCommandChange(token, target.value);
                }}
                spellcheck="false"
              ></input>
              ${
                state.status === "editing" && actions.onGenerateCommand
                  ? html`
                      <button
                        class="ai-terminal-model-session-command__ai-generate"
                        type="button"
                        ?disabled=${isGenerating || !state.draftCommand.trim()}
                        @click=${() => actions.onGenerateCommand?.(token)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          class="lucide lucide-pencil-sparkles-icon lucide-pencil-sparkles"
                        >
                          <path d="M10 3H8" />
                          <path d="m15.007 5.008 3.987 3.986" />
                          <path d="M20 15v4" />
                          <path
                            d="M21.174 6.813a2.82 2.82 0 0 0-3.986-3.987L3.842 16.175a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
                          />
                          <path d="M22 17h-4" />
                          <path d="M4 5v4" />
                          <path d="M6 7H2" />
                          <path d="M9 2v2" />
                        </svg>
                        ${isGenerating
                          ? i18n.t("commandGenerating")
                          : i18n.t("commandGenerate")}
                      </button>
                    `
                  : ""
              }
            </div>
          `} ${state.error
        ? html`<div class="ai-terminal-model-session-command__error">
            ${state.error}
          </div>`
        : state.errorMessageKey
        ? html`<div class="ai-terminal-model-session-command__error">
            ${i18n.t(state.errorMessageKey)}
          </div>`
        : null}
    </article>
  `;
}

function renderCommandStatus(
  status: Extract<
    ModelSessionCommandCardState["status"],
    "executed" | "rejected"
  >,
  i18n: ChatTerminalI18n,
) {
  return status === "executed"
    ? i18n.t("statusExecuted")
    : i18n.t("statusRejected");
}
