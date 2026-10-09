import { initializeCommonDemo } from "@eliteforge/agent-ui-a2ui-core/demo";
import { initializeAtomicDemo } from "@eliteforge/agent-ui-a2ui-core/demo";
// @vitest-environment jsdom
import { it, expect } from "vitest";
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";
import { A2UISurface } from "./index";
import { createProfileDemo } from "@eliteforge/agent-ui-a2ui-core/demo";
it("progressive UI, form edits, action and host update", async () => {
  const d = createProfileDemo(),
    host = document.createElement("div");
  document.body.append(host);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  let action: any;
  const onAction = (message: any, metadata: any) => {
    action = { message, metadata };
    d.onAction(message, metadata);
  };
  const root = createRoot(host);
  await act(async () =>
    root.render(
      h(A2UISurface, {
        client: d.client,
        surfaceId: "profile",
        onAction,
        components: {
          Text: (ctx: any) =>
            h(
              "span",
              { "data-host": "text" },
              String(ctx.resolve(ctx.component.text) ?? "")
            ),
        },
      })
    )
  );
  const flush = async (fn: () => void) => {
    await act(async () => fn());
  };
  const dispose = async () => {
    await act(async () => root.unmount());
  };
  await flush(() => {
    d.next();
    d.next();
  });
  expect(host.querySelector("[data-a2ui-missing=name]")).not.toBeNull();
  await flush(() => {
    d.next();
    d.next();
  });
  expect(host.textContent).toContain("修改资料");
  expect(host.querySelector("[data-host=text]")).not.toBeNull();
  const name = host.querySelector(
    "input:not([type=checkbox]):not([type=radio])"
  ) as HTMLInputElement;
  await flush(() => {
    name.value = "Bob";
    name.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const checkbox = host.querySelector(
    "input[type=checkbox]"
  ) as HTMLInputElement;
  await flush(() => checkbox.click());
  const radios = host.querySelectorAll("input[type=radio]");
  await flush(() => {
    (radios[1] as HTMLInputElement).click();
  });
  await flush(() => {
    (host.querySelector(".a2ui-button") as HTMLButtonElement).click();
  });
  expect(action.message.action.context).toEqual({
    name: "Bob",
    newsletter: true,
    role: ["designer"],
  });
  expect(host.textContent).toContain("已保存：Bob");
  await dispose();
  host.remove();
});

it("renders and edits additional atomic components consistently", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const d = createProfileDemo(),
    host = document.createElement("div");
  document.body.append(host);
  const handler = initializeAtomicDemo(d.client);
  let action: any;
  const onAction = (message: any, metadata: any) => {
    action = message;
    handler(message, metadata);
  };
  const root = createRoot(host);
  await act(async () =>
    root.render(
      h(A2UISurface, { client: d.client, surfaceId: "atoms", onAction })
    )
  );
  const flush = async (fn: () => void) => {
    await act(async () => fn());
  };
  const dispose = async () => {
    await act(async () => root.unmount());
  };
  expect(host.querySelector("img")?.getAttribute("alt")).toBe("本地示例插画");
  expect(host.querySelector("svg path")).not.toBeNull();
  expect(
    host.querySelector("[role=separator]")?.getAttribute("aria-orientation")
  ).toBe("horizontal");
  expect(host.querySelector("video")?.hasAttribute("controls")).toBe(true);
  expect(host.querySelector("audio")?.getAttribute("preload")).toBe("none");
  const range = host.querySelector("input[type=range]") as HTMLInputElement,
    date = host.querySelector("input[type=date]") as HTMLInputElement,
    time = host.querySelector("input[type=time]") as HTMLInputElement,
    datetime = host.querySelector(
      "input[type=datetime-local]"
    ) as HTMLInputElement;
  await flush(() => {
    range.value = "70";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    date.value = "2026-12-01";
    date.dispatchEvent(new Event("input", { bubbles: true }));
    time.value = "15:45:00";
    time.dispatchEvent(new Event("input", { bubbles: true }));
    datetime.value = "2026-11-01T10:30:00";
    datetime.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flush(() => {
    (host.querySelector("button") as HTMLButtonElement).click();
  });
  expect(action.action.context).toEqual({
    volume: 70,
    birthday: "2026-12-01",
    time: "15:45:00",
    appointment: new Date("2026-11-01T10:30:00").toISOString(),
  });
  expect(host.textContent).toContain("已保存偏好：音量 70");
  await flush(() =>
    d.client.apply({
      version: "v0.9.1",
      updateComponents: {
        surfaceId: "atoms",
        components: [
          { id: "image", component: "Image", url: "javascript:alert(1)" },
        ],
      },
    })
  );
  expect(host.querySelector("img")?.hasAttribute("src")).toBe(false);
  await dispose();
  host.remove();
});

it("common components edit, navigate, open modal and restore view state", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const d = createProfileDemo(),
    host = document.createElement("div");
  document.body.append(host);
  const handle = initializeCommonDemo(d.client);
  let action: any;
  let actions = 0;
  const onAction = (message: any, metadata: any) => {
    action = message;
    actions++;
    handle(message, metadata);
  };
  const root = createRoot(host);
  await act(async () =>
    root.render(
      h(A2UISurface, { client: d.client, surfaceId: "common", onAction })
    )
  );
  const flush = async (fn: () => void) => {
    await act(async () => fn());
  };
  const dispose = async () => {
    await act(async () => root.unmount());
  };
  expect(host.querySelectorAll("[role=listitem]").length).toBe(2);
  expect(host.querySelector("table")?.textContent).toContain("Alice");
  const quantity = host.querySelector("input[type=number]") as HTMLInputElement,
    select = host.querySelector("select") as HTMLSelectElement,
    toggle = host.querySelector("[role=switch]") as HTMLInputElement;
  await flush(() => {
    quantity.value = "5";
    quantity.dispatchEvent(new Event("input", { bubbles: true }));
    select.value = "design";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    toggle.click();
  });
  await flush(() => {
    (
      host.querySelector("[data-a2ui-component=save]") as HTMLButtonElement
    ).click();
  });
  expect(action.action.context).toEqual({
    quantity: 5,
    team: "design",
    enabled: false,
  });
  expect(host.textContent).toContain("已保存设置");
  const tabs = host.querySelectorAll("[role=tab]");
  await flush(() => {
    (tabs[1] as HTMLButtonElement).click();
  });
  expect(tabs[1].getAttribute("aria-selected")).toBe("true");
  expect(host.querySelector("progress")?.value).toBe(65);
  expect(host.querySelector("[role=tabpanel]")?.textContent).toContain(
    "暂无记录"
  );
  expect(host.querySelector("a")?.getAttribute("rel")).toBe(
    "noopener noreferrer"
  );
  await flush(() => {
    tabs[1].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
    );
  });
  expect(host.querySelector("[role=tabpanel]")?.textContent).toContain("成员");
  await flush(() => {
    (
      host.querySelector("[data-a2ui-component=open]") as HTMLButtonElement
    ).click();
  });
  expect(host.querySelector("dialog")?.hasAttribute("open")).toBe(true);
  expect(actions).toBe(1);
  const snapshot = d.client.exportSnapshot();
  await flush(() => d.client.importSnapshot(snapshot));
  expect(host.querySelector("dialog")?.hasAttribute("open")).toBe(true);
  await flush(() => {
    (host.querySelector("dialog>button") as HTMLButtonElement).click();
  });
  expect(host.querySelector("dialog")?.hasAttribute("open")).toBe(false);
  await flush(() => {
    const details = host.querySelector("details")!;
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
  expect(
    d.client.surface("common").viewState?.[JSON.stringify(["accordion", ""])]
      .open
  ).toBe(true);
  await dispose();
  host.remove();
});
