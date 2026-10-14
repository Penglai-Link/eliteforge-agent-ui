/** Run against either standalone Composer demo through Playwright CLI run-code. */
export async function verifyComposer(page) {
  const checks = [];
  const check = (name, value, expected = true) => {
    if (value !== expected)
      throw new Error(`${name}: ${value} !== ${expected}`);
    checks.push(name);
  };
  await page.reload();
  const editor = page.getByRole("textbox");
  const log = page.getByRole("log");
  const renderer = (await page.title()).includes("React") ? "react" : "vue";
  const stage = page.locator(".stage");
  await stage.evaluate((node) => {
    const overrides = {
      "--agent-ui-chat-text": "rgb(11, 22, 33)",
      "--agent-ui-font": "monospace",
      "--agent-ui-composer-font-size": "18px",
      "--agent-ui-composer-padding": "18px",
      "--agent-ui-control-radius": "9px",
      "--agent-ui-transition-duration": "321ms",
      "--agent-ui-gap": "9px",
      "--agent-ui-composer-icon-size": "21px",
      "--agent-ui-chat-focus": "rgb(1, 2, 3)",
    };
    for (const [key, value] of Object.entries(overrides))
      node.style.setProperty(key, value);
  });
  check(
    "inherit direct chat color",
    await page
      .locator(".ef-composer")
      .evaluate((node) => getComputedStyle(node).color),
    "rgb(11, 22, 33)"
  );
  check(
    "inherit font",
    await page
      .locator(".ef-composer")
      .evaluate((node) => getComputedStyle(node).fontFamily),
    "monospace"
  );
  check(
    "inherit font size",
    await page
      .locator(".ef-composer")
      .evaluate((node) => getComputedStyle(node).fontSize),
    "18px"
  );
  check(
    "inherit padding",
    await page
      .locator(".ef-chat__composer")
      .evaluate((node) => getComputedStyle(node).paddingTop),
    "18px"
  );
  const sendButton = page.getByRole("button", { name: "Send", exact: true });
  check(
    "inherit radius",
    await sendButton.evaluate((node) => getComputedStyle(node).borderRadius),
    "9px"
  );
  check(
    "inherit transition",
    await sendButton.evaluate(
      (node) => getComputedStyle(node).transitionDuration.split(",")[0]
    ),
    "0.321s"
  );
  check(
    "inherit gap",
    await page
      .locator(".ef-chat__composer-row")
      .evaluate((node) => getComputedStyle(node).gap),
    "9px"
  );
  check(
    "inherit icon size",
    await sendButton
      .locator("svg")
      .evaluate((node) => getComputedStyle(node).width),
    "21px"
  );
  await editor.focus();
  await editor.press("Tab");
  check(
    "keyboard focus ring",
    await page
      .getByRole("button", { name: "Attach file" })
      .evaluate((node) => getComputedStyle(node).outlineColor),
    "rgb(1, 2, 3)"
  );
  await stage.evaluate((node) => {
    node.removeAttribute("style");
    node.style.setProperty("--color-surface-container-lowest", "#07120b");
    node.style.setProperty("--color-on-surface", "#83e8a0");
    node.style.setProperty("--color-primary", "#5cff85");
  });
  check(
    "Matrix dark surface",
    await page
      .locator(".ef-chat__composer")
      .evaluate((node) => getComputedStyle(node).backgroundColor),
    "rgb(7, 18, 11)"
  );
  check(
    "Matrix dark text",
    await page
      .locator(".ef-composer")
      .evaluate((node) => getComputedStyle(node).color),
    "rgb(131, 232, 160)"
  );
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".ef-chat__button_send"))
        .backgroundColor === "rgb(92, 255, 133)"
  );
  check(
    "Matrix dark primary",
    await sendButton.evaluate((node) => getComputedStyle(node).backgroundColor),
    "rgb(92, 255, 133)"
  );
  await stage.evaluate((node) => node.removeAttribute("style"));
  check(
    "standalone without chat shell",
    await page.locator(".ef-chat").count(),
    0
  );
  check(
    "initial image preview",
    await page.getByRole("img", { name: "landscape.svg" }).count(),
    1
  );
  await editor.fill("$");
  check(
    "skill-only menu",
    await page.getByRole("listbox").getByRole("option").count(),
    2
  );
  await editor.press("ArrowDown");
  await editor.press("Enter");
  check("keyboard skill selection", await editor.inputValue(), "$explain ");
  check(
    "selected skill label",
    await page.locator(".ef-chat__skill-token-label").textContent(),
    "解释代码"
  );
  check(
    "caret after selected skill",
    await editor.evaluate((node) => node.selectionStart),
    9
  );
  await editor.fill("/");
  check(
    "commands and skills",
    await page.getByRole("listbox").getByRole("option").count(),
    4
  );
  await editor.press("Escape");
  check("escape dismiss", await page.getByRole("listbox").count(), 0);
  await editor.fill("hello");
  await editor.press("Shift+Enter");
  await editor.press("x");
  check("multiline input", await editor.inputValue(), "hello\nx");
  await editor.evaluate((node) =>
    node.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
      })
    )
  );
  check("IME does not submit", await log.textContent(), "等待操作…");
  await editor.press("Enter");
  check("send", (await log.textContent()).includes("send: hello"));
  await editor.fill("queued request");
  await editor.press("Enter");
  check(
    "running queue",
    await page.locator(".ef-chat__queued-message-content").textContent(),
    "queued request"
  );
  await editor.fill("adjust reply");
  await editor.press("Control+Enter");
  check(
    "running steer",
    (await log.textContent()).includes("steer: adjust reply")
  );
  await page.getByRole("button", { name: "Edit queued message" }).click();
  check("edit queued draft", await editor.inputValue(), "queued request");
  await editor.press("Enter");
  await page.getByRole("button", { name: "Remove queued message" }).click();
  check(
    "remove queue",
    await page.locator(".ef-chat__queued-message").count(),
    0
  );
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  check("stop", (await log.textContent()).startsWith("stop"));
  await page.getByRole("button", { name: "恢复附件" }).click();
  await page.getByRole("button", { name: "Remove requirements.md" }).click();
  check(
    "remove attachment",
    await page.getByRole("button", { name: "Remove requirements.md" }).count(),
    0
  );
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "upload.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("composer test"),
    });
  await log.filter({ hasText: "attachment: upload.txt" }).waitFor();
  check(
    "file upload callback",
    (await log.textContent()).includes("attachment: upload.txt")
  );
  await editor.evaluate((node) => {
    const data = new DataTransfer();
    const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII="), character => character.charCodeAt(0));
    data.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
    node.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      })
    );
  });
  await log.filter({ hasText: "attachment: pasted.png" }).waitFor();
  check(
    "paste image callback",
    (await log.textContent()).includes("attachment: pasted.png")
  );
  await page.getByRole("button", { name: "禁用输入" }).click();
  check("disabled editor", await editor.isDisabled());
  check(
    "disabled file control",
    await page.getByRole("button", { name: "Attach file" }).isDisabled()
  );
  check(
    "disabled send",
    await page.getByRole("button", { name: "Send", exact: true }).isDisabled()
  );
  await page.getByRole("button", { name: "启用输入" }).click();
  await page.getByRole("button", { name: "恢复附件" }).click();
  await page.getByRole("combobox", { name: "Model" }).selectOption("Fast");
  check(
    "addon remains interactive",
    await page.getByRole("combobox", { name: "Model" }).inputValue(),
    "Fast"
  );
  await page.getByRole("button", { name: "主题：light" }).click();
  check(
    "dark surface",
    await page
      .locator(".ef-chat__composer")
      .evaluate((node) => getComputedStyle(node).backgroundColor),
    "rgb(36, 42, 53)"
  );
  await editor.fill("$review ");
  await page.screenshot({
    path: `output/playwright/composer-${renderer}-dark.png`,
  });
  await page.getByRole("button", { name: "主题：dark" }).click();
  check(
    "brand surface",
    await page
      .locator(".ef-chat__composer")
      .evaluate((node) => getComputedStyle(node).backgroundColor),
    "rgb(243, 250, 239)"
  );
  check(
    "theme control dimensions",
    await page
      .getByRole("button", { name: "Send", exact: true })
      .evaluate((node) => getComputedStyle(node).height),
    "38px"
  );
  await page.getByRole("button", { name: "切换窄屏" }).click();
  await page.setViewportSize({ width: 390, height: 900 });
  check(
    "no horizontal overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  );
  await editor.fill("$");
  await page.getByRole("listbox").waitFor();
  await page.screenshot({
    path: `output/playwright/composer-${renderer}-brand-mobile.png`,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await editor.focus();
  check(
    "reduced motion caret",
    await page
      .locator(".ef-chat__composer-overlay-caret")
      .evaluate((node) => getComputedStyle(node).animationName),
    "none"
  );
  await page.setViewportSize({ width: 1200, height: 920 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  console.log(JSON.stringify({ renderer, passed: checks.length, checks }));
  return checks;
}
