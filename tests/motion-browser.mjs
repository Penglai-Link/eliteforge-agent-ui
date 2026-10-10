/** Run against either motion.html demo through Playwright CLI run-code. */
export async function verifyMotion(page) {
  const checks = [];
  const check = (name, actual, expected) => {
    if (actual !== expected)
      throw new Error(`${name}: ${actual} !== ${expected}`);
    checks.push(name);
  };
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await page.getByRole("textbox", { name: "保留草稿" }).fill("draft survives");
  await page.evaluate(() => {
    window.__motionDraft = document.querySelector(".motion-sample input");
  });
  await page.getByRole("spinbutton", { name: "出现时长 ms" }).fill("900");
  await page.getByRole("button", { name: "重播出现效果" }).click();
  const duration = await page.evaluate(
    () =>
      document
        .querySelector(".motion-sample")
        .getAnimations()[0]
        ?.effect.getTiming().duration
  );
  check("configured duration", duration, 900);
  await page.getByRole("combobox", { name: "动效策略" }).selectOption("off");
  await page.locator('[data-agent-motion-policy="off"]').waitFor();
  check(
    "cancel playback",
    await page.evaluate(
      () => document.querySelector(".motion-sample").getAnimations().length
    ),
    0
  );
  check(
    "preserve native input",
    await page.evaluate(
      () =>
        window.__motionDraft === document.querySelector(".motion-sample input")
    ),
    true
  );
  check(
    "preserve draft",
    await page.getByRole("textbox", { name: "保留草稿" }).inputValue(),
    "draft survives"
  );
  await page.getByRole("tab", { name: "反馈与展示" }).click();
  check(
    "disable CSS spinner",
    await page
      .locator(".a2ui-spinner-ring")
      .evaluate((node) => getComputedStyle(node).animationName),
    "none"
  );
  await page.getByRole("combobox", { name: "动效策略" }).selectOption("system");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator('[data-agent-motion-policy="reduced"]').waitFor();
  await page.getByRole("button", { name: "重播出现效果" }).click();
  check(
    "system reduced playback",
    await page.evaluate(
      () => document.querySelector(".motion-sample").getAnimations().length
    ),
    0
  );
  check(
    "system reduced spinner",
    await page
      .locator(".a2ui-spinner-ring")
      .evaluate((node) => getComputedStyle(node).animationName),
    "none"
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator('[data-agent-motion-policy="full"]').waitFor();
  await page.getByRole("spinbutton", { name: "出现时长 ms" }).fill("");
  await page.evaluate(() => {
    document.documentElement.style.setProperty(
      "--agent-ui-motion-enter-duration",
      "700ms"
    );
    document.documentElement.style.setProperty(
      "--agent-ui-motion-enter-distance",
      "24px"
    );
    document
      .querySelector('[data-theme-part="a2ui"]')
      .style.setProperty("--agent-ui-motion-spin-duration", "2s");
  });
  await page.getByRole("button", { name: "重播出现效果" }).click();
  const theme = await page.evaluate(() => {
    const animation = document
      .querySelector(".motion-sample")
      .getAnimations()[0];
    return {
      duration: animation?.effect.getTiming().duration,
      transform: animation?.effect.getKeyframes()[0].transform,
    };
  });
  check("ancestor duration token", theme.duration, 700);
  check("ancestor distance token", theme.transform, "translateY(24px)");
  check(
    "A2UI spinner duration token",
    await page
      .locator(".a2ui-spinner-ring")
      .evaluate((node) => getComputedStyle(node).animationDuration),
    "2s"
  );
  await page.evaluate(() =>
    document.documentElement.style.setProperty(
      "--agent-ui-motion-fade-duration",
      "650ms"
    )
  );
  await page.getByRole("tab", { name: "表单与数据" }).click();
  check(
    "A2UI tab playback duration",
    await page
      .getByRole("tabpanel")
      .evaluate((node) => node.getAnimations()[0]?.effect.getTiming().duration),
    650
  );
  await page.getByText("查看说明", { exact: true }).click();
  check(
    "accordion open",
    await page
      .locator('details[data-theme-part="a2ui-accordion"]')
      .evaluate((node) => node.open),
    true
  );
  check(
    "accordion effect hook",
    await page.locator('details [data-agent-motion="enter"]').count(),
    1
  );
  check(
    "accordion playback duration",
    await page
      .locator('details [data-agent-motion="enter"]')
      .evaluate((node) => node.getAnimations()[0]?.effect.getTiming().duration),
    700
  );
  for (const theme of ["light", "dark", "matrix-dark"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme
    );
    check(
      `${theme} final content visible`,
      await page.locator(".motion-sample").isVisible(),
      true
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  check(
    "narrow viewport",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    true
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    delete window.__motionDraft;
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-theme");
    document
      .querySelector('[data-theme-part="a2ui"]')
      .style.removeProperty("--agent-ui-motion-spin-duration");
  });
  return { passed: checks.length, checks };
}
