// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MermaidDiagram, mermaidFenceClosed } from "./mermaid";

const engine = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: engine }));
const controllers: MermaidDiagram[] = [];
function diagram() {
  const element = document.createElement("div");
  element.style.color = "rgb(10, 20, 30)";
  document.body.append(element);
  const controller = new MermaidDiagram(element);
  controllers.push(controller);
  return { controller, element };
}
beforeEach(() => {
  vi.useFakeTimers();
  engine.initialize.mockReset();
  engine.render.mockReset().mockImplementation(async id => ({ svg: `<svg id="${id}" viewBox="0 0 800 500"><text>Diagram</text></svg>` }));
  const context = { fillStyle: "", fillRect: vi.fn(), getImageData() {
    const rgb = this.fillStyle.match(/\d+/g)?.slice(0, 3).map(Number) ?? [255, 255, 255];
    return { data: new Uint8ClampedArray([...rgb, 255]) };
  } };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("matchMedia", () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:diagram"), revokeObjectURL: vi.fn() }));
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); } });
});
afterEach(() => {
  controllers.splice(0).forEach(controller => controller.dispose());
  document.body.replaceChildren();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it("recognizes completed fences while retaining incomplete streamed source", () => {
  expect(mermaidFenceClosed("```mermaid\nflowchart TD\nA-->B")).toBe(false);
  expect(mermaidFenceClosed("```mermaid\nflowchart TD\nA-->B\n```\n")).toBe(true);
  expect(mermaidFenceClosed("~~~~mermaid\nA-->B\n~~~")).toBe(false);
  expect(mermaidFenceClosed("~~~mermaid\nA-->B\n~~~~")).toBe(true);
});

it("renders only when ready, protects host security settings, and keeps SVG across markdown updates", async () => {
  const { controller, element } = diagram();
  controller.update("flowchart TD\nA-->B", false);
  await vi.advanceTimersByTimeAsync(150);
  expect(engine.render).not.toHaveBeenCalled();
  expect(element.textContent).toContain("A-->B");
  controller.update("flowchart TD\nA-->B", true);
  await vi.advanceTimersByTimeAsync(150);
  expect(engine.initialize).toHaveBeenCalledWith(expect.objectContaining({ securityLevel: "strict", startOnLoad: false, htmlLabels: false }));
  const svg = element.querySelector("svg");
  const replacement = document.createElement("div"); replacement.style.color = element.style.color; document.body.append(replacement);
  controller.moveTo(replacement); controller.update("flowchart TD\nA-->B", true);
  await vi.advanceTimersByTimeAsync(150);
  expect(replacement.querySelector("svg")).toBe(svg);
  expect(engine.render).toHaveBeenCalledTimes(1);
});

it("keeps invalid diagrams as escaped source and cleans temporary rendering nodes", async () => {
  engine.render.mockRejectedValue(new Error("Syntax error"));
  const { controller, element } = diagram();
  const source = 'broken <img src=x onerror="alert(1)">';
  controller.update(source);
  await vi.advanceTimersByTimeAsync(150);
  expect(element.dataset.mermaidState).toBe("error");
  expect(element.querySelector("code")?.textContent).toBe(source);
  expect(element.querySelector("img")).toBeNull();
  expect(document.body.children).toHaveLength(1);
});

it("does not install a stale asynchronous render after source changes", async () => {
  let resolve: (value: { svg: string }) => void = () => undefined;
  engine.render.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const { controller, element } = diagram();
  controller.update("flowchart TD\nA-->B"); await vi.advanceTimersByTimeAsync(150);
  controller.update("flowchart TD\nC-->D"); await vi.advanceTimersByTimeAsync(150);
  resolve({ svg: "<svg><text>Stale</text></svg>" });
  await vi.advanceTimersByTimeAsync(150);
  expect(element.textContent).not.toContain("Stale");
  expect(engine.render).toHaveBeenCalledTimes(2);
});

it("rerenders when host theme colors change", async () => {
  const { controller, element } = diagram();
  controller.update("flowchart TD\nA-->B"); await vi.advanceTimersByTimeAsync(150);
  const first = engine.initialize.mock.calls[0][0].themeVariables.primaryTextColor;
  element.style.color = "rgb(100, 200, 150)";
  await vi.advanceTimersByTimeAsync(200);
  expect(engine.initialize.mock.calls.at(-1)![0].themeVariables.primaryTextColor).not.toBe(first);
});

it("restarts a pending render when Vue replaces the markdown container", async () => {
  let resolve: (value: { svg: string }) => void = () => undefined;
  engine.render.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const { controller, element } = diagram();
  controller.update("flowchart TD\nA-->B"); await vi.advanceTimersByTimeAsync(150);
  const replacement = document.createElement("div");
  replacement.style.color = element.style.color;
  element.replaceWith(replacement);
  controller.moveTo(replacement); controller.update("flowchart TD\nA-->B");
  await vi.advanceTimersByTimeAsync(150);
  resolve({ svg: "<svg><text>Old container</text></svg>" });
  await vi.advanceTimersByTimeAsync(150);
  expect(replacement.dataset.mermaidState).toBe("ready");
  expect(replacement.textContent).toBe("Diagram");
  expect(engine.render).toHaveBeenCalledTimes(2);
});

it("opens a modal image preview by keyboard and releases its image URL when closed", async () => {
  const { controller, element } = diagram();
  controller.update("flowchart TD\nA-->B"); await vi.advanceTimersByTimeAsync(150);
  element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  const dialog = document.querySelector("dialog")!;
  expect(dialog.open).toBe(true);
  expect(dialog.querySelector("img")?.src).toBe("blob:diagram");
  dialog.querySelector<HTMLButtonElement>('[aria-label="Close image preview"]')!.click();
  expect(document.querySelector("dialog")).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:diagram");
  expect(document.activeElement).toBe(element);
});
