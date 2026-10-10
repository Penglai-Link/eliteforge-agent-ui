import type { RenderContext } from "./index";
type Element = (tag: string, props: Record<string, any>, children: any[]) => any;
/** Built-in interaction compositions share layout, behavior and theme hooks. */
export function renderInteraction(ctx: RenderContext, h: Element, props: Record<string, any>): {
    handled: boolean;
    node?: any;
} {
    const { component: c, client, surfaceId, scope, resolve, setValue, dispatch } = ctx;
    if (!["QuestionCard", "ApprovalCard"].includes(c.component))
        return { handled: false };
    const labels = c.labels ?? {};
    const status = resolve(c.status) ?? "Pending";
    const expired = typeof c.expiresAtMs === "number" && Date.now() >= c.expiresAtMs;
    const disabled = status !== "Pending" || expired;
    const label = (key: string, fallback: string) => labels[key] ?? fallback;
    const part = (name: string) => ({ class: "a2ui-question-" + name, "data-theme-part": "a2ui-question-" + name });
    const icon = (path: string) => h("svg", { class: "a2ui-interaction-icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "var(--agent-ui-a2ui-icon-stroke-width, 1.5)", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, [h("path", { d: path }, [])]);
    const button = (text: string, onClick: () => void, off = disabled, attrs: Record<string, any> = {}, children: any[] = [text]) => h("button", { type: "button", disabled: off, onClick, "aria-label": text, ...attrs }, children);
    const settled = disabled ? h("p", { class: "a2ui-interaction-status", role: "status" }, [expired ? label("expired", "Expired") : status === "Submitting" ? label("continuing", "Continuing…") : label("answered", "Answered")]) : null;
    const intro = String(resolve(c.intro) ?? "");
    if (c.component === "ApprovalCard") {
        const decision = resolve(c.value);
        return { handled: true, node: h("section", { ...props, "aria-label": label("ariaLabel", "Approval"), "data-status": expired ? "Expired" : status }, [
                intro ? h("p", {}, [intro]) : null,
                c.details ? h("pre", {}, [JSON.stringify(c.details, null, 2)]) : null,
                h("div", { role: "group", "aria-label": label("ariaLabel", "Approval") }, [
                    button(label("approve", "Approve"), () => { if (!disabled) {
                        setValue(true);
                        dispatch();
                    } }),
                    button(label("reject", "Reject"), () => { if (!disabled) {
                        setValue(false);
                        dispatch();
                    } }),
                ]),
                disabled && typeof decision === "boolean" ? h("p", {}, [decision ? label("approved", "Approved") : label("rejected", "Rejected")]) : null,
                settled,
            ]) };
    }
    const key = JSON.stringify([c.id, scope]);
    const questions = c.questions as any[];
    const index = Math.min(client.getViewState(surfaceId, key).tab ?? 0, questions.length - 1);
    const q = questions[index];
    const answers: Record<string, any> = resolve(c.value) ?? {};
    const answer = answers[q.questionId];
    let region: HTMLElement | null = null;
    const update = (value: any) => { if (!disabled)
        setValue({ ...answers, [q.questionId]: value }); };
    const move = (next: number) => {
        const element = region;
        client.setViewState(surfaceId, key, { tab: next });
        queueMicrotask(() => element?.querySelector<HTMLElement>("legend")?.focus());
    };
    const complete = (value: any) => value?.answerKind === "Option" && q.options.some((o: any) => o.optionId === value.optionId)
        || value?.answerKind === "Other" && !!value.otherText?.trim() || value?.answerKind === "Skipped" && q.allowSkip !== false;
    const last = index === questions.length - 1;
    const submit = () => {
        if (disabled || !complete(answer))
            return;
        if (!last)
            move(index + 1);
        else
            dispatch();
    };
    const skip = () => {
        if (disabled || q.allowSkip === false)
            return;
        update({ questionId: q.questionId, answerKind: "Skipped", optionId: null, otherText: null });
        if (!last)
            move(index + 1);
        else
            dispatch();
    };
    const other = (event: any) => update({ questionId: q.questionId, answerKind: "Other", optionId: null, otherText: event.target.value });
    const showConfirm = !disabled && complete(answer) && (questions.length === 1 || answer?.answerKind === "Other");
    const progress = label("progress." + (index + 1), "Question " + (index + 1) + " of " + questions.length);
    return { handled: true, node: h("section", { ...props, ref: (element: HTMLElement | null) => { region = element; }, "aria-label": label("ariaLabel", "Assistant questions"), "data-status": expired ? "Expired" : status }, [
            h("fieldset", { ...part("options"), "aria-label": q.question }, [
                h("legend", { ...part("header"), tabIndex: -1 }, [
                    h("span", part("title"), [q.question]),
                    h("span", { ...part("navigation"), role: "navigation", "aria-label": progress }, [
                        button(label("back", "Back"), () => move(index - 1), status === "Submitting" || index === 0, part("nav-button"), [icon("m15 18-6-6 6-6")]),
                        h("span", { "aria-live": "polite" }, [progress]),
                        button(last ? label("continue", "Continue") : label("next", "Next"), disabled ? () => move(index + 1) : submit, status === "Submitting" || (disabled ? last : !complete(answer)), part("nav-button"), [icon("m9 18 6-6-6-6")]),
                    ]),
                ]),
                ...q.options.map((o: any) => {
                    const selected = answer?.optionId === o.optionId && answer?.answerKind === "Option";
                    return h("label", { ...part("option"), "data-selected": selected }, [
                        h("input", { ...part("radio"), type: "radio", disabled, name: [surfaceId, c.id, scope, q.questionId].join(":"), checked: selected, onChange: () => update({ questionId: q.questionId, answerKind: "Option", optionId: o.optionId, otherText: null }) }, []),
                        h("span", part("content"), [h("strong", {}, [o.label]), o.description ? h("small", {}, [o.description]) : null]),
                        selected ? h("span", part("arrow"), [icon("M5 12h14m-6-6 6 6-6 6")]) : null,
                    ]);
                }),
            ]),
            q.allowCustomAnswer !== false || showConfirm || q.allowSkip !== false ? h("div", part("actions"), [
                q.allowCustomAnswer !== false ? h("label", { ...part("other"), "aria-label": label("otherOptionLabel", "Other") }, [
                    icon("m16 4 4 4M4 20l4-1L20 7a3 3 0 0 0-4-4L4 15Z"),
                    h("textarea", { ...part("answer"), rows: 1, disabled, "aria-label": label("otherAnswerAriaLabel." + (index + 1), "Other answer for question " + (index + 1)), placeholder: label("otherAnswerPlaceholder", "Type your answer"), value: answer?.answerKind === "Other" ? answer.otherText : "", onKeyDown: (event: any) => {
                            if (event.key === "Enter" && !event.shiftKey && !event.isComposing && !disabled && complete(answer)) {
                                event.preventDefault();
                                submit();
                            }
                        }, onInput: other, onChange: other }, []),
                ]) : null,
                showConfirm ? button(label("confirm", "Confirm"), submit, false, { ...part("confirm"), "data-variant": "primary" }) : null,
                q.allowSkip !== false ? button(label("skipOptionLabel", "Skip"), skip, disabled, part("skip")) : null,
            ]) : null,
            settled,
        ]) };
}
