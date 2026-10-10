import { expect, it } from "vitest";
import { formatStatistic, renderStatistics } from "./statistics-components";
import type { RenderContext } from "./index";
it("formats numeric values without treating missing values as zero", () => {
  expect(formatStatistic(1234.5, 2)).toBe("1,234.50");
  expect(formatStatistic(-1234.5, 1, false)).toBe("-1234.5");
  expect(formatStatistic(0)).toBe("0");
  for (const value of [null, undefined, NaN, Infinity, "12"])
    expect(formatStatistic(value)).toBe("—");
});
it("meter normalizes thresholds and rejects an inverted range", () => {
  const h = (tag: string, attrs: any, children: any[]) => ({
    tag,
    attrs,
    children,
  });
  const render = (component: any) =>
    renderStatistics(
      { component, resolve: (v: any) => v } as RenderContext,
      h,
      {}
    );
  const valid = render({
    component: "Meter",
    value: 200,
    min: 0,
    max: 100,
    low: 120,
    high: -20,
    optimum: 300,
  }).node;
  expect(valid.children[1].attrs).toMatchObject({
    value: 100,
    low: 100,
    high: 100,
    optimum: 100,
  });
  const invalid = render({
    component: "Meter",
    value: 1,
    min: 10,
    max: 0,
  }).node;
  expect(invalid.children[1].children).toEqual(["暂无数据"]);
});
