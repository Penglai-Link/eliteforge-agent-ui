import { initializeCommonDemo } from "./demo";
import { initializeAtomicDemo } from "./demo";
import { catalog } from "./index";
import Ajv from "ajv/dist/2020.js";
import clientSchema from "./schemas/client_to_server.json";
import { describe, it, expect } from "vitest";
import { A2UIClient, VERSION, CATALOG_ID, readPath } from "./index";
import { createProfileDemo, profileMessages } from "./demo";
describe("A2UI state", () => {
  it("progressive profile and host roundtrip", () => {
    const d = createProfileDemo();
    while (!d.done) d.next();
    d.client.setValue("profile", "name", "Bob");
    const { message, metadata } = d.client.createAction("profile", "submit");
    expect(
      new Ajv({ strict: false, validateFormats: false }).compile(clientSchema)(
        message
      )
    ).toBe(true);
    expect(message.action.context).toEqual({
      name: "Bob",
      newsletter: false,
      role: ["developer"],
    });
    expect(metadata.a2uiClientDataModel?.surfaces.profile.name).toBe("Bob");
    d.onAction(message, metadata);
    expect(d.client.surface("profile").dataModel.status).toBe("已保存：Bob");
  });
  it("rejects invalid messages atomically", () => {
    const d = createProfileDemo();
    while (!d.done) d.next();
    const before = d.client.getSnapshot();
    for (const message of [
      { ...profileMessages[0], version: "v1.0" },
      profileMessages[0],
      {
        version: VERSION,
        updateComponents: {
          surfaceId: "profile",
          components: [
            { id: "valid", component: "Text", text: "x" },
            { id: "bad", component: "Text", text: 2 },
          ],
        },
      },
      {
        version: VERSION,
        updateComponents: {
          surfaceId: "profile",
          components: [{ id: "root", component: "Card", child: "root" }],
        },
      },
      {
        version: VERSION,
        updateDataModel: {
          surfaceId: "profile",
          path: "/__proto__/polluted",
          value: true,
        },
      },
    ])
      expect(() => d.client.apply(message)).toThrow();
    expect(d.client.getSnapshot()).toBe(before);
  });
  it("roundtrips isolated snapshots and deletion", () => {
    const d = createProfileDemo();
    while (!d.done) d.next();
    const snapshot = d.client.exportSnapshot(),
      restored = new A2UIClient();
    restored.importSnapshot(snapshot);
    expect(restored.exportSnapshot()).toEqual(snapshot);
    snapshot.surfaces.profile.dataModel.name = "mutated";
    expect(restored.surface("profile").dataModel.name).toBe("Alice");
    restored.apply({
      version: VERSION,
      updateDataModel: { surfaceId: "profile", path: "/name" },
    });
    expect(restored.surface("profile").dataModel).not.toHaveProperty("name");
    restored.apply({
      version: VERSION,
      deleteSurface: { surfaceId: "profile" },
    });
    expect(restored.getSnapshot().surfaces).toEqual({});
  });
  it("validates catalogs, bindings, and subscriptions", () => {
    const c = new A2UIClient();
    expect(() =>
      c.apply({
        version: VERSION,
        createSurface: { surfaceId: "x", catalogId: "unknown" },
      })
    ).toThrow();
    let count = 0;
    const off = c.subscribe(() => count++);
    c.apply({
      version: VERSION,
      createSurface: { surfaceId: "x", catalogId: CATALOG_ID },
    });
    off();
    c.apply({
      version: VERSION,
      updateDataModel: {
        surfaceId: "x",
        value: { "a/b": { "~key": 4 }, items: [{ name: "A" }] },
      },
    });
    expect(count).toBe(1);
    expect(readPath(c.surface("x").dataModel, "/a~1b/~0key")).toBe(4);
    expect(c.resolve("x", { path: "name" }, "/items/0")).toBe("A");
  });
});

