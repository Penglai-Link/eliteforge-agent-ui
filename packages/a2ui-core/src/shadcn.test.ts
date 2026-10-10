import { expect, it } from "vitest";
import { A2UIClient, VERSION, CATALOG_ID, AGENT_CATALOG_ID } from "./index";
import { initializeComponentGallery, initializeShadcnDemo } from "./demo";
it("validates new input boundaries without corrupting the model", () => {
  const gallery = initializeComponentGallery(),
    client = gallery.client;
  for (const [name, values] of Object.entries({
    InputOTP: ["x123", "1234567"],
    Calendar: ["2026-02-30", "2026-09-30", "wrong"],
    DatePicker: ["2027-01-01"],
    Toggle: ["yes"],
    ToggleGroup: [["missing"], ["bold", "bold"]],
    Pagination: [0, 13, 1.5],
    Combobox: ["missing", "disabled"],
    Command: [42],
    DropdownMenu: ["disabled"],
    ContextMenu: [null],
    Menubar: [false],
    Textarea: [12],
  })) {
    const before = client.exportSnapshot();
    for (const value of values)
      expect(() => client.setValue(`gallery-${name}`, "root", value)).toThrow();
    expect(client.exportSnapshot()).toEqual(before);
  }
});
it("new schemas reject malformed inputs in both catalogs", () => {
  for (const catalogId of [CATALOG_ID, AGENT_CATALOG_ID]) {
    const client = new A2UIClient();
    client.apply({
      version: VERSION,
      createSurface: { surfaceId: "s", catalogId },
    });
    for (const component of [
      { component: "InputOTP", value: "", length: 0 },
      { component: "Resizable", children: ["one"] },
      { component: "Calendar", value: "", min: "not-date" },
      { component: "DropdownMenu", label: "Menu", value: "", options: [] },
      { component: "Pagination", value: 1, totalPages: 0 },
      { component: "Accordion", title: "Missing content" },
      {
        component: "Accordion",
        items: [{ id: "one", title: "Missing child" }],
      },
    ]) {
      expect(() =>
        client.apply({
          version: VERSION,
          updateComponents: {
            surfaceId: "s",
            components: [{ id: "root", ...component }],
          },
        })
      ).toThrow();
    }
  }
});
it("expanded and layout view state round-trip and reject invalid snapshot state", () => {
  const client = new A2UIClient();
  initializeShadcnDemo(client);
  const key = JSON.stringify(["grouped-accordion", ""]);
  client.setViewState("shadcn", key, {
    expanded: ["one", "two"],
    query: "React",
    size: 60,
    sort: "count",
    desc: true,
    month: "2026-10-01",
  });
  const snapshot = client.exportSnapshot();
  client.importSnapshot(snapshot);
  expect(client.getViewState("shadcn", key).expanded).toEqual(["one", "two"]);
  for (const value of [
    { size: 0 },
    { month: "bad" },
    { expanded: [5] },
    { query: 2 },
    { desc: "true" },
  ])
    expect(() => client.setViewState("shadcn", key, value as any)).toThrow();
});
