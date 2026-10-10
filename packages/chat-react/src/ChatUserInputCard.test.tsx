// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatUserInputRequest } from "@eliteforge/agent-ui-chat-core";
import { ChatUserInputCard } from "./ChatUserInputCard";

afterEach(() => cleanup());

const request: ChatUserInputRequest = {
  answers: null,
  assistantMessageId: "MESSAGE-1",
  intro: "Let's make a few decisions first.",
  questions: [
    {
      options: [
        { description: "First choice", label: "Option one", optionId: "OPTION-1" },
        { description: "Second choice", label: "Option two", optionId: "OPTION-2" },
        { description: null, label: "Other", optionId: "OTHER-1" },
      ],
      question: "Which direction should we take?",
      questionId: "QUESTION-1",
    },
    {
      options: [
        { description: null, label: "Keep it simple", optionId: "OPTION-3" },
        { description: null, label: "Make it broad", optionId: "OPTION-4" },
      ],
      question: "What is the scope?",
      questionId: "QUESTION-2",
    },
  ],
  requestedAt: Date.now(),
  requestId: "INPUT-1",
  runId: "RUN-1",
  sessionId: "SESSION-1",
  status: "Pending",
};

describe("ChatUserInputCard", () => {
  it("uses shared motion without replaying or replacing form nodes on answer updates", () => {
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }));
    Object.defineProperty(HTMLElement.prototype, "animate", { value: animate, configurable: true });
    try {
      const result = render(<ChatUserInputCard onSubmit={vi.fn()} request={request} />);
      const fieldset = result.container.querySelector('[data-agent-motion="fade"]');
      expect(result.container.querySelector('[data-agent-motion="enter"]')).toBeTruthy();
      expect(animate).toHaveBeenCalledTimes(2);
      fireEvent.click(screen.getByRole("radio", { name: /Option one/ }));
      expect(animate).toHaveBeenCalledTimes(2);
      expect(result.container.querySelector('[data-agent-motion="fade"]')).toBe(fieldset);
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(animate).toHaveBeenCalledTimes(3);
      expect(result.container.querySelector('[data-agent-motion="fade"]')).toBe(fieldset);
    } finally { delete (HTMLElement.prototype as any).animate; }
  });

  it("asks one question at a time and preserves answers when going back", () => {
    const onSubmit = vi.fn();
    render(<ChatUserInputCard onSubmit={onSubmit} request={request} />);

    expect(screen.getByText("Question 1 of 2")).toBeTruthy();
    expect(screen.queryByText("What is the scope?")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /Option one/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Question 2 of 2")).toBeTruthy();
    expect(screen.getByRole("group", {name:"What is the scope?"})).toBeTruthy();
    expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect((screen.getByRole("radio", { name: /Option one/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("submits all answers only after the last question", () => {
    const onSubmit = vi.fn();
    render(<ChatUserInputCard onSubmit={onSubmit} request={request} />);

    fireEvent.click(screen.getByRole("radio", { name: /Option two/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: /Keep it simple/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onSubmit).toHaveBeenCalledWith([
      {
        answerKind: "Option",
        otherText: null,
        optionId: "OPTION-2",
        questionId: "QUESTION-1",
      },
      {
        answerKind: "Option",
        otherText: null,
        optionId: "OPTION-3",
        questionId: "QUESTION-2",
      },
    ]);
  });

  it("offers a confirm action after selecting an option", () => {
    const onSubmit = vi.fn();
    render(<ChatUserInputCard onSubmit={onSubmit} request={{ ...request, questions: [request.questions[0]] }} />);

    fireEvent.click(screen.getByRole("radio", { name: /Option one/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onSubmit).toHaveBeenCalledWith([
      {
        answerKind: "Option",
        otherText: null,
        optionId: "OPTION-1",
        questionId: "QUESTION-1",
      },
    ]);
  });

  it("turns the other option into an inline custom answer field", () => {
    const onSubmit = vi.fn();
    render(<ChatUserInputCard onSubmit={onSubmit} request={request} />);

    const otherAnswer = screen.getByRole("textbox", { name: "Other answer for question 1" });
    expect(otherAnswer).toBeTruthy();
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(otherAnswer, { target: { value: "I want to define my own direction." } });
    expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    fireEvent.click(screen.getByRole("radio", { name: /Keep it simple/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onSubmit).toHaveBeenCalledWith([
      {
        answerKind: "Other",
        otherText: "I want to define my own direction.",
        optionId: null,
        questionId: "QUESTION-1",
      },
      {
        answerKind: "Option",
        otherText: null,
        optionId: "OPTION-3",
        questionId: "QUESTION-2",
      },
    ]);
  });

  it("advances and submits a custom answer with Enter", () => {
    const onSubmit = vi.fn();
    render(<ChatUserInputCard onSubmit={onSubmit} request={request} />);

    const otherAnswer = screen.getByRole("textbox", { name: "Other answer for question 1" });
    fireEvent.change(otherAnswer, { target: { value: "Use the custom direction." } });
    fireEvent.keyDown(otherAnswer, { key: "Enter" });

    expect(screen.getByText("Question 2 of 2")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Other answer for question 2" }), { target: { value: "Keep the scope focused." } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Other answer for question 2" }), { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledWith([
      {
        answerKind: "Other",
        otherText: "Use the custom direction.",
        optionId: null,
        questionId: "QUESTION-1",
      },
      {
        answerKind: "Other",
        otherText: "Keep the scope focused.",
        optionId: null,
        questionId: "QUESTION-2",
      },
    ]);
  });

  it("uses host-provided labels for localized cards", () => {
    render(
      <ChatUserInputCard
        labels={{
          ariaLabel: "助手问题",
          progress: (current, total) => `第 ${current} / ${total} 题`,
          back: "上一步",
          next: "下一步",
          continue: "继续",
          continuing: "正在继续…",
          otherOptionLabel: "其他",
          otherOptionDescription: "提供自定义答案。",
          skipOptionLabel: "跳过",
          skipOptionDescription: "跳过此问题。",
          otherAnswerPlaceholder: "输入你的答案",
          otherAnswerAriaLabel: (index) => `第 ${index} 题的其他答案`,
        }}
        onSubmit={() => undefined}
        request={request}
      />,
    );

    expect(screen.getByRole("region", { name: "助手问题" })).toBeTruthy();
    expect(screen.getByText("第 1 / 2 题")).toBeTruthy();
    expect(screen.getByRole("button", { name: "下一步" })).toBeTruthy();
  });
});
