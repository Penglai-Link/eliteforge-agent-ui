import { expect } from "vitest";
import type { A2UIClient } from "../packages/a2ui-core/src/index";
export async function exerciseShadcn(
  host: HTMLElement,
  client: A2UIClient,
  flush: (fn: () => void) => Promise<void>,
  actions: any[]
) {
  const section = (name: string) =>
    host.querySelector(`[data-example="${name}"]`)!;
  const control = (name: string, selector: string) =>
    section(name).querySelector(selector) as HTMLElement;
  const click = async (name: string, selector = "button") =>
    flush(() => control(name, selector).click());
  const input = async (name: string, value: string, selector = "input") =>
    flush(() => {
      const element = control(name, selector) as HTMLInputElement;
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const value = (name: string, path: string) =>
    client.surface(`gallery-${name}`).dataModel[path];
  await click("Accordion", "h3:nth-of-type(1) button");
  expect(control("Accordion", "button").getAttribute("aria-expanded")).toBe(
    "true"
  );
  await click("Accordion", "section:nth-child(2) button");
  expect(control("Accordion", "button").getAttribute("aria-expanded")).toBe(
    "false"
  );
  expect(
    control("Accordion", "section:nth-child(3) button").hasAttribute("disabled")
  ).toBe(true);
  await flush(() =>
    client.apply({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "gallery-Accordion",
        components: [
          {
            ...client.surface("gallery-Accordion").components.root,
            multiple: true,
          },
        ],
      },
    })
  );
  await click("Accordion");
  expect(
    section("Accordion").querySelectorAll('[aria-expanded="true"]')
  ).toHaveLength(2);
  await input("Textarea", "updated notes", "textarea");
  expect(value("Textarea", "notes")).toBe("updated notes");
  await input("InputOTP", "a1234567");
  expect(value("InputOTP", "otp")).toBe("123456");
  await click("Toggle");
  expect(control("Toggle", "button").getAttribute("aria-pressed")).toBe("true");
  await click("ToggleGroup");
  expect(value("ToggleGroup", "styles")).toEqual(["bold"]);
  await click("Pagination", "button:last-child");
  expect(value("Pagination", "page")).toBe(2);
  await input("Combobox", "Vue");
  expect(section("Combobox").querySelectorAll("[role=option]")).toHaveLength(1);
  await click("Combobox", "[role=option]");
  expect(value("Combobox", "framework")).toBe("vue");
  await input("Command", "React");
  await flush(() =>
    control("Command", "input").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  );
  expect(value("Command", "command")).toBe("react");
  await click("Calendar", '[data-date="2026-10-12"]');
  expect(value("Calendar", "date")).toBe("2026-10-12");
  expect(
    (control("Calendar", '[data-date="2026-09-30"]') as HTMLButtonElement)
      .disabled
  ).toBe(true);
  for (const name of [
    "Popover",
    "DatePicker",
    "Drawer",
    "Sheet",
    "AlertDialog",
  ]) {
    await click(name);
    expect(
      section(name).querySelector("dialog[open], .a2ui-popup:not([hidden])")
    ).not.toBeNull();
    if (["Drawer", "Sheet", "AlertDialog"].includes(name))
      await click(name, "dialog button");
    else
      await flush(() =>
        control(name, ".a2ui-popup").dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        )
      );
  }
  await click("AlertDialog");
  await click("AlertDialog", "dialog button[data-variant=primary]");
  expect(actions.some((action) => action.action.name === "confirmDelete")).toBe(
    true
  );
  for (const name of ["DropdownMenu", "ContextMenu", "Menubar"]) {
    if (name === "ContextMenu")
      await flush(() =>
        control(name, ".a2ui-contextmenu").dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true })
        )
      );
    else await click(name);
    expect(
      control(name, "[role=menu] [role=menuitem]:nth-child(2)"),
      name
    ).not.toBeNull();
    await click(name, "[role=menu] [role=menuitem]:nth-child(2)");
    expect(value(name, "menu")).toBe("vue");
  }
  expect(
    actions.filter((action) => action.action.name === "selectFramework")
  ).toHaveLength(3);
  expect(
    actions
      .filter((action) => action.action.name === "selectFramework")
      .every((action) => action.action.context.selected === "vue")
  ).toBe(true);
  await click("Carousel", "button:last-child");
  expect(section("Carousel").textContent).toContain("第二段");
  await flush(() =>
    control("Resizable", "[role=separator]").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    )
  );
  expect(
    control("Resizable", "[role=separator]").getAttribute("aria-valuenow")
  ).toBe("55");
  await click("Toast");
  expect(section("Toast").textContent).toContain("显示通知");
  await click("DataTable", "th:nth-child(2) button");
  expect(section("DataTable").querySelector("tbody tr")?.textContent).toContain(
    "Bob"
  );
  await click("DataTable", "nav button:last-child");
  expect(section("DataTable").textContent).toContain("2 / 2");
  const snapshot = client.exportSnapshot();
  await flush(() => client.importSnapshot(snapshot));
  expect(
    control("Resizable", "[role=separator]").getAttribute("aria-valuenow")
  ).toBe("55");
  expect(section("Carousel").textContent).toContain("第二段");
  expect(value("Pagination", "page")).toBe(2);
}
