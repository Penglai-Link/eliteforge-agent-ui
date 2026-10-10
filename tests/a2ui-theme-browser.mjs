/** Run against either live demo using Playwright CLI run-code; no test-runner dependency. */
export async function verifyA2UITheme(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const originalStyle = root.getAttribute("style");
    const originalTheme = root.getAttribute("data-theme");
    const checks = [];
    const check = (name, actual, expected) => {
      if (actual !== expected)
        throw new Error(`${name}: ${actual} !== ${expected}`);
      checks.push(name);
    };
    const element = (name, selector) =>
      document.querySelector(`[data-demo-component="${name}"] ${selector}`);
    try {
      root.style.setProperty("--agent-ui-a2ui-icon-size", "32px");
      root.style.setProperty("--agent-ui-a2ui-icon-stroke-width", "3");
      const input = element("TextField", "input"),
        button = element("Button", "button");
      root.style.setProperty("--agent-ui-control-padding", "30px");
      root.style.setProperty("--agent-ui-control-font-size", "20px");
      root.style.setProperty("--agent-ui-control-radius", "12px");
      root.style.setProperty("--agent-ui-control-height", "48px");
      root.style.setProperty("--agent-ui-transition-duration", "900ms");
      root.style.setProperty(
        "--agent-ui-a2ui-statistic-value-font-size",
        "40px"
      );
      root.style.setProperty(
        "--agent-ui-a2ui-chart-color-1",
        "rgb(230, 20, 180)"
      );
      root.style.setProperty("--agent-ui-a2ui-chart-stroke-width", "4");
      root.style.setProperty(
        "--agent-ui-a2ui-color-card-border",
        "rgb(80, 90, 100)"
      );
      check(
        "icon size",
        getComputedStyle(element("Icon", "svg")).width,
        "32px"
      );
      check(
        "icon stroke",
        getComputedStyle(element("Icon", "svg")).strokeWidth,
        "3px"
      );
      check("input padding", getComputedStyle(input).paddingLeft, "30px");
      check("input font", getComputedStyle(input).fontSize, "20px");
      check("button radius", getComputedStyle(button).borderRadius, "12px");
      check("button height", getComputedStyle(button).minHeight, "48px");
      check(
        "input duration",
        getComputedStyle(input).transitionDuration.split(",")[0].trim(),
        "0.9s"
      );
      check(
        "button duration",
        getComputedStyle(button).transitionDuration.split(",")[0].trim(),
        "0.9s"
      );
      check(
        "statistic font",
        getComputedStyle(element("Statistic", ".a2ui-statistic-value"))
          .fontSize,
        "40px"
      );
      check(
        "chart stroke",
        getComputedStyle(element("Chart", "path")).stroke,
        "rgb(230, 20, 180)"
      );
      check(
        "sparkline stroke",
        getComputedStyle(element("Sparkline", "path")).stroke,
        "rgb(230, 20, 180)"
      );
      check(
        "chart legend",
        getComputedStyle(element("Chart", ".a2ui-chart-legend span"))
          .backgroundColor,
        "rgb(230, 20, 180)"
      );
      check(
        "chart line width",
        getComputedStyle(element("Chart", "path")).strokeWidth,
        "4px"
      );
      check(
        "card border",
        getComputedStyle(element("Card", ".a2ui-card")).borderTopColor,
        "rgb(80, 90, 100)"
      );
      check(
        "root hook",
        element("Chart", ".a2ui-surface").getAttribute("data-theme-part"),
        "a2ui"
      );
      check(
        "chart hook",
        element("Chart", "figure").getAttribute("data-theme-part"),
        "a2ui-chart"
      );
      root.removeAttribute("style");
      for (const theme of ["light", "dark", "matrix-dark"]) {
        root.setAttribute("data-theme", theme);
        const color = getComputedStyle(element("Chart", "path")).stroke;
        const accent = getComputedStyle(root)
          .getPropertyValue("--color-accent")
          .trim();
        // Resolve arbitrary CSS color syntax via a temporary ordinary element.
        const probe = document.createElement("span");
        probe.style.color = accent;
        root.append(probe);
        check(`${theme} series fallback`, color, getComputedStyle(probe).color);
        probe.remove();
      }
      check(
        "no horizontal overflow",
        document.documentElement.scrollWidth > innerWidth,
        false
      );
      return { passed: checks.length, checks };
    } finally {
      if (originalStyle === null) root.removeAttribute("style");
      else root.setAttribute("style", originalStyle);
      if (originalTheme === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", originalTheme);
    }
  });
}
