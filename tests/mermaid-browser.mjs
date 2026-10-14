/** Playwright CLI acceptance for either renderer's /mermaid.html preview. */
export async function verifyMermaid(page, { url, name }) {
  const checks = [];
  const check = (label, value) => { if (!value) throw new Error(label); checks.push(label); };
  await page.goto(url);
  await page.addStyleTag({ content: "dialog { margin: 0; }" });
  const source = page.getByRole("textbox", { name: "Markdown source", exact: true });
  const initial = await source.inputValue();
  await page.waitForFunction(() => document.querySelectorAll('.ef-chat__mermaid[data-mermaid-state="ready"]').length === 2, {}, { timeout: 30000 });
  check("flowchart and sequence diagram render", await page.locator(".ef-chat__mermaid > svg").count() === 2);
  check("ordinary code stays code", await page.locator("pre > code.language-ts").textContent() === "const diagram = true;\n");
  const graph = page.locator(".ef-chat__mermaid").first();
  const colorBefore = await graph.evaluate(node => getComputedStyle(node.querySelector("svg text")).fill);
  await graph.locator("svg").evaluate(node => { window.__mermaidFirstSvg = node; });
  await source.fill(initial + "\n\n图表之后继续生成文字。");
  await page.getByText("图表之后继续生成文字。", { exact: true }).waitFor();
  check("later text retains the rendered SVG", await graph.locator("svg").evaluate(node => node === window.__mermaidFirstSvg));
  await graph.click();
  const dialog = page.locator("dialog.ef-chat__mermaid-dialog");
  await dialog.waitFor();
  check("preview stays centered under host CSS resets", await dialog.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return bounds.left > 0 && bounds.top > 0;
  }));
  const image = dialog.getByRole("img", { name: "Mermaid", exact: true });
  await image.evaluate(node => node.decode());
  check("large image loads", await image.evaluate(node => node.naturalWidth > 0 && node.naturalHeight > 0));
  check("preview has a dark modal backdrop", await dialog.evaluate(node => getComputedStyle(node, "::backdrop").backgroundColor !== "rgba(0, 0, 0, 0)"));
  check("preview is larger than inline diagram", (await dialog.boundingBox()).width > (await graph.boundingBox()).width * 0.8);
  const width = await image.evaluate(node => node.getBoundingClientRect().width);
  await dialog.getByRole("button", { name: "放大", exact: true }).click();
  check("zoom in enlarges the image", await image.evaluate(node => node.getBoundingClientRect().width) > width);
  await dialog.getByRole("button", { name: "缩小", exact: true }).click();
  await dialog.getByRole("button", { name: "适应窗口", exact: true }).click();
  await page.screenshot({ path: `output/playwright/mermaid-${name}-preview.png`, animations: "disabled" });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  check("Escape closes and restores diagram focus", await graph.evaluate(node => document.activeElement === node));
  await graph.press("Enter"); await dialog.waitFor();
  await page.mouse.click(2, 2); await dialog.waitFor({ state: "detached" });
  check("clicking the backdrop closes the preview", await page.locator("dialog").count() === 0);
  await graph.click(); await dialog.getByRole("button", { name: "关闭图片预览", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  check("close button removes the preview", await page.locator("dialog").count() === 0);
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.waitForFunction(color => { const text = document.querySelector(".ef-chat__mermaid svg text"); return text && getComputedStyle(text).fill !== color; }, colorBefore);
  check("diagram follows theme colors", await graph.evaluate(node => getComputedStyle(node.querySelector("svg text")).fill) !== colorBefore);
  await page.screenshot({ path: `output/playwright/mermaid-${name}-dark.png`, animations: "disabled" });
  await page.getByRole("checkbox", { name: "Streaming", exact: true }).check();
  await source.fill("```mermaid\nflowchart LR\nA[流式生成] --> B[图表]");
  await page.locator('.ef-chat__mermaid[data-mermaid-state="incomplete"]').waitFor();
  check("unfinished streamed fence retains source", await page.locator(".ef-chat__mermaid svg").count() === 0 && (await graph.textContent()).includes("A[流式生成]"));
  await source.fill("```mermaid\nflowchart LR\nA[流式生成] --> B[图表]\n```\n后续文字仍在生成");
  await page.locator('.ef-chat__mermaid[data-mermaid-state="ready"] svg').waitFor();
  check("closed fence renders while message is still streaming", await page.getByRole("checkbox", { name: "Streaming", exact: true }).isChecked());
  await source.fill("```mermaid\nflowchart TD\nA[unterminated\n```");
  await page.locator('.ef-chat__mermaid[data-mermaid-state="error"]').waitFor();
  check("invalid syntax falls back to source", (await graph.textContent()).includes("A[unterminated") && await graph.locator("svg").count() === 0);
  await source.fill('```mermaid\n%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\nA["<img src=x onerror=window.__mermaidUnsafe=1>"] --> B[安全]\nclick A href "javascript:window.__mermaidUnsafe=1"\n```');
  await page.locator('.ef-chat__mermaid[data-mermaid-state="ready"] svg').waitFor();
  check("diagram source cannot enable clickable script links", await graph.evaluate(node =>
    !node.querySelector("svg a[href], svg a[*|href], svg foreignObject, svg script, svg img") &&
    ![...node.querySelectorAll("svg *")].some(child => [...child.attributes].some(attr => /^on/i.test(attr.name))) &&
    window.__mermaidUnsafe !== 1));
  await page.getByRole("checkbox", { name: "Streaming", exact: true }).uncheck();
  await source.fill(initial);
  await page.waitForFunction(() => document.querySelectorAll('.ef-chat__mermaid[data-mermaid-state="ready"]').length === 2);
  return { name, passed: checks.length, checks };
}
