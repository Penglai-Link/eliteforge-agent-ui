import type { RenderContext } from "./index";
import type { Element, ViewState } from "./common-components";

const text = (v: any) => (v == null ? "" : String(v));
const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const validDate = (v: any) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  dateKey(new Date(v)) === v;
const safeHref = (v: any) => {
  try {
    return typeof v === "string" &&
      ["https:", "http:", "mailto:", "tel:"].includes(
        new URL(v, "https://a2ui.invalid").protocol
      )
      ? v
      : undefined;
  } catch {
    return undefined;
  }
};
export function renderShadcn(
  ctx: RenderContext,
  h: Element,
  props: Record<string, any>,
  render: (id: string) => any,
  view: ViewState,
  setView: (v: ViewState) => void
): { handled: boolean; node?: any } {
  view = {
    ...view,
    open:
      view.open ??
      ctx.component.defaultOpen ??
      ctx.component.component === "Toast",
  };
  const { component: c, resolve, children, setValue, dispatch } = ctx;
  const label = text(resolve(c.label)),
    value = resolve(c.value);
  const bound =
    c.value && typeof c.value === "object" && typeof c.value.path === "string";
  const disabled = c.disabled || !bound;
  const identity = [ctx.surfaceId, c.id, ctx.scope];
  if (ctx.viewKey && ctx.viewKey !== JSON.stringify([c.id, ctx.scope])) {
    identity.push(ctx.viewKey);
  }
  const id = "a2ui-" + encodeURIComponent(JSON.stringify(identity));
  const done = (node: any) => ({ handled: true, node });
  const update = (changes: ViewState) => setView({ ...view, ...changes });
  const button = (name: string, onClick: (e?: any) => void, attrs: any = {}) =>
    h("button", { type: "button", class: "a2ui-button", onClick, ...attrs }, [
      name,
    ]);
  const heading = () =>
    label ? h("span", { class: "a2ui-control-label" }, [label]) : null;
  const empty = () => h("p", { role: "status" }, ["暂无数据"]);
  const focusLater = (selector: string) =>
    requestAnimationFrame(() =>
      document.getElementById(id)?.querySelector<HTMLElement>(selector)?.focus()
    );
  let trigger: HTMLElement | null = null;
  const close = () => {
    update({ open: false });
    trigger?.focus();
  };
  const popover = (content: any[], role = "dialog", focus = false) =>
    h(
      "div",
      {
        id: `${id}-popup`,
        class: "a2ui-popup",
        role,
        popover: "auto",
        "aria-label": label || "弹出内容",
        ref: (node: any) => {
          if (!node) return;
          if (typeof node.showPopover === "function") {
            if (view.open && !node.matches(":popover-open")) {
              node.showPopover();
              if (trigger) {
                const rect = trigger.getBoundingClientRect();
                if (c.component === "Select")
                  node.style.setProperty(
                    "--a2ui-select-trigger-width",
                    `${rect.width}px`
                  );
                const popup = node.getBoundingClientRect();
                const gutter = 8;
                node.style.margin = "0";
                node.style.left = `${Math.max(
                  gutter,
                  Math.min(rect.left, innerWidth - popup.width - gutter)
                )}px`;
                node.style.top = `${Math.max(
                  gutter,
                  rect.bottom + popup.height > innerHeight
                    ? rect.top - popup.height
                    : rect.bottom
                )}px`;
              }
              if (focus)
                node
                  .querySelector(
                    '[aria-selected="true"]:not(:disabled), button:not(:disabled), input'
                  )
                  ?.focus();
            } else if (!view.open && node.matches(":popover-open"))
              node.hidePopover();
          } else node.hidden = !view.open;
        },
        onToggle: (e: any) => {
          // Native toggle events are queued; an earlier close must not undo
          // a popup that has already reopened.
          const popup = e.currentTarget;
          const reopened = typeof popup.showPopover === "function" && popup.matches(":popover-open");
          if (e.newState === "closed" && view.open && !reopened) update({ open: false });
        },
        onKeyDown: (e: any) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
          if (role === "menu" || role === "listbox") menuKey(e);
        },
      },
      view.open ? content : []
    );
  const opener = (name = label, attrs: any = {}) =>
    button(name, () => update({ open: !view.open }), {
      ref: (node: HTMLElement | null) => {
        trigger = node;
      },
      "aria-expanded": !!view.open,
      "aria-controls": `${id}-popup`,
      "aria-haspopup": "dialog",
      ...attrs,
    });
  const menuKey = (e: any) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const items: HTMLElement[] = Array.from(
      e.currentTarget.querySelectorAll(
        '[role="menuitem"]:not(:disabled), [role="option"]:not(:disabled)'
      )
    );
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
        ? items.length - 1
        : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  };
  const choose = (option: any) => {
    if (disabled || option.disabled) return;
    setValue(option.value);
    update({ open: false, query: undefined, tab: 0 });
    if (c.action) dispatch();
    trigger?.focus();
  };
  const menuItems = (options: any[]) =>
    options.map((o) =>
      button(text(resolve(o.label)), () => choose(o), {
        role: "menuitem",
        disabled: disabled || o.disabled,
        "data-selected": value === o.value,
      })
    );
  const calendar = () => {
    const today = dateKey(new Date());
    const selected = validDate(value) ? value : today;
    const month = validDate(view.month)
      ? view.month!
      : selected.slice(0, 7) + "-01";
    const first = new Date(month),
      year = first.getUTCFullYear(),
      m = first.getUTCMonth();
    const shift = (delta: number) =>
      update({ month: dateKey(new Date(Date.UTC(year, m + delta, 1))) });
    const dayDisabled = (day: string) =>
      disabled || (c.min && day < c.min) || (c.max && day > c.max);
    const move = (day: string, key: string) => {
      const d = new Date(day);
      const offsets: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -7,
        ArrowDown: 7,
        Home: -d.getUTCDay(),
        End: 6 - d.getUTCDay(),
      };
      if (key in offsets) d.setUTCDate(d.getUTCDate() + offsets[key]);
      else if (key === "PageUp" || key === "PageDown")
        d.setUTCMonth(d.getUTCMonth() + (key === "PageUp" ? -1 : 1), 1);
      else return false;
      const target = dateKey(d);
      if (dayDisabled(target)) return true;
      update({ month: target.slice(0, 7) + "-01" });
      focusLater(`[data-date="${target}"]`);
      return true;
    };
    const start = new Date(Date.UTC(year, m, 1 - first.getUTCDay()));
    return h("div", { class: "a2ui-calendar-body" }, [
      h("div", { class: "a2ui-calendar-heading" }, [
        button("‹", () => shift(-1), {
          "aria-label": "上个月",
          disabled: c.disabled,
        }),
        h("strong", { "aria-live": "polite" }, [`${year} 年 ${m + 1} 月`]),
        button("›", () => shift(1), {
          "aria-label": "下个月",
          disabled: c.disabled,
        }),
      ]),
      h("table", { role: "grid", "aria-label": label || "日历" }, [
        h("thead", {}, [
          h(
            "tr",
            {},
            ["日", "一", "二", "三", "四", "五", "六"].map((d) =>
              h("th", { scope: "col" }, [d])
            )
          ),
        ]),
        h(
          "tbody",
          {},
          Array.from({ length: 6 }, (_, row) =>
            h(
              "tr",
              {},
              Array.from({ length: 7 }, (_, col) => {
                const d = new Date(start);
                d.setUTCDate(d.getUTCDate() + row * 7 + col);
                const day = dateKey(d);
                return h("td", { "aria-selected": value === day }, [
                  button(
                    String(d.getUTCDate()),
                    () => {
                      setValue(day);
                      update({ open: false });
                    },
                    {
                      "data-date": day,
                      "data-outside": d.getUTCMonth() !== m,
                      "data-selected": value === day,
                      "aria-label": day,
                      "aria-current": day === today ? "date" : undefined,
                      disabled: dayDisabled(day),
                      tabIndex:
                        day ===
                        (selected.slice(0, 7) === month.slice(0, 7)
                          ? selected
                          : month)
                          ? 0
                          : -1,
                      onKeyDown: (e: any) => {
                        if (move(day, e.key)) e.preventDefault();
                      },
                    }
                  ),
                ]);
              })
            )
          )
        ),
      ]),
    ]);
  };
  switch (c.component) {
    case "Direction":
      return done(h("div", { ...props, dir: c.direction ?? "ltr" }, children));
    case "ButtonGroup":
      return done(
        h(
          "div",
          { ...props, role: "group", "aria-label": label || "按钮组" },
          children
        )
      );
    case "InputGroup":
      return done(
        h("div", props, [
          c.prefix
            ? h("span", { class: "a2ui-inputgroup-prefix" }, [
                text(resolve(c.prefix)),
              ])
            : null,
          ...children,
          c.suffix
            ? h("span", { class: "a2ui-inputgroup-suffix" }, [
                text(resolve(c.suffix)),
              ])
            : null,
        ])
      );
    case "Item":
      return done(
        h("section", props, [
          c.title ? h("strong", {}, [text(resolve(c.title))]) : null,
          c.description ? h("p", {}, [text(resolve(c.description))]) : null,
          ...children,
        ])
      );
    case "Sidebar":
      return done(
        h("aside", { ...props, "aria-label": label || "侧边栏" }, children)
      );
    case "ScrollArea":
      return done(
        h(
          "div",
          {
            ...props,
            tabIndex: 0,
            role: "region",
            "aria-label": label || "滚动区域",
            style: { "--a2ui-scroll-height": `${c.height ?? 160}px` },
          },
          children
        )
      );
    case "MessageScroller":
      return done(
        h(
          "div",
          { ...props, role: "log", "aria-label": label || "消息", tabIndex: 0 },
          children
        )
      );
    case "Bubble":
      return done(
        h("div", { ...props, "data-align": c.align ?? "start" }, children)
      );
    case "Message":
      return done(
        h("article", { ...props, "data-role": c.role, "aria-label": c.role }, [
          text(resolve(c.text)),
        ])
      );
    case "AspectRatio":
      return done(
        h(
          "div",
          { ...props, style: { aspectRatio: c.ratio ?? 16 / 9 } },
          children
        )
      );
    case "Kbd":
      return done(h("kbd", props, [text(resolve(c.text))]));
    case "Marker":
      return done(h("mark", props, [text(resolve(c.text))]));
    case "Label":
      return done(h("label", props, [text(resolve(c.text))]));
    case "Attachment":
      return done(
        h(
          "a",
          {
            ...props,
            href: safeHref(resolve(c.url)),
            target: "_blank",
            rel: "noopener noreferrer",
          },
          [
            h("strong", {}, [text(resolve(c.name))]),
            c.description
              ? h("small", {}, [text(resolve(c.description))])
              : null,
          ]
        )
      );
    case "Breadcrumb":
    case "NavigationMenu":
      return done(
        h(
          "nav",
          {
            ...props,
            "aria-label":
              label || (c.component === "Breadcrumb" ? "面包屑" : "导航"),
          },
          [
            h(
              "ol",
              {},
              c.items.map((item: any, i: number) =>
                h("li", {}, [
                  item.url
                    ? h("a", { href: safeHref(resolve(item.url)) }, [
                        text(resolve(item.label)),
                      ])
                    : h(
                        "span",
                        {
                          "aria-current":
                            i === c.items.length - 1 ? "page" : undefined,
                        },
                        [text(resolve(item.label))]
                      ),
                ])
              )
            ),
          ]
        )
      );
    case "Field": {
      // Field groups controls that retain their own accessible labels.
      return done(
        h("div", { ...props, role: "group", "aria-label": label }, [
          heading(),
          ...children,
          c.description ? h("small", {}, [text(resolve(c.description))]) : null,
          c.error
            ? h("span", { role: "alert" }, [text(resolve(c.error))])
            : null,
        ])
      );
    }
    case "Textarea":
      return done(
        h("label", props, [
          heading(),
          h(
            "textarea",
            {
              value: value ?? "",
              rows: c.rows ?? 3,
              placeholder: text(resolve(c.placeholder)),
              disabled: c.disabled,
              readOnly: !bound,
              onInput: (e: any) => setValue(e.target.value),
            },
            []
          ),
        ])
      );
    case "InputOTP":
      return done(
        h("label", props, [
          heading(),
          h(
            "input",
            {
              value: value ?? "",
              type: "text",
              inputMode: "numeric",
              autoComplete: "one-time-code",
              maxLength: c.length ?? 6,
              pattern: `[0-9]{${c.length ?? 6}}`,
              disabled,
              "aria-label": label || "验证码",
              onInput: (e: any) => {
                const next = e.target.value
                  .replace(/\D/g, "")
                  .slice(0, c.length ?? 6);
                e.target.value = next;
                setValue(next);
              },
            },
            []
          ),
        ])
      );
    case "Toggle":
      return done(
        button(label, () => setValue(!value), {
          ...props,
          class: `${props.class} a2ui-button`,
          disabled,
          "aria-pressed": value === true,
        })
      );
    case "ToggleGroup":
      return done(
        h(
          "div",
          { ...props, role: "group", "aria-label": label || "切换组" },
          c.options.map((o: any) =>
            button(
              text(resolve(o.label)),
              () => {
                const current = Array.isArray(value) ? value : [];
                setValue(
                  c.multiple
                    ? current.includes(o.value)
                      ? current.filter((v) => v !== o.value)
                      : [...current, o.value]
                    : current.includes(o.value)
                    ? []
                    : [o.value]
                );
              },
              {
                disabled: disabled || o.disabled,
                "aria-pressed": Array.isArray(value) && value.includes(o.value),
              }
            )
          )
        )
      );
    case "Pagination": {
      const page =
        typeof value === "number"
          ? Math.min(c.totalPages, Math.max(1, Math.floor(value)))
          : 1;
      const pages = Array.from(
        new Set(
          [1, page - 1, page, page + 1, c.totalPages].filter(
            (v) => v >= 1 && v <= c.totalPages
          )
        )
      ).sort((a, b) => a - b);
      return done(
        h("nav", { ...props, "aria-label": label || "分页" }, [
          button("上一页", () => setValue(page - 1), {
            disabled: disabled || page <= 1,
          }),
          ...pages.flatMap((p, i) => [
            i && p - pages[i - 1] > 1
              ? h("span", { "aria-hidden": true }, ["…"])
              : null,
            button(String(p), () => setValue(p), {
              disabled,
              "aria-current": p === page ? "page" : undefined,
              "aria-label": `第 ${p} 页`,
            }),
          ]),
          button("下一页", () => setValue(page + 1), {
            disabled: disabled || page >= c.totalPages,
          }),
        ])
      );
    }
    case "Collapsible":
      return done(
        h(
          "details",
          {
            ...props,
            open: view.open ?? c.defaultOpen ?? false,
            onToggle: (e: any) => {
              if (
                e.currentTarget.open !== (view.open ?? c.defaultOpen ?? false)
              )
                update({ open: e.currentTarget.open });
            },
          },
          [h("summary", {}, [label]), h("div", { "data-agent-motion": "enter", "data-agent-motion-key": String(view.open ?? c.defaultOpen ?? false), "data-agent-motion-disabled": !(view.open ?? c.defaultOpen ?? false) }, children)]
        )
      );
    case "Calendar":
      return done(h("div", { ...props, id }, [heading(), calendar()]));
    case "DatePicker":
      return done(
        h("div", { ...props, id }, [
          opener(validDate(value) ? value : label || "选择日期", { disabled }),
          popover([calendar()]),
        ])
      );
    case "Popover":
      return done(h("div", { ...props, id }, [opener(), popover(children)]));
    case "HoverCard":
    case "Tooltip":
      return done(
        h(
          "div",
          {
            ...props,
            id,
            onMouseEnter: () => update({ open: true }),
            onMouseLeave: () => update({ open: false }),
            onFocus: () => update({ open: true }),

            onBlur: (e: any) => {
              if (!e.currentTarget.contains(e.relatedTarget))
                update({ open: false });
            },
          },
          [
            opener(label, {
              "aria-describedby": `${id}-popup`,
              onClick: () => update({ open: true }),
              "aria-haspopup": c.component === "Tooltip" ? undefined : "dialog",
            }),
            popover(children, c.component === "Tooltip" ? "tooltip" : "dialog"),
          ]
        )
      );
    case "Drawer":
    case "Sheet":
    case "AlertDialog":
      return done(
        h("div", { ...props, id, "data-side": c.side ?? "right" }, [
          opener(),
          h(
            "dialog",
            {
              role: c.component === "AlertDialog" ? "alertdialog" : undefined,
              "aria-label": text(resolve(c.title)) || label,
              "aria-describedby": c.description
                ? `${id}-description`
                : undefined,
              ref: (node: HTMLDialogElement | null) => {
                if (!node) return;
                if (view.open && !node.open) {
                  if (node.showModal) node.showModal();
                  else node.setAttribute("open", "");
                } else if (!view.open && node.open) {
                  if (node.close) node.close();
                  else node.removeAttribute("open");
                }
              },
              onCancel: () => update({ open: false }),
              onClose: () => {
                if (
                  ctx.client.getViewState(
                    ctx.surfaceId,
                    ctx.viewKey ?? JSON.stringify([c.id, ctx.scope])
                  ).open
                )
                  update({ open: false });
              },
            },
            [
              c.title ? h("h3", {}, [text(resolve(c.title))]) : null,
              c.description
                ? h("p", { id: `${id}-description` }, [
                    text(resolve(c.description)),
                  ])
                : null,
              view.open ? render(c.child) : null,
              button(c.component === "AlertDialog" ? "取消" : "关闭", close, {
                autoFocus: true,
              }),
              c.component === "AlertDialog"
                ? button(
                    text(resolve(c.confirmLabel)) || "确认",
                    () => {
                      if (c.action) dispatch();
                      close();
                    },
                    { "data-variant": "primary" }
                  )
                : null,
            ]
          ),
        ])
      );
    case "DropdownMenu":
    case "ContextMenu":
      return done(
        h(
          "div",
          {
            ...props,
            id,
            onContextMenu:
              c.component === "ContextMenu"
                ? (e: any) => {
                    e.preventDefault();
                    if (!disabled) update({ open: true });
                  }
                : undefined,
            onKeyDown: (e: any) => {
              if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                e.preventDefault();
                if (!disabled) update({ open: true });
              }
            },
          },
          [
            opener(label, { disabled, "aria-haspopup": "menu" }),
            popover(menuItems(c.options), "menu", true),
          ]
        )
      );
    case "Menubar":
      return done(
        h("div", { ...props, id, role: "menubar", "aria-label": label }, [
          opener(label, {
            role: "menuitem",
            disabled,
            "aria-haspopup": "menu",
          }),
          popover(menuItems(c.options), "menu", true),
        ])
      );
    case "Select": {
      const selected = c.options.find((option: any) => option.value === value);
      return done(
        h("div", { ...props, id }, [
          h("span", { id: `${id}-label`, class: "a2ui-control-label" }, [
            label,
          ]),
          opener(
            text(resolve(selected?.label)) ||
              text(resolve(c.placeholder)) ||
              "请选择",
            {
              role: "combobox",
              disabled,
              "aria-haspopup": "listbox",
              "aria-labelledby": `${id}-label ${id}-value`,
              id: `${id}-value`,
              onKeyDown: (e: any) => {
                if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
                  e.preventDefault();
                  update({ open: true });
                }
              },
            }
          ),
          popover(
            c.options.map((option: any) =>
              button(text(resolve(option.label)), () => choose(option), {
                role: "option",
                disabled: disabled || option.disabled,
                "aria-selected": value === option.value,
              })
            ),
            "listbox",
            true
          ),
        ])
      );
    }
    case "Combobox":
    case "Command": {
      const selected = c.options.find((o: any) => o.value === value);
      const query = view.query ?? "";
      const matches = c.options.filter((o: any) =>
        text(resolve(o.label))
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())
      );
      const enabled = matches
        .map((o: any, i: number) => (o.disabled ? -1 : i))
        .filter((i: number) => i >= 0);
      const candidate = Math.min(
        view.tab ?? 0,
        Math.max(0, matches.length - 1)
      );
      const active = enabled.includes(candidate) ? candidate : enabled[0] ?? -1;
      const list = h(
        "div",
        { role: "listbox", id: `${id}-list`, "aria-label": label || "选项" },
        matches.length
          ? matches.map((o: any, i: number) =>
              h(
                "button",
                {
                  type: "button",
                  role: "option",
                  id: `${id}-option-${i}`,
                  "aria-selected": value === o.value,
                  disabled: disabled || o.disabled,
                  tabIndex: -1,
                  "data-active": active === i,
                  onMouseDown: (e: any) => e.preventDefault(),
                  onClick: () => choose(o),
                },
                [text(resolve(o.label))]
              )
            )
          : empty()
      );
      return done(
        h("div", { ...props, id }, [
          h("label", {}, [
            heading(),
            h(
              "input",
              {
                role: "combobox",
                "aria-autocomplete": "list",
                "aria-expanded": c.component === "Command" || !!view.open,
                "aria-controls": `${id}-list`,
                "aria-activedescendant":
                  active >= 0 && (c.component === "Command" || view.open)
                    ? `${id}-option-${active}`
                    : undefined,
                value:
                  view.query ??
                  (c.component === "Command"
                    ? ""
                    : text(resolve(selected?.label))),
                placeholder: text(resolve(c.placeholder)),
                disabled,
                onFocus: () => update({ open: true }),
                onBlur: () => update({ open: false, query: undefined }),
                onInput: (e: any) =>
                  update({ query: e.target.value, open: true, tab: 0 }),
                onKeyDown: (e: any) => {
                  if (e.key === "Escape") {
                    update({ open: false, query: undefined });
                    return;
                  }
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const next =
                      enabled[
                        (enabled.indexOf(active) +
                          (e.key === "ArrowDown" ? 1 : -1) +
                          enabled.length) %
                          Math.max(1, enabled.length)
                      ] ?? 0;
                    update({ open: true, tab: next });
                  }
                  if (
                    e.key === "Enter" &&
                    matches[active] &&
                    (view.open || c.component === "Command")
                  ) {
                    e.preventDefault();
                    choose(matches[active]);
                  }
                },
              },
              []
            ),
          ]),
          c.component === "Command" || view.open ? list : null,
        ])
      );
    }
    case "Carousel": {
      const count = children.length,
        selected = count
          ? Math.min(view.tab ?? c.defaultIndex ?? 0, count - 1)
          : 0;
      const move = (delta: number) =>
        update({ tab: (selected + delta + count) % count });
      return done(
        h(
          "section",
          {
            ...props,
            role: "region",
            "aria-roledescription": "轮播",
            "aria-label": label || "轮播",
            tabIndex: 0,
            onKeyDown: (e: any) => {
              if (count && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
                e.preventDefault();
                move(e.key === "ArrowLeft" ? -1 : 1);
              }
            },
          },
          [
            count
              ? h(
                  "div",
                  {
                    role: "group",
                    "aria-roledescription": "幻灯片",
                    "aria-label": `${selected + 1} / ${count}`,
                  },
                  [children[selected]]
                )
              : empty(),
            h("div", {}, [
              button("上一张", () => move(-1), { disabled: count < 2 }),
              h("span", { "aria-live": "polite" }, [
                `${count ? selected + 1 : 0} / ${count}`,
              ]),
              button("下一张", () => move(1), { disabled: count < 2 }),
            ]),
          ]
        )
      );
    }
    case "Resizable": {
      const size = view.size ?? c.defaultSize ?? 50;
      const resize = (next: number) =>
        update({ size: Math.max(10, Math.min(90, next)) });
      return done(
        h("div", { ...props, style: { "--a2ui-split": `${size}%` } }, [
          h("div", {}, [children[0]]),
          h(
            "div",
            {
              role: "separator",
              tabIndex: 0,
              "aria-label": label || "调整面板宽度",
              "aria-orientation": "vertical",
              "aria-valuenow": size,
              "aria-valuemin": 10,
              "aria-valuemax": 90,
              onKeyDown: (e: any) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  resize(
                    e.key === "Home"
                      ? 10
                      : e.key === "End"
                      ? 90
                      : size + (e.key === "ArrowLeft" ? -5 : 5)
                  );
                }
              },
              onPointerDown: (e: any) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
              },
              onPointerMove: (e: any) => {
                if (e.buttons !== 1) return;
                const rect =
                  e.currentTarget.parentElement.getBoundingClientRect();
                if (rect.width)
                  resize(((e.clientX - rect.left) / rect.width) * 100);
              },
            },
            []
          ),
          h("div", {}, [children[1]]),
        ])
      );
    }
    case "Toast":
      return done(
        !view.open
          ? h("div", props, [button("显示通知", () => update({ open: true }))])
          : h(
              "div",
              {
                ...props,
                role: c.variant === "error" ? "alert" : "status",
                "data-variant": c.variant ?? "info",
              },
              [
                h("strong", {}, [text(resolve(c.title))]),
                c.description
                  ? h("p", {}, [text(resolve(c.description))])
                  : null,
                button("关闭通知", () => update({ open: false })),
              ]
            )
      );
    case "DataTable": {
      const rows = resolve(c.rows),
        columns = c.columns,
        pageSize = c.pageSize ?? 5;
      const sorted = Array.isArray(rows) ? [...rows] : [];
      if (view.sort)
        sorted.sort((a, b) => {
          const x = a?.[view.sort!],
            y = b?.[view.sort!];
          const cmp =
            typeof x === "number" && typeof y === "number"
              ? x - y
              : text(x).localeCompare(text(y), "zh-CN", { numeric: true });
          return view.desc ? -cmp : cmp;
        });
      const pages = Math.max(1, Math.ceil(sorted.length / pageSize)),
        page = Math.min(view.tab ?? 0, pages - 1);
      return done(
        h("div", { ...props, class: `${props.class} a2ui-table` }, [
          h("table", {}, [
            h("caption", {}, [label || "数据表"]),
            h("thead", {}, [
              h(
                "tr",
                {},
                columns.map((col: any) =>
                  h(
                    "th",
                    {
                      scope: "col",
                      "aria-sort":
                        view.sort === col.key
                          ? view.desc
                            ? "descending"
                            : "ascending"
                          : "none",
                    },
                    [
                      button(text(resolve(col.label)), () =>
                        update({
                          sort: col.key,
                          desc: view.sort === col.key ? !view.desc : false,
                          tab: 0,
                        })
                      ),
                    ]
                  )
                )
              ),
            ]),
            h(
              "tbody",
              {},
              sorted.length
                ? sorted
                    .slice(page * pageSize, (page + 1) * pageSize)
                    .map((row: any) =>
                      h(
                        "tr",
                        {},
                        columns.map((col: any) =>
                          h("td", {}, [text(row?.[col.key])])
                        )
                      )
                    )
                : [
                    h("tr", {}, [
                      h("td", { colSpan: columns.length }, ["暂无数据"]),
                    ]),
                  ]
            ),
          ]),
          h("nav", { "aria-label": "数据表分页" }, [
            button("上一页", () => update({ tab: page - 1 }), {
              disabled: page === 0,
            }),
            h("span", { "aria-live": "polite" }, [`${page + 1} / ${pages}`]),
            button("下一页", () => update({ tab: page + 1 }), {
              disabled: page >= pages - 1,
            }),
          ]),
        ])
      );
    }
    default:
      return { handled: false };
  }
}
