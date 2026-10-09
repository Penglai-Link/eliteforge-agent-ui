import type { RenderContext } from "./index";
type Element = (tag: string, props: Record<string, any>, children: any[]) => any;
/** Shared semantics; framework adapters only create native elements. */
export function renderInteraction(ctx: RenderContext, h: Element, props: Record<string, any>): { handled: boolean; node?: any } {
  const { component: c, client, surfaceId, scope, resolve, setValue, dispatch } = ctx;
  if (!["QuestionCard", "ApprovalCard"].includes(c.component)) return { handled: false };
  const labels = c.labels ?? {};
  const status = resolve(c.status) ?? "Pending";
  const expired = typeof c.expiresAtMs === "number" && Date.now() >= c.expiresAtMs;
  const disabled = status !== "Pending" || expired;
  const label = (key: string, fallback: string) => labels[key] ?? fallback;
  const button = (text: string, onClick: () => void, off = disabled) => h("button", { type: "button", disabled: off, onClick }, [text]);
  let region: HTMLElement | null = null;
  let body: any[] = [];
  if (c.component === "ApprovalCard") {
    const decision = resolve(c.value);
    body = [c.details ? h("pre", {}, [JSON.stringify(c.details, null, 2)]) : null,
      h("div", { role: "group", "aria-label": label("ariaLabel", "Approval") }, [
        button(label("approve", "Approve"), () => { setValue(true); dispatch(); }),
        button(label("reject", "Reject"), () => { setValue(false); dispatch(); }),
      ]),
      disabled && typeof decision === "boolean" ? h("p", {}, [decision ? label("approved", "Approved") : label("rejected", "Rejected")]) : null];
  } else {
    const key = JSON.stringify([c.id, scope]);
    const questions = c.questions as any[];
    const index = Math.min(client.getViewState(surfaceId, key).tab ?? 0, questions.length - 1);
    const q = questions[index];
    const answers: Record<string, any> = resolve(c.value) ?? {};
    const answer = answers[q.questionId];
    const update = (value: any) => setValue({ ...answers, [q.questionId]: value });
    const move = (next: number) => {
      const element = region;
      client.setViewState(surfaceId, key, { tab: next });
      queueMicrotask(() => element?.querySelector<HTMLElement>("legend")?.focus());
    };
    const complete = (value: any) => value?.answerKind === "Option" && q.options.some((o: any) => o.optionId === value.optionId)
      || value?.answerKind === "Other" && !!value.otherText?.trim() || value?.answerKind === "Skipped" && q.allowSkip !== false;
    const submit = () => {
      if (index < questions.length - 1) move(index + 1);
      else if (!disabled) dispatch();
    };
    body = [h("p", { "aria-live": "polite" }, [label(`progress.${index+1}`, `Question ${index + 1} of ${questions.length}`)]),
      h("fieldset", { disabled }, [h("legend", { tabIndex:-1 }, [q.question]),
        ...q.options.map((o: any) => h("label", {}, [h("input", { type: "radio", name: `${surfaceId}:${c.id}:${scope}:${q.questionId}`, checked: answer?.optionId === o.optionId && answer?.answerKind === "Option", onChange: () => update({ questionId: q.questionId, answerKind: "Option", optionId: o.optionId, otherText: null }) }, []), h("span", {}, [o.label]), o.description ? h("small", {}, [o.description]) : null])),
        q.allowCustomAnswer !== false ? h("label", {}, [h("span", {}, [label("otherOptionLabel", "Other")]), h("textarea", { "aria-label": label(`otherAnswerAriaLabel.${index+1}`, `Other answer for question ${index + 1}`), placeholder: label("otherAnswerPlaceholder", "Type your answer"), value: answer?.answerKind === "Other" ? answer.otherText : "", onKeyDown: (event: any) => { if(event.key === "Enter" && !event.shiftKey && !event.isComposing && !disabled && complete(answer)) { event.preventDefault(); submit(); } }, onInput: (event: any) => update({ questionId: q.questionId, answerKind: "Other", optionId: null, otherText: event.target.value }), onChange: (event: any) => update({ questionId: q.questionId, answerKind: "Other", optionId: null, otherText: event.target.value }) }, [])]) : null]),
      h("div", {}, [complete(answer) && (questions.length === 1 || answer?.answerKind === "Other") ? button(label("confirm", "Confirm"), submit) : null, button(label("back", "Back"), () => move(index - 1), status === "Submitting" || index === 0),
        button(index === questions.length - 1 ? label("continue", "Continue") : label("next", "Next"), submit, status === "Submitting" || (disabled ? index === questions.length - 1 : !complete(answer))),
        q.allowSkip !== false ? button(label("skipOptionLabel", "Skip"), () => { update({ questionId: q.questionId, answerKind: "Skipped", optionId: null, otherText: null }); submit(); }) : null])];
  }
  return { handled: true, node: h("section", { ...props, ref:(element:HTMLElement | null) => {region=element;}, "aria-label": label("ariaLabel", c.component === "ApprovalCard" ? "Approval" : "Assistant questions"), "data-status": expired ? "Expired" : status }, [h("p", {}, [String(resolve(c.intro) ?? "")]), ...body.filter(Boolean), status !== "Pending" || expired ? h("p", { role: "status" }, [expired ? label("expired", "Expired") : status === "Submitting" ? label("continuing", "Continuing…") : label("answered", "Answered")]) : null]) };
}
