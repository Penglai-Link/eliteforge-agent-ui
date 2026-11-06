import { renderShadcn } from "./shadcn-components";
import { renderStatistics } from "./statistics-components";
import type { Component, RenderContext } from "./index";
export type Element = (
  tag: string,
  attrs: Record<string, any>,
  children: any[]
) => any;
export type ViewState = {
  tab?: number;
  open?: boolean;
  query?: string;
  month?: string;
  size?: number;
  sort?: string;
  desc?: boolean;
  expanded?: string[];
  numericDraft?: string;
};
export function componentReferences(c: Component): string[] {
  return [
    ...(c.child ? [c.child] : []),
    ...(Array.isArray(c.children)
      ? c.children
      : c.children
      ? [c.children.componentId]
      : []),
    ...(c.tabs?.map((t: any) => t.child) ?? []),
    ...(c.component === "Accordion"
      ? c.items?.map((item: any) => item.child) ?? []
      : []),
    ...(c.component === "Modal" ? [c.trigger, c.content] : []),
  ];
}
function safeUrl(value: any): string | undefined {
  if (typeof value !== "string" || !value.trim()) return;
  try {
    return ["http:", "https:", "mailto:", "tel:"].includes(
      new URL(value, "https://a2ui.invalid").protocol
    )
      ? value
      : undefined;
  } catch {
    return;
  }
}
function text(value: any): string {
  return value == null
    ? ""
    : typeof value === "object"
    ? JSON.stringify(value)
    : String(value);
}
export function renderCommon(
  ctx: RenderContext,
  h: Element,
  props: Record<string, any>,
  render: (id: string, trigger?: () => void) => any,
  view: ViewState,
  setView: (state: ViewState) => void
): { handled: boolean; node?: any } {
  const { component: c, resolve, setValue, children, surfaceId, scope } = ctx;
  const value = resolve(c.value),
    label = text(resolve(c.label)),
    bound =
      c.value &&
      typeof c.value === "object" &&
      typeof c.value.path === "string";
  const done = (node: any) => ({ handled: true, node });
  const shadcn = renderShadcn(ctx, h, props, render, view, setView);
  if (shadcn.handled) return shadcn;
  const statistics = renderStatistics(ctx, h, props);
  if (statistics.handled) return statistics;
  switch (c.component) {
    case "List":
      return done(
        h(
          "div",
          {
            ...props,
            role: "list",
            "data-direction": c.direction ?? "vertical",
            style: {
              alignItems:
                c.align === "start"
                  ? "flex-start"
                  : c.align === "end"
                  ? "flex-end"
                  : c.align ?? "stretch",
            },
          },
          children.map((child) => h("div", { role: "listitem" }, [child]))
        )
      );
    case "Grid":
      return done(
        h(
          "div",
          { ...props, style: { "--a2ui-columns": c.columns ?? 2 } },
          children
        )
      );
    case "Spacer":
      return done(
        h(
          "div",
          {
            ...props,
            "aria-hidden": true,
            "data-axis": c.axis ?? "vertical",
            "data-size": c.size ?? "medium",
          },
          []
        )
      );
    case "Tabs": {
      const selected = Math.min(view.tab ?? 0, c.tabs.length - 1),
        prefix =
          "a2ui-" +
          encodeURIComponent(JSON.stringify([surfaceId, c.id, scope]));
      return done(
        h("div", props, [
          h(
            "div",
            { role: "tablist", "aria-label": props["aria-label"] ?? "选项卡" },
            c.tabs.map((tab: any, index: number) =>
              h(
                "button",
                {
                  type: "button",
                  role: "tab",
                  id: `${prefix}-tab-${index}`,
                  "aria-selected": selected === index,
                  "aria-controls": `${prefix}-panel-${index}`,
                  tabIndex: selected === index ? 0 : -1,
                  onClick: () => setView({ tab: index }),
                  onKeyDown: (event: any) => {
                    let next = selected;
                    if (event.key === "ArrowRight")
                      next = (selected + 1) % c.tabs.length;
                    else if (event.key === "ArrowLeft")
                      next = (selected + c.tabs.length - 1) % c.tabs.length;
                    else if (event.key === "Home") next = 0;
                    else if (event.key === "End") next = c.tabs.length - 1;
                    else return;
                    event.preventDefault();
                    setView({ tab: next });
                    event.currentTarget.parentElement
                      .querySelectorAll("[role=tab]")
                      [next].focus();
                  },
                },
                [text(resolve(tab.title))]
              )
            )
          ),
          h(
            "div",
            {
              role: "tabpanel",
              "data-agent-motion": "fade",
              "data-agent-motion-key": selected,
              id: `${prefix}-panel-${selected}`,
              "aria-labelledby": `${prefix}-tab-${selected}`,
              tabIndex: 0,
            },
            [render(c.tabs[selected].child)]
          ),
        ])
      );
    }
    case "Modal": {
      return done(
        h("div", props, [
          render(c.trigger, () => setView({ open: true })),
          h(
            "dialog",
            {
              "aria-label": props["aria-label"] ?? "对话框",
              ref: (node: HTMLDialogElement | null) => {
                if (!node) return;
                if (view.open && !node.open) {
                  if (typeof node.showModal === "function") node.showModal();
                  else node.setAttribute("open", "");
                } else if (!view.open && node.open) {
                  if (typeof node.close === "function") node.close();
                  else node.removeAttribute("open");
                }
              },
              onCancel: () => setView({ open: false }),
              onClose: () => {
                if (
                  ctx.client.getViewState(
                    surfaceId,
                    ctx.viewKey ?? JSON.stringify([c.id, scope])
                  ).open
                )
                  setView({ open: false });
              },
            },
            [
              h(
                "button",
                {
                  type: "button",
                  class: "a2ui-button a2ui-modal-close",
                  "aria-label": "关闭对话框",
                  onClick: () => setView({ open: false }),
                },
                ["×"]
              ),
              view.open ? render(c.content) : null,
            ]
          ),
        ])
      );
    }
    case "Accordion":
      if (c.items) {
        const expanded = view.expanded ?? [];
        return done(
          h(
            "div",
            props,
            c.items.map((item: any) => {
              const prefix =
                "a2ui-" +
                encodeURIComponent(
                  JSON.stringify([surfaceId, c.id, scope, item.id])
                );
              const open = expanded.includes(item.id);
              return h("section", {}, [
                h("h3", {}, [
                  h(
                    "button",
                    {
                      id: prefix + "-trigger",
                      type: "button",
                      "aria-expanded": open,
                      "aria-controls": prefix + "-panel",
                      disabled: item.disabled,
                      onClick: () =>
                        setView({
                          ...view,
                          expanded: open
                            ? expanded.filter((v) => v !== item.id)
                            : c.multiple
                            ? [...expanded, item.id]
                            : [item.id],
                        }),
                      onKeyDown: (e: any) => {
                        if (
                          !["ArrowUp", "ArrowDown", "Home", "End"].includes(
                            e.key
                          )
                        )
                          return;
                        e.preventDefault();
                        const buttons = Array.from(
                          e.currentTarget
                            .closest(".a2ui-accordion")
                            .querySelectorAll("h3 > button:not(:disabled)")
                        ) as HTMLElement[];
                        const index = buttons.indexOf(e.currentTarget);
                        const next =
                          e.key === "Home"
                            ? 0
                            : e.key === "End"
                            ? buttons.length - 1
                            : (index +
                                (e.key === "ArrowDown" ? 1 : -1) +
                                buttons.length) %
                              buttons.length;
                        buttons[next]?.focus();
                      },
                    },
                    [
                      text(resolve(item.title)),
                      h("span", { "aria-hidden": true }, [open ? "−" : "+"]),
                    ]
                  ),
                ]),
                h(
                  "div",
                  {
                    id: prefix + "-panel",
                    role: "region",
                    "aria-labelledby": prefix + "-trigger",
                    hidden: !open,
                    "data-agent-motion": "enter",
                    "data-agent-motion-key": String(open),
                  },
                  [render(item.child)]
                ),
              ]);
            })
          )
        );
      }
      return done(
        h(
          "details",
          {
            ...props,
            open: view.open ?? c.defaultOpen ?? false,
            onToggle: (event: any) => {
              const open = event.currentTarget.open;
              if (
                open !==
                (ctx.client.getViewState(
                  surfaceId,
                  JSON.stringify([c.id, scope])
                ).open ??
                  c.defaultOpen ??
                  false)
              )
                setView({ open });
            },
          },
          [h("summary", {}, [text(resolve(c.title))]), h("div", { "data-agent-motion": "enter", "data-agent-motion-key": String(view.open ?? c.defaultOpen ?? false), "data-agent-motion-disabled": !(view.open ?? c.defaultOpen ?? false) }, children)]
        )
      );
    case "NumberField":
      return done(
        h("label", props, [
          label,
          h("input", {
            type: "text",
            inputMode: "decimal",
            value: value == null ? (view.numericDraft ?? "") : String(value),
            readOnly: !bound,
            onInput: (event: any) => {
              const input = event.currentTarget as HTMLInputElement;
              const draft = input.value;
              // Allow intermediate edits such as a leading minus or trailing dot.
              if (!/^-?\d*(?:\.\d*)?$/.test(draft)) {
                input.value = value == null ? (view.numericDraft ?? "") : String(value);
                return;
              }
              if (!draft) {
                setValue(null);
                setView({});
                return;
              }
              const number = Number(draft);
              const complete = /\d$/.test(draft) && Number.isFinite(number);
              const inRange = (c.min === undefined || number >= c.min) && (c.max === undefined || number <= c.max);
              const step = c.step;
              const quotient = step ? (number - (c.min ?? 0)) / step : 0;
              const onStep = !step || Math.abs(quotient - Math.round(quotient)) < 1e-9;
              if (complete && inRange && onStep) {
                setValue(number);
                setView({});
              } else {
                setView({ numericDraft: draft });
                setValue(null);
              }
            },
          }, []),
        ])
      );
    case "Switch":
      return done(
        h("label", props, [
          h(
            "input",
            {
              type: "checkbox",
              role: "switch",
              checked: value === true,
              disabled: !bound,
              onChange: (event: any) => setValue(event.target.checked),
            },
            []
          ),
          label,
        ])
      );
    case "Link":
      return done(
        h(
          "a",
          {
            ...props,
            href: safeUrl(resolve(c.url)),
            target: c.newTab ? "_blank" : undefined,
            rel: c.newTab ? "noopener noreferrer" : undefined,
          },
          [text(resolve(c.text))]
        )
      );
    case "Badge":
      return done(
        h("span", { ...props, "data-variant": c.variant ?? "neutral" }, [
          text(resolve(c.text)),
        ])
      );
    case "Avatar": {
      const name = text(resolve(c.name)),
        url = safeUrl(resolve(c.url));
      const imageUrl =
        url &&
        ["http:", "https:"].includes(
          new URL(url, "https://a2ui.invalid").protocol
        )
          ? url
          : undefined;
      return done(
        h(
          "span",
          {
            ...props,
            "data-size": c.size ?? "medium",
            role: "img",
            "aria-label": name,
          },
          imageUrl
            ? [
                h(
                  "img",
                  {
                    src: imageUrl,
                    alt: "",
                    onError: (event: any) => {
                      event.target.hidden = true;
                    },
                  },
                  []
                ),
                h("span", { "aria-hidden": true }, [
                  Array.from(name.trim()).slice(0, 2).join("").toUpperCase(),
                ]),
              ]
            : [Array.from(name.trim()).slice(0, 2).join("").toUpperCase()]
        )
      );
    }
    case "Alert":
      return done(
        h(
          "div",
          {
            ...props,
            role: c.variant === "error" ? "alert" : "status",
            "data-variant": c.variant ?? "info",
          },
          [
            c.title ? h("strong", {}, [text(resolve(c.title))]) : null,
            h("div", {}, [text(resolve(c.text))]),
          ]
        )
      );
    case "Progress": {
      const max = c.max ?? 100,
        v =
          typeof value === "number" && Number.isFinite(value)
            ? Math.max(0, Math.min(max, value))
            : 0;
      return done(
        h("label", props, [
          label,
          h("progress", { value: v, max, "aria-label": label || "进度" }, []),
          h("span", {}, [`${Math.round((v / max) * 100)}%`]),
        ])
      );
    }
    case "Spinner":
      return done(
        h("div", { ...props, role: "status" }, [
          h("span", { "aria-hidden": true, class: "a2ui-spinner-ring" }, []),
          text(resolve(c.label)) || "加载中",
        ])
      );
    case "Skeleton":
      return done(
        h(
          "div",
          {
            ...props,
            role: "status",
            "aria-label": "加载中",
            "aria-busy": true,
          },
          Array.from({ length: c.lines ?? 3 }, () =>
            h("div", { "aria-hidden": true }, [])
          )
        )
      );
    case "EmptyState":
      return done(
        h("section", props, [
          h("strong", {}, [text(resolve(c.title))]),
          c.description ? h("p", {}, [text(resolve(c.description))]) : null,
          ...children,
        ])
      );
    case "Table": {
      const rows = resolve(c.rows);
      return done(
        h("div", props, [
          h("table", {}, [
            c.caption ? h("caption", {}, [text(resolve(c.caption))]) : null,
            h("thead", {}, [
              h(
                "tr",
                {},
                c.columns.map((column: any) =>
                  h("th", { scope: "col" }, [text(resolve(column.label))])
                )
              ),
            ]),
            h(
              "tbody",
              {},
              Array.isArray(rows) && rows.length
                ? rows.map((row: any) =>
                    h(
                      "tr",
                      {},
                      c.columns.map((column: any) =>
                        h("td", {}, [text(row?.[column.key])])
                      )
                    )
                  )
                : [
                    h("tr", {}, [
                      h("td", { colSpan: c.columns.length }, ["暂无数据"]),
                    ]),
                  ]
            ),
          ]),
        ])
      );
    }
    default:
      return { handled: false };
  }
}