it("collection scope resolves edits and action to the selected row", () => {
  const c = new A2UIClient();
  c.apply({
    version: VERSION,
    createSurface: { surfaceId: "s", catalogId: CATALOG_ID },
  });
  c.apply({
    version: VERSION,
    updateComponents: {
      surfaceId: "s",
      components: [
        {
          id: "root",
          component: "Column",
          children: { componentId: "row", path: "/items" },
        },
        { id: "row", component: "Row", children: ["input", "button"] },
        {
          id: "input",
          component: "TextField",
          label: "Name",
          value: { path: "name" },
        },
        {
          id: "button",
          component: "Button",
          child: "label",
          action: {
            event: { name: "save", context: { name: { path: "name" } } },
          },
        },
        { id: "label", component: "Text", text: "Save" },
      ],
    },
  });
  c.apply({
    version: VERSION,
    updateDataModel: {
      surfaceId: "s",
      value: { items: [{ name: "A" }, { name: "B" }] },
    },
  });
  c.setValue("s", "input", "C", "/items/1");
  expect(c.surface("s").dataModel.items).toEqual([
    { name: "A" },
    { name: "C" },
  ]);
  expect(
    c.createAction("s", "button", "/items/1").message.action.context.name
  ).toBe("C");
  const before = c.getSnapshot();
  const invalid = c.exportSnapshot();
  invalid.surfaces.s.components.root = { id: "root", component: "Unsupported" };
  expect(() => c.importSnapshot(invalid)).toThrow();
  expect(c.getSnapshot()).toBe(before);
  for (const path of ["/items/foo/name", "/items/3/name"])
    expect(() =>
      c.apply({
        version: VERSION,
        updateDataModel: { surfaceId: "s", path, value: "x" },
      })
    ).toThrow();
  expect(c.getSnapshot()).toBe(before);
});

it("host catalog extends validation without admitting unsupported components", () => {
  const schema = {
    ...catalog,
    components: {
      ...catalog.components,
      HostBadge: {
        type: "object",
        properties: {
          id: { type: "string" },
          component: { const: "HostBadge" },
          text: { type: "string" },
        },
        required: ["id", "component", "text"],
        additionalProperties: false,
      },
    },
    $defs: {
      ...catalog.$defs,
      anyComponent: {
        oneOf: [
          ...catalog.$defs.anyComponent.oneOf,
          { $ref: "#/components/HostBadge" },
        ],
      },
    },
  };
  const c = new A2UIClient([{ catalogId: "host:badge", schema }]);
  c.apply({
    version: VERSION,
    createSurface: { surfaceId: "custom", catalogId: "host:badge" },
  });
  c.apply({
    version: VERSION,
    updateComponents: {
      surfaceId: "custom",
      components: [{ id: "root", component: "HostBadge", text: "Ready" }],
    },
  });
  expect(c.surface("custom").components.root.text).toBe("Ready");
  expect(() =>
    c.apply({
      version: VERSION,
      updateComponents: {
        surfaceId: "custom",
        components: [{ id: "root", component: "Modal", url: "x" }],
      },
    })
  ).toThrow();
});

it("new atomic inputs enforce types and bounds without damaging state", () => {
  const c = new A2UIClient();
  initializeAtomicDemo(c);
  c.setValue("atoms", "volume", 42.5);
  c.setValue("atoms", "birthday", "2026-11-10");
  const before = c.getSnapshot();
  for (const value of [-1, 101, NaN, "45"])
    expect(() => c.setValue("atoms", "volume", value)).toThrow();
  for (const value of ["2027-01-01", "2026-02-30", "nonsense"])
    expect(() => c.setValue("atoms", "birthday", value)).toThrow();
  expect(c.getSnapshot()).toBe(before);
  const { message } = c.createAction("atoms", "save");
  expect(message.action.context.volume).toBe(42.5);
  expect(message.action.context.birthday).toBe("2026-11-10");
});

it("common input validation and structural cycles preserve prior state", () => {
  const c = new A2UIClient();
  initializeCommonDemo(c);
  const before = c.getSnapshot();
  for (const [id, value] of [
    ["quantity", 0],
    ["quantity", Infinity],
    ["team", "unknown"],
    ["enabled", "yes"],
  ])
    expect(() => c.setValue("common", id as string, value)).toThrow();
  for (const component of [
    { id: "tabs", component: "Tabs", tabs: [{ title: "loop", child: "tabs" }] },
    { id: "modal", component: "Modal", trigger: "open", content: "modal" },
  ])
    expect(() =>
      c.apply({
        version: VERSION,
        updateComponents: { surfaceId: "common", components: [component] },
      })
    ).toThrow();
  expect(c.getSnapshot()).toBe(before);
  c.setViewState("common", JSON.stringify(["tabs", ""]), { tab: 1 });
  const snapshot = c.exportSnapshot(),
    restored = new A2UIClient();
  restored.importSnapshot(snapshot);
  expect(
    restored.getViewState("common", JSON.stringify(["tabs", ""])).tab
  ).toBe(1);
  const corrupt = c.exportSnapshot();
  corrupt.surfaces.common.viewState![JSON.stringify(["tabs", ""])] = {
    tab: -1,
  };
  const stable = c.getSnapshot();
  expect(() => c.importSnapshot(corrupt)).toThrow();
  expect(c.getSnapshot()).toBe(stable);
});
