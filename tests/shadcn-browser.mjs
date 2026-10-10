/** Reusable acceptance against either live demo via Playwright CLI. */
export async function verifyShadcn(page) {
  const checks = [];
  const sample = (name) => page.locator(`[data-demo-component="${name}"]`);
  const check = async (name, condition) => {
    if (!(await condition)) throw new Error(name);
    checks.push(name);
  };
  await check(
    "79 isolated samples",
    (await page.locator("[data-demo-component]").count()) === 79
  );
  await check(
    "input addons align",
    await sample("InputGroup").evaluate((root) => {
      const rect = (selector) =>
        root.querySelector(selector).getBoundingClientRect();
      const input = rect("input"),
        prefix = rect(".a2ui-inputgroup-prefix"),
        suffix = rect(".a2ui-inputgroup-suffix"),
        label = rect(".a2ui-control-label");
      return (
        Math.abs(input.top - prefix.top) < 1 &&
        Math.abs(input.bottom - suffix.bottom) < 1 &&
        label.bottom <= input.top
      );
    })
  );
  const select = sample("Select");
  await check(
    "select has custom control",
    (await select.locator("select").count()) === 0
  );
  await select.getByRole("combobox").press("ArrowDown");
  await check(
    "select custom listbox opens",
    await select
      .getByRole("listbox")
      .evaluate((el) => el.matches(":popover-open"))
  );
  await check(
    "select popup matches trigger width",
    await select.evaluate(
      (root) =>
        Math.abs(
          root.querySelector("[role=combobox]").getBoundingClientRect().width -
            root.querySelector("[role=listbox]").getBoundingClientRect().width
        ) < 1
    )
  );
  await page.keyboard.press("End");
  const selectedText = await page.evaluate(
    () => document.activeElement.textContent
  );
  await page.keyboard.press("Enter");
  await check(
    "select keyboard commits",
    (await select.getByRole("combobox").textContent()) === selectedText
  );
  await sample("Modal").locator("button").first().click();
  await check(
    "modal theme panel",
    await sample("Modal")
      .locator("dialog")
      .evaluate(
        (el) =>
          el.matches(":modal") && getComputedStyle(el).borderRadius === "12px"
      )
  );
  await page.keyboard.press("Escape");
  const accordion = sample("Accordion");
  await accordion.locator("button").nth(0).click();
  await check(
    "accordion opens",
    (await accordion.locator("button").nth(0).getAttribute("aria-expanded")) ===
      "true"
  );
  await accordion.locator("button").nth(0).press("ArrowDown");
  await check(
    "accordion keyboard focus",
    await accordion
      .locator("button")
      .nth(1)
      .evaluate((el) => el === document.activeElement)
  );
  await accordion.locator("button").nth(1).press("Enter");
  await check(
    "single accordion closes previous",
    (await accordion.locator("button").nth(0).getAttribute("aria-expanded")) ===
      "false"
  );
  for (const name of ["Popover", "DatePicker", "DropdownMenu", "Menubar"]) {
    const root = sample(name);
    await root.locator("button").first().click();
    await check(
      `${name} opens in top layer`,
      await root
        .locator(".a2ui-popup")
        .evaluate((el) => el.matches(":popover-open"))
    );
    await check(
      `${name} visible geometry`,
      await root.locator(".a2ui-popup").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.left >= 0 && r.right <= innerWidth + 1;
      })
    );
    await page.keyboard.press("Escape");
    await check(
      `${name} closes`,
      !(await root
        .locator(".a2ui-popup")
        .evaluate((el) => el.matches(":popover-open")))
    );
  }
  const context = sample("ContextMenu");
  await context.locator("button").first().focus();
  await page.keyboard.press("Shift+F10");
  await check(
    "context keyboard opens",
    await context.locator(".a2ui-popup").isVisible()
  );
  await context.getByRole("menuitem", { name: "Vue", exact: true }).click();
  await check(
    "context selection closes",
    !(await context
      .locator(".a2ui-popup")
      .evaluate((el) => el.matches(":popover-open")))
  );
  for (const name of ["Drawer", "Sheet", "AlertDialog"]) {
    const root = sample(name);
    await root.locator("button").first().click();
    await check(
      `${name} modal`,
      await root.locator("dialog").evaluate((el) => el.matches(":modal"))
    );
    await page.keyboard.press("Escape");
    await check(
      `${name} closes`,
      !(await root.locator("dialog").evaluate((el) => el.open))
    );
  }
  await sample("InputOTP").locator("input").fill("a1234");
  await check(
    "OTP sanitizes",
    (await sample("InputOTP").locator("input").inputValue()) === "1234"
  );
  const combo = sample("Combobox");
  await combo.locator("input").fill("Vue");
  await combo.locator("input").press("Enter");
  await check(
    "combobox selects",
    (await combo.locator("input").inputValue()) === "Vue"
  );
  const calendar = sample("Calendar");
  await calendar.locator('[data-date="2026-10-10"]').focus();
  await page.keyboard.press("ArrowRight");
  await calendar
    .locator('[data-date="2026-10-11"]')
    .evaluate(
      (el) =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    );
  await check(
    "calendar keyboard focus",
    await calendar
      .locator('[data-date="2026-10-11"]')
      .evaluate((el) => el === document.activeElement)
  );
  await page.keyboard.press("Enter");
  await check(
    "calendar selects",
    (await calendar
      .locator('td:has([data-date="2026-10-11"])')
      .getAttribute("aria-selected")) === "true"
  );
  const split = sample("Resizable").getByRole("separator");
  await split.focus();
  await split.press("ArrowRight");
  await check(
    "resizable keyboard",
    (await split.getAttribute("aria-valuenow")) === "55"
  );
  const bounds = await split.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 20,
    bounds.y + bounds.height / 2
  );
  await page.mouse.up();
  await check(
    "resizable pointer",
    Number(await split.getAttribute("aria-valuenow")) > 55
  );
  const themes = await page.evaluate(() => {
    const root = document.documentElement,
      original = root.getAttribute("style");
    root.style.setProperty("--agent-ui-a2ui-calendar-day-height", "42px");
    root.style.setProperty("--agent-ui-a2ui-group-gap", "17px");
    const size = getComputedStyle(
      document.querySelector('[data-demo-component="Calendar"] [data-date]')
    ).minHeight;
    const gap = getComputedStyle(
      document.querySelector(
        '[data-demo-component="ToggleGroup"] .a2ui-togglegroup'
      )
    ).gap;
    if (original === null) root.removeAttribute("style");
    else root.setAttribute("style", original);
    return { size, gap };
  });
  await check(
    "new component theme variables",
    themes.size === "42px" && themes.gap === "17px"
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await check(
    "mobile no overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  );
  await page.setViewportSize({ width: 1199, height: 954 });
  return { passed: checks.length, checks };
}
