import type { RenderContext } from "./index";
import type { Element } from "./common-components";

const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const string = (v: unknown) => (v == null ? "" : String(v));
const colors = [
  "var(--agent-ui-a2ui-chart-color-1, var(--color-accent, #3568a8))",
  "var(--agent-ui-a2ui-chart-color-2, var(--color-success, #16857b))",
  "var(--agent-ui-a2ui-chart-color-3, var(--color-warning, #ae6429))",
  "var(--agent-ui-a2ui-chart-color-4, #8756aa)",
  "var(--agent-ui-a2ui-chart-color-5, #b34c6a)",
];
export function formatStatistic(
  value: unknown,
  precision?: number,
  grouping = true
): string {
  return finite(value)
    ? new Intl.NumberFormat("zh-CN", {
        useGrouping: grouping,
        minimumFractionDigits: precision ?? 0,
        maximumFractionDigits: precision ?? 2,
      }).format(value)
    : "—";
}

/** Shared DOM/SVG renderer: adapters provide React or Vue elements. */
export function renderStatistics(
  ctx: RenderContext,
  h: Element,
  props: Record<string, any>
): { handled: boolean; node?: any } {
  const { component: c, resolve } = ctx;
  const label = string(resolve(c.label));
  const value = resolve(c.value);
  const done = (node: any) => ({ handled: true, node });
  const empty = () =>
    h("p", { role: "status", class: "a2ui-data-empty" }, ["暂无数据"]);
  switch (c.component) {
    case "Statistic":
      return done(
        h("div", props, [
          h("div", { class: "a2ui-statistic-label" }, [label]),
          h("div", { class: "a2ui-statistic-value" }, [
            string(resolve(c.prefix)),
            formatStatistic(value, c.precision, c.grouping),
            h("small", {}, [string(resolve(c.unit))]),
          ]),
        ])
      );
    case "Trend": {
      const direction = !finite(value)
        ? "unknown"
        : value > 0
        ? "up"
        : value < 0
        ? "down"
        : "flat";
      const sentiment =
        direction === "unknown" || direction === "flat"
          ? "neutral"
          : value > 0 === (c.positiveIsGood !== false)
          ? "good"
          : "bad";
      return done(
        h(
          "div",
          {
            ...props,
            "data-direction": direction,
            "data-sentiment": sentiment,
          },
          [
            h("span", { "aria-hidden": true }, [
              direction === "up" ? "↑ " : direction === "down" ? "↓ " : "− ",
            ]),
            h("span", {}, [
              label,
              label ? " " : "",
              finite(value) && value > 0 ? "+" : "",
              formatStatistic(value, c.precision),
              string(resolve(c.unit)),
            ]),
          ]
        )
      );
    }
    case "Meter": {
      const min = c.min ?? 0,
        max = c.max ?? 100;
      if (!finite(value) || max <= min)
        return done(h("div", props, [label, empty()]));
      const clamped = Math.min(max, Math.max(min, value));
      const low = Math.min(max, Math.max(min, c.low ?? min));
      const high = Math.min(max, Math.max(low, c.high ?? max));
      return done(
        h("div", props, [
          h("span", {}, [label]),
          h(
            "meter",
            {
              min,
              max,
              low,
              high,
              optimum: Math.min(max, Math.max(min, c.optimum ?? max)),
              value: clamped,
              "aria-label": label || "用量",
              "aria-valuetext": `${formatStatistic(value)}${string(
                resolve(c.unit)
              )}`,
            },
            []
          ),
          h("span", {}, [
            `${formatStatistic(value)} / ${formatStatistic(max)}${string(
              resolve(c.unit)
            )}`,
          ]),
        ])
      );
    }
    case "DescriptionList": {
      const items = resolve(c.items);
      return done(
        h("section", props, [
          label ? h("strong", {}, [label]) : null,
          Array.isArray(items) && items.length
            ? h(
                "dl",
                {},
                items.flatMap((item: any) => [
                  h("dt", {}, [string(item?.label)]),
                  h("dd", {}, [item?.value == null ? "—" : string(item.value)]),
                ])
              )
            : empty(),
        ])
      );
    }
    case "Sparkline": {
      const data = resolve(c.values);
      if (!Array.isArray(data) || !data.some(finite))
        return done(h("div", props, [label, empty()]));
      const numbers = data.filter(finite),
        min = Math.min(...numbers),
        max = Math.max(...numbers);
      const x = (i: number) => 8 + (i / Math.max(1, data.length - 1)) * 224;
      const y = (v: number) =>
        max === min ? 36 : 64 - ((v - min) / (max - min)) * 56;
      let start = true;
      const path = data
        .map((v, i) => {
          if (!finite(v)) {
            start = true;
            return "";
          }
          const cmd = `${start ? "M" : "L"}${x(i)},${y(v)}`;
          start = false;
          return cmd;
        })
        .join(" ");
      return done(
        h("figure", props, [
          label ? h("figcaption", {}, [label]) : null,
          h(
            "svg",
            {
              viewBox: "0 0 240 72",
              role: "img",
              "aria-label": `${label || "趋势"}：${data
                .map((v) => (finite(v) ? v : "缺失"))
                .join("、")}`,
            },
            [
              h(
                "path",
                {
                  d: path,
                  fill: "none",
                  stroke: colors[0],
                  strokeWidth: "var(--agent-ui-a2ui-chart-stroke-width, 2)",
                },
                []
              ),
              ...data.flatMap((v, i) =>
                finite(v)
                  ? [
                      h(
                        "circle",
                        {
                          cx: x(i),
                          cy: y(v),
                          r: "var(--agent-ui-a2ui-sparkline-point-radius, 2.5)",
                          fill: colors[0],
                        },
                        []
                      ),
                    ]
                  : []
              ),
            ]
          ),
        ])
      );
    }
    case "Chart": {
      const rawLabels = resolve(c.labels),
        rawSeries = resolve(c.series);
      const labels: string[] = Array.isArray(rawLabels)
        ? rawLabels.map(string)
        : [];
      const circular = c.type === "pie" || c.type === "donut";
      // Pie/donut represent one distribution; additional series remain available in the data table.
      const series = Array.isArray(rawSeries)
        ? rawSeries.filter((s: any) => s && Array.isArray(s.values))
        : [];
      const plotted = circular ? series.slice(0, 1) : series;
      const numbers: number[] = plotted.flatMap((s: any) =>
        s.values.slice(0, labels.length).filter(finite)
      );
      if (!labels.length || !numbers.length)
        return done(h("figure", props, [label, empty()]));
      const min = Math.min(0, ...numbers),
        max = Math.max(0, ...numbers);
      const span = max - min || 1;
      const x = (i: number) => 48 + ((i + 0.5) / labels.length) * 540;
      const y = (v: number) => 220 - ((v - min) / span) * 190;
      const marks: any[] = [];
      if (circular) {
        const values = labels.map((_, i) =>
          finite(plotted[0].values[i]) ? Math.max(0, plotted[0].values[i]) : 0
        );
        const total = values.reduce((a, b) => a + b, 0);
        if (total <= 0) return done(h("figure", props, [label, empty()]));
        let offset = 0;
        values.forEach((v, i) => {
          if (!v) return;
          const start = (offset / total) * 2 * Math.PI - Math.PI / 2;
          offset += v;
          const end = (offset / total) * 2 * Math.PI - Math.PI / 2;
          const fill = colors[i % colors.length];
          const title = h("title", {}, [
            `${labels[i]}：${formatStatistic(v)} (${formatStatistic(
              (v / total) * 100
            )}%)`,
          ]);
          if (v === total)
            marks.push(h("circle", { cx: 310, cy: 125, r: 95, fill }, [title]));
          else
            marks.push(
              h(
                "path",
                {
                  d: `M310,125 L${310 + 95 * Math.cos(start)},${
                    125 + 95 * Math.sin(start)
                  } A95,95 0 ${end - start > Math.PI ? 1 : 0},1 ${
                    310 + 95 * Math.cos(end)
                  },${125 + 95 * Math.sin(end)} Z`,
                  fill,
                },
                [title]
              )
            );
        });
        if (c.type === "donut")
          marks.push(
            h(
              "circle",
              { cx: 310, cy: 125, r: 56, class: "a2ui-donut-hole" },
              []
            )
          );
      } else {
        marks.push(
          h(
            "line",
            {
              x1: 48,
              x2: 588,
              y1: y(0),
              y2: y(0),
              stroke: "currentColor",
              opacity: "var(--agent-ui-a2ui-chart-axis-opacity, 0.3)",
            },
            []
          )
        );
        for (const tick of [min, max])
          marks.push(
            h(
              "text",
              {
                x: 42,
                y: y(tick),
                textAnchor: "end",
                fontSize: "var(--agent-ui-a2ui-chart-label-font-size, 11px)",
                fill: "currentColor",
              },
              [formatStatistic(tick)]
            )
          );
        plotted.forEach((s: any, j: number) => {
          const color = colors[j % colors.length];
          const width = 540 / labels.length / (plotted.length + 1);
          if (c.type === "bar")
            labels.forEach((_, i) => {
              const v = s.values[i];
              if (!finite(v)) return;
              marks.push(
                h(
                  "rect",
                  {
                    x: x(i) - (width * plotted.length) / 2 + j * width,
                    y: Math.min(y(v), y(0)),
                    width: width * 0.9,
                    height: Math.abs(y(v) - y(0)),
                    fill: color,
                  },
                  [h("title", {}, [`${s.name} / ${labels[i]}：${v}`])]
                )
              );
            });
          else {
            // Split at nulls so missing observations are never connected or filled.
            const segments: { i: number; v: number }[][] = [];
            let segment: { i: number; v: number }[] = [];
            labels.forEach((_, i) => {
              const v = s.values[i];
              if (finite(v)) segment.push({ i, v });
              else if (segment.length) {
                segments.push(segment);
                segment = [];
              }
            });
            if (segment.length) segments.push(segment);
            segments.forEach((points) => {
              const d = points
                .map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.v)}`)
                .join(" ");
              if (c.type === "area")
                marks.push(
                  h(
                    "path",
                    {
                      d: `${d} L${x(points.at(-1)!.i)},${y(0)} L${x(
                        points[0].i
                      )},${y(0)} Z`,
                      fill: color,
                      opacity: "var(--agent-ui-a2ui-chart-area-opacity, 0.18)",
                    },
                    []
                  )
                );
              marks.push(
                h(
                  "path",
                  {
                    d,
                    fill: "none",
                    stroke: color,
                    strokeWidth: "var(--agent-ui-a2ui-chart-stroke-width, 2)",
                  },
                  []
                )
              );
              points.forEach((p) =>
                marks.push(
                  h(
                    "circle",
                    {
                      cx: x(p.i),
                      cy: y(p.v),
                      r: "var(--agent-ui-a2ui-chart-point-radius, 3)",
                      fill: color,
                    },
                    [h("title", {}, [`${s.name} / ${labels[p.i]}：${p.v}`])]
                  )
                )
              );
            });
          }
        });
        labels.forEach((text, i) =>
          marks.push(
            h(
              "text",
              {
                x: x(i),
                y: 244,
                textAnchor: "middle",
                fontSize: "var(--agent-ui-a2ui-chart-label-font-size, 11px)",
                fill: "currentColor",
              },
              [text]
            )
          )
        );
      }
      const legend = circular
        ? labels
        : plotted.map((s: any) => string(s.name));
      return done(
        h("figure", { ...props, "data-chart-type": c.type }, [
          label ? h("figcaption", {}, [label]) : null,
          h(
            "svg",
            {
              viewBox: "0 0 620 260",
              role: "img",
              "aria-label": label || "统计图表",
            },
            marks
          ),
          h(
            "ul",
            { class: "a2ui-chart-legend", "aria-label": "图例" },
            legend.map((name, i) =>
              h("li", {}, [
                h(
                  "span",
                  {
                    style: { backgroundColor: colors[i % colors.length] },
                    "aria-hidden": true,
                  },
                  []
                ),
                name,
              ])
            )
          ),
          h("details", {}, [
            h("summary", {}, ["查看数据"]),
            h("div", { class: "a2ui-table" }, [
              h("table", {}, [
                h("caption", {}, [label || "图表数据"]),
                h("thead", {}, [
                  h("tr", {}, [
                    h("th", { scope: "col" }, ["维度"]),
                    ...series.map((s: any) =>
                      h("th", { scope: "col" }, [string(s.name)])
                    ),
                  ]),
                ]),
                h(
                  "tbody",
                  {},
                  labels.map((name, i) =>
                    h("tr", {}, [
                      h("th", { scope: "row" }, [name]),
                      ...series.map((s: any) =>
                        h("td", {}, [formatStatistic(s.values[i])])
                      ),
                    ])
                  )
                ),
              ]),
            ]),
          ]),
        ])
      );
    }
    default:
      return { handled: false };
  }
}
