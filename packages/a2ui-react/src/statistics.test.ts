// @vitest-environment jsdom
import { it, expect } from "vitest";
import { A2UIClient, VERSION } from "@eliteforge/agent-ui-a2ui-core";
import { initializeStatisticsDemo } from "@eliteforge/agent-ui-a2ui-core/demo";
import { A2UISurface } from "./index";
import {
  assertStatistics,
  assertStatisticsUpdated,
} from "../../../tests/statistics-assertions";
import { createElement as h, act } from "react";
import { createRoot } from "react-dom/client";

it("statistics render, update, restore and handle missing/negative data", async () => {
  const client = new A2UIClient(),
    host = document.createElement("div");
  document.body.append(host);
  const update = initializeStatisticsDemo(client);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(host);
  await act(async () =>
    root.render(
      h(A2UISurface, { client, surfaceId: "statistics", onAction: update })
    )
  );
  const flush = async (fn: () => void) => {
    await act(async () => fn());
  };
  const dispose = async () => {
    await act(async () => root.unmount());
  };
  try {
    assertStatistics(host);
    await flush(() =>
      (
        host.querySelector("[data-a2ui-component=refresh]") as HTMLButtonElement
      ).click()
    );
    assertStatisticsUpdated(host);
    const snapshot = client.exportSnapshot();
    await flush(() => client.importSnapshot(snapshot));
    assertStatisticsUpdated(host);
    await flush(() =>
      client.apply({
        version: VERSION,
        updateDataModel: {
          surfaceId: "statistics",
          path: "/series",
          value: [{ name: "负值", values: [-10, 0, null, -5, 8, 8, 8] }],
        },
      })
    );
    expect(
      host.querySelector("[data-chart-type=bar] rect")?.getAttribute("height")
    ).not.toBe("0");
    expect(
      host.querySelector("[data-chart-type=line] path")?.getAttribute("d")
    ).toContain("M");
    expect(host.innerHTML).not.toMatch(/NaN|Infinity/);
    await flush(() =>
      client.apply({
        version: VERSION,
        updateDataModel: {
          surfaceId: "statistics",
          path: "/distribution",
          value: [{ name: "空分布", values: [0, -3, null] }],
        },
      })
    );
    expect(
      host.querySelector("[data-a2ui-component=chart-pie]")?.textContent
    ).toContain("暂无数据");
    await flush(() =>
      client.apply({
        version: VERSION,
        updateDataModel: {
          surfaceId: "statistics",
          path: "/distribution",
          value: [{ name: "单一来源", values: [100, 0, 0] }],
        },
      })
    );
    expect(
      host.querySelector("[data-chart-type=pie] circle")?.getAttribute("r")
    ).toBe("95");
    await flush(() =>
      client.apply({
        version: VERSION,
        updateDataModel: {
          surfaceId: "statistics",
          path: "/points",
          value: [5],
        },
      })
    );
    expect(
      host.querySelector(".a2ui-sparkline circle")?.getAttribute("cy")
    ).toBe("36");
  } finally {
    await dispose();
    host.remove();
  }
});

it("renders all 39 independently named gallery components", async () => {
  const { initializeComponentGallery } = await import(
    "@eliteforge/agent-ui-a2ui-core/demo"
  );
  const gallery = initializeComponentGallery();
  const host = document.createElement("div");
  document.body.append(host);
  const nodes = gallery.entries.map((entry) =>
    h("section", { key: entry.name, "data-example": entry.name }, [
      h("h3", {}, entry.name),
      h(A2UISurface, { client: gallery.client, surfaceId: entry.surfaceId }),
    ])
  );
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(host);
  await act(async () => root.render(h("div", {}, nodes)));
  try {
    expect(host.querySelectorAll("[data-example]")).toHaveLength(39);
    for (const entry of gallery.entries) {
      const section = host.querySelector(`[data-example="${entry.name}"]`)!;
      expect(section.querySelector("h3")?.textContent).toBe(entry.name);
      expect(
        section
          .querySelector(".a2ui-surface > [data-a2ui-component=root]")
          ?.classList.contains(`a2ui-${entry.name.toLowerCase()}`)
      ).toBe(true);
    }
    expect(
      host.querySelector("[data-a2ui-missing], [data-a2ui-unsupported]")
    ).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
