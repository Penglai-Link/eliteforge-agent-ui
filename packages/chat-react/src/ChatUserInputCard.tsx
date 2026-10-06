import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, PencilLine } from "lucide-react";
import type {
  ChatUserInputAnswer,
  ChatUserInputLabels,
  ChatUserInputRequest,
} from "@eliteforge/agent-ui-chat-core";

const defaultLabels: ChatUserInputLabels = {
  ariaLabel: "Assistant questions",
  progress: (current, total) => `Question ${current} of ${total}`,
  back: "Back",
  next: "Next",
  continue: "Continue",
  confirm: "Confirm",
  continuing: "Continuing…",
  otherOptionLabel: "Other",
  otherOptionDescription: "Provide a custom answer.",
  skipOptionLabel: "Skip",
  skipOptionDescription: "Skip this question.",
  otherAnswerPlaceholder: "Type your answer",
  otherAnswerAriaLabel: (index) => `Other answer for question ${index}`,
};

export function ChatUserInputCard({
  disabled = false,
  labels = defaultLabels,
  onSubmit,
  request,
}: {
  disabled?: boolean;
  labels?: ChatUserInputLabels;
  onSubmit: (answers: ChatUserInputAnswer[]) => void;
  request: ChatUserInputRequest;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setCurrentIndex(0);
    setSelected({});
    setOtherText({});
  }, [request.requestId]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.stopPropagation();
    };

    const card = cardRef.current;
    if (card) {
      card.addEventListener('wheel', handleWheel, { passive: false });
      return () => card.removeEventListener('wheel', handleWheel);
    }
  }, []);

  const question = request.questions[currentIndex];
  const selectedCode = question ? selected[question.questionId] ?? "" : "";
  const currentOtherText = question ? otherText[question.questionId]?.trim() ?? "" : "";
  const currentComplete = Boolean(selectedCode) || Boolean(currentOtherText);
  const hasAnswer = Boolean(currentOtherText) || Boolean(selectedCode && !selectedCode.startsWith("SKIP-"));
  const isLastQuestion = currentIndex === request.questions.length - 1;

  function answerFor(questionId: string): ChatUserInputAnswer {
    const optionId = selected[questionId] ?? "";
    const customText = otherText[questionId]?.trim() ?? "";
    if (customText || optionId.startsWith("OTHER-")) {
      return {
        questionId,
        answerKind: "Other",
        optionId: null,
        otherText: otherText[questionId]?.trim() ?? "",
      };
    }
    if (optionId.startsWith("SKIP-")) {
      return {
        questionId,
        answerKind: "Skipped",
        optionId: null,
        otherText: null,
      };
    }
    return {
      questionId,
      answerKind: "Option",
      optionId,
      otherText: null,
    };
  }

  function goBack() {
    if (disabled || currentIndex === 0) return;
    setCurrentIndex((index) => index - 1);
  }

  function goNext() {
    if (disabled || !currentComplete) return;
    if (!isLastQuestion) {
      setCurrentIndex((index) => index + 1);
      return;
    }
    onSubmit(request.questions.map((item) => answerFor(item.questionId)));
  }

  function skipQuestion() {
    if (disabled || !question) return;
    const skippedAnswer: ChatUserInputAnswer = {
      questionId: question.questionId,
      answerKind: "Skipped",
      optionId: null,
      otherText: null,
    };
    setSelected((current) => ({ ...current, [question.questionId]: `SKIP-${question.questionId}` }));
    setOtherText((current) => ({ ...current, [question.questionId]: "" }));
    if (!isLastQuestion) {
      setCurrentIndex((index) => index + 1);
      return;
    }
    onSubmit(request.questions.map((item) => (
      item.questionId === question.questionId ? skippedAnswer : answerFor(item.questionId)
    )));
  }

  function customOptionCode() {
    return question?.options.find((option) => option.optionId.startsWith("OTHER-"))?.optionId
      ?? `OTHER-${question?.questionId ?? "ANSWER"}`;
  }

  function updateOtherText(value: string) {
    if (!question) return;
    setOtherText((current) => ({ ...current, [question.questionId]: value }));
    setSelected((current) => ({
      ...current,
      [question.questionId]: value.trim() ? customOptionCode() : current[question.questionId] ?? "",
    }));
  }

  function selectOption(optionId: string) {
    if (!question) return;
    setSelected((current) => ({ ...current, [question.questionId]: optionId }));
    setOtherText((current) => ({ ...current, [question.questionId]: "" }));
  }

  function handleOtherKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    goNext();
  }

  function submitOtherOrSkip() {
    if (hasAnswer) {
      goNext();
      return;
    }
    skipQuestion();
  }

  if (!question) return null;

  return (
    <section className="ef-chat__user-input-card" aria-label={labels.ariaLabel} ref={cardRef}>
      <div className="ef-chat__user-input-body">
        <div className="ef-chat__user-input-header">
          <p className="ef-chat__user-input-title">{question.question}</p>
          <div className="ef-chat__user-input-navigation" aria-label={labels.progress(currentIndex + 1, request.questions.length)}>
            <button
              aria-label={labels.back}
              className="ef-chat__user-input-nav-button"
              disabled={disabled || currentIndex === 0}
              type="button"
              onClick={goBack}
            >
              <ChevronLeft aria-hidden="true" size={15} />
            </button>
            <span aria-live="polite">{labels.progress(currentIndex + 1, request.questions.length)}</span>
            <button
              aria-label={isLastQuestion ? labels.continue : labels.next}
              className="ef-chat__user-input-nav-button"
              disabled={disabled || !currentComplete}
              type="button"
              onClick={goNext}
            >
              <ChevronRight aria-hidden="true" size={15} />
            </button>
          </div>
        </div>
        <fieldset className="ef-chat__user-input-question" key={question.questionId}>
          <legend>{question.question}</legend>
          <div className="ef-chat__user-input-options">
            {question.options.filter((option) => (
              !option.optionId.startsWith("OTHER-") && !option.optionId.startsWith("SKIP-")
            )).map((option, optionIndex) => {
              const isSelected = selectedCode === option.optionId;
              return (
                <label
                  className={`ef-chat__user-input-option${isSelected ? " is-selected" : ""}`}
                  key={option.optionId}
                >
                  <span className="ef-chat__user-input-option-index" aria-hidden="true">{optionIndex + 1}</span>
                  <input
                    className="ef-chat__user-input-option-radio"
                    checked={isSelected}
                    disabled={disabled}
                    name={question.questionId}
                    type="radio"
                    value={option.optionId}
                    onChange={() => selectOption(option.optionId)}
                  />
                  <span className="ef-chat__user-input-option-content">
                    <strong>{option.label}</strong>
                    {option.description ? <small>{option.description}</small> : null}
                  </span>
                  {isSelected ? <ArrowRight aria-hidden="true" className="ef-chat__user-input-option-arrow" size={15} /> : null}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>
      <div className="ef-chat__user-input-actions">
        {question.allowCustomAnswer !== false ? <label className="ef-chat__user-input-other">
          <PencilLine aria-hidden="true" size={15} />
          <textarea
            aria-label={labels.otherAnswerAriaLabel(currentIndex + 1)}
            className="ef-chat__user-input-other-answer"
            disabled={disabled}
            maxLength={2000}
            placeholder={labels.otherAnswerPlaceholder}
            rows={1}
            value={otherText[question.questionId] ?? ""}
            onChange={(event) => updateOtherText(event.target.value)}
            onKeyDown={handleOtherKeyDown}
          />
        </label> : null}
        <button
          className={`ef-chat__user-input-skip${hasAnswer ? " is-confirm" : ""}`}
          disabled={disabled || (question.allowSkip === false && !hasAnswer)}
          type="button"
          onClick={submitOtherOrSkip}
        >
          {hasAnswer || question.allowSkip === false ? labels.confirm ?? labels.continue : labels.skipOptionLabel}
        </button>
      </div>
    </section>
  );
}
