import { expect } from "vitest";
export function assertStatistics(host: HTMLElement) {
  expect(host.textContent).toContain("128,650.50");
  expect(host.querySelectorAll(".a2ui-chart[data-chart-type]")).toHaveLength(5);
  expect(host.querySelectorAll(".a2ui-chart table")).toHaveLength(5);
  expect(
    host.querySelector(".a2ui-sparkline path")?.getAttribute("d")?.match(/M/g)
  ).toHaveLength(2);
  expect(host.querySelector(".a2ui-sparkline svg")?.namespaceURI).toBe(
    "http://www.w3.org/2000/svg"
  );
  expect(
    host.querySelector(".a2ui-chart text")?.getAttribute("text-anchor")
  ).toBe("end");
  expect(
    host
      .querySelector("[data-a2ui-component=decline]")
      ?.getAttribute("data-sentiment")
  ).toBe("good");
  expect(
    host
      .querySelector("[data-a2ui-component=negative]")
      ?.getAttribute("data-sentiment")
  ).toBe("bad");
  expect(
    host
      .querySelector("[data-a2ui-component=flat]")
      ?.getAttribute("data-direction")
  ).toBe("flat");
  expect(host.querySelector("meter")?.value).toBe(72);
  expect(host.querySelector("meter")?.getAttribute("high")).toBe("85");
  expect(host.querySelectorAll("dl dt")).toHaveLength(3);
  expect(
    host.querySelector("[data-a2ui-component=empty-stat]")?.textContent
  ).toContain("—");
  expect(
    host.querySelector("[data-a2ui-component=empty-chart]")?.textContent
  ).toContain("暂无数据");
  expect(host.querySelector("[data-a2ui-unsupported]")).toBeNull();
  expect(host.innerHTML).not.toMatch(/NaN|Infinity/);
}
export function assertStatisticsUpdated(host: HTMLElement) {
  expect(host.textContent).toContain("129,650.50");
  expect(
    host
      .querySelector("[data-a2ui-component=growth]")
      ?.getAttribute("data-direction")
  ).toBe("down");
  expect(host.querySelector("meter")?.value).toBe(92);
  expect(
    host.querySelector("[data-chart-type=line] tbody")?.textContent
  ).toContain("61");
}
