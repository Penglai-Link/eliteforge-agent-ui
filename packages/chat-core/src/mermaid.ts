import type { MermaidConfig } from "mermaid";
import "./mermaid.css";

let library: Promise<typeof import("mermaid")> | undefined;
let renderQueue: Promise<unknown> = Promise.resolve();
let sequence = 0;

/** Markdown parsers include an unfinished fence during streaming. */
export function mermaidFenceClosed(source: string) {
  const lines = source.trimEnd().split(/\r?\n/);
  const opening = lines[0]?.trimStart().match(/^(`{3,}|~{3,})\s*mermaid(?:\s|$)/i);
  if (!opening || lines.length < 2) return false;
  const closing = lines.at(-1)!.trim();
  return closing.length >= opening[1].length && [...closing].every(char => char === opening[1][0]);
}

function hexColor(color: string, fallback: string) {
  if (!color || color === "transparent") return fallback;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return fallback;
  context.fillStyle = fallback;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const pixel = context.getImageData(0, 0, 1, 1).data;
  return pixel[3] ? `#${[...pixel.slice(0, 3)].map(value => value.toString(16).padStart(2, "0")).join("")}` : fallback;
}

function themeOf(element: HTMLElement): MermaidConfig {
  const style = getComputedStyle(element);
  const text = hexColor(style.color, "#24292f");
  let background = "#ffffff";
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") {
      background = hexColor(color, background);
      break;
    }
  }
  return {
    theme: "base",
    fontFamily: style.fontFamily || "sans-serif",
    themeVariables: {
      background, primaryColor: background, primaryTextColor: text,
      primaryBorderColor: text, secondaryColor: background, secondaryTextColor: text,
      secondaryBorderColor: text, tertiaryColor: background, tertiaryTextColor: text,
      tertiaryBorderColor: text, lineColor: text, textColor: text,
      mainBkg: background, nodeTextColor: text, clusterBkg: background,
      clusterBorder: text, edgeLabelBackground: background,
      actorBkg: background, actorBorder: text, actorTextColor: text,
      actorLineColor: text, signalColor: text, signalTextColor: text,
      labelBoxBkgColor: background, labelBoxBorderColor: text, labelTextColor: text,
      noteBkgColor: background, noteTextColor: text, noteBorderColor: text,
      activationBkgColor: background, activationBorderColor: text,
    },
  };
}

async function render(source: string, theme: MermaidConfig, owner: HTMLElement) {
  const work = renderQueue.then(async () => {
    library ??= import("mermaid");
    const { default: mermaid } = await library;
    await document.fonts?.ready;
    mermaid.initialize({
      ...theme, startOnLoad: false, securityLevel: "strict", htmlLabels: false,
      suppressErrorRendering: true, maxTextSize: 50_000, maxEdges: 500,
      secure: ["secure", "securityLevel", "startOnLoad", "maxTextSize", "maxEdges",
        "suppressErrorRendering", "dompurifyConfig", "themeCSS", "htmlLabels"],
    });
    const scratch = document.createElement("div");
    scratch.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none";
    // Keep inherited fonts and theme scope while Mermaid measures the SVG.
    owner.append(scratch);
    try {
      const result = await mermaid.render(`agent-ui-mermaid-${++sequence}`, source, scratch);
      return result.svg;
    } finally {
      scratch.remove();
    }
  });
  renderQueue = work.catch(() => {});
  return work;
}

/** Owns only its diagram subtree; both framework renderers use the same lifecycle.
 * Vue may replace its markdown HTML. moveTo preserves an already-rendered SVG.
 */
export class MermaidDiagram {
  private element: HTMLElement;
  private source = "";
  private ready = false;
  private signature = "";
  private settledSignature = "";
  private revision = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private observer?: MutationObserver;
  private media?: MediaQueryList;
  private closePreview?: () => void;

  constructor(element: HTMLElement) {
    this.element = element;
    this.listen(element);
    this.observeTheme();
    this.media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : undefined;
    this.media?.addEventListener("change", this.refresh);
  }

  moveTo(element: HTMLElement) {
    if (element === this.element) return;
    this.unlisten(this.element);
    element.replaceChildren(...this.element.childNodes);
    element.dataset.mermaidState = this.element.dataset.mermaidState;
    this.element = element;
    this.listen(element);
    if (this.signature !== this.settledSignature) {
      this.revision++;
      this.signature = "";
    }
    this.observeTheme();
  }

  update(source: string, ready = true) {
    if (this.disposed) return;
    if (source !== this.source || ready !== this.ready) {
      this.revision++;
      this.source = source;
      this.ready = ready;
      this.signature = "";
      this.settledSignature = "";
      this.showSource(ready ? "pending" : "incomplete");
    }
    this.refresh();
  }

  dispose() {
    this.disposed = true;
    this.revision++;
    clearTimeout(this.timer);
    this.observer?.disconnect();
    this.media?.removeEventListener("change", this.refresh);
    this.unlisten(this.element);
    this.closePreview?.();
  }

  private showSource(state: string) {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.className = "language-mermaid";
    code.textContent = this.source;
    pre.append(code);
    this.element.replaceChildren(pre);
    this.element.dataset.mermaidState = state;
    this.element.removeAttribute("role");
    this.element.removeAttribute("tabindex");
    this.element.removeAttribute("aria-haspopup");
  }

  private observeTheme() {
    this.observer?.disconnect();
    if (typeof MutationObserver === "undefined") return;
    this.observer = new MutationObserver(this.refresh);
    for (let node: HTMLElement | null = this.element; node; node = node.parentElement) {
      this.observer.observe(node, { attributes: true, attributeFilter: ["class", "style", "data-theme", "data-theme-mode", "lang"] });
    }
    this.observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  }

  private refresh = () => {
    if (this.element.dataset.mermaidState === "ready") this.labelPreview();
    clearTimeout(this.timer);
    if (!this.ready || !this.source.trim() || this.source.length > 50_000 || this.disposed) return;
    this.timer = setTimeout(() => {
      if (!this.element.isConnected || this.disposed) return;
      const theme = themeOf(this.element);
      const signature = JSON.stringify([this.source, theme]);
      if (signature === this.signature) return;
      this.signature = signature;
      const revision = ++this.revision;
      void render(this.source, theme, this.element).then(svg => {
        if (this.disposed || revision !== this.revision) return;
        this.element.innerHTML = svg;
        this.settledSignature = signature;
        this.element.dataset.mermaidState = "ready";
        this.labelPreview();
      }).catch(() => {
        if (!this.disposed && revision === this.revision) {
          this.settledSignature = signature;
          this.showSource("error");
        }
      });
    }, 100);
  };

  private listen(element: HTMLElement) {
    element.addEventListener("click", this.openPreview);
    element.addEventListener("keydown", this.onKeyDown);
  }
  private unlisten(element: HTMLElement) {
    element.removeEventListener("click", this.openPreview);
    element.removeEventListener("keydown", this.onKeyDown);
  }
  private labelPreview() {
    this.element.setAttribute("role", "button");
    this.element.setAttribute("tabindex", "0");
    this.element.setAttribute("aria-haspopup", "dialog");
    this.element.setAttribute("aria-label", document.documentElement.lang.startsWith("zh") ? "查看 Mermaid 图表" : "View Mermaid diagram");
  }
  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.openPreview();
    }
  };
  private openPreview = () => {
    if (this.closePreview || this.disposed) return;
    const svg = this.element.querySelector("svg");
    if (!svg) return;
    const zh = document.documentElement.lang.startsWith("zh");
    const labels = zh
      ? { preview: "Mermaid 图表预览", close: "关闭图片预览", in: "放大", out: "缩小", fit: "适应窗口" }
      : { preview: "Mermaid diagram preview", close: "Close image preview", in: "Zoom in", out: "Zoom out", fit: "Fit to window" };
    const box = svg.getAttribute("viewBox")?.split(/[ ,]+/).map(Number);
    const width = box?.[2] || svg.getBoundingClientRect().width || 800;
    const height = box?.[3] || svg.getBoundingClientRect().height || 600;
    const imageSvg = svg.cloneNode(true) as SVGSVGElement;
    imageSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    imageSvg.setAttribute("width", String(width));
    imageSvg.setAttribute("height", String(height));
    imageSvg.style.maxWidth = "none";
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(imageSvg)], { type: "image/svg+xml" }));
    const dialog = document.createElement("dialog");
    dialog.className = "ef-chat__mermaid-dialog";
    dialog.setAttribute("aria-label", labels.preview);
    const style = getComputedStyle(this.element);
    const theme = themeOf(this.element);
    dialog.style.color = style.color;
    dialog.style.backgroundColor = String(theme.themeVariables!.background);
    dialog.style.fontFamily = style.fontFamily;
    const toolbar = document.createElement("div");
    toolbar.className = "ef-chat__mermaid-toolbar";
    const title = document.createElement("strong");
    title.textContent = "Mermaid";
    toolbar.append(title);
    const viewport = document.createElement("div");
    viewport.className = "ef-chat__mermaid-viewport";
    const image = document.createElement("img");
    image.alt = "Mermaid";
    image.src = url;
    viewport.append(image);
    const scaleLabel = document.createElement("span");
    scaleLabel.className = "ef-chat__mermaid-scale";
    let scale = 1;
    const resize = (next: number) => {
      scale = Math.min(8, Math.max(0.1, next));
      image.style.width = `${width * scale}px`;
      image.style.height = `${height * scale}px`;
      scaleLabel.textContent = `${Math.round(scale * 100)}%`;
    };
    const fit = () => resize(Math.min((viewport.clientWidth - 32) / width, (viewport.clientHeight - 32) / height));
    const button = (label: string, text: string, action: () => void) => {
      const node = document.createElement("button");
      node.type = "button";
      node.setAttribute("aria-label", label);
      node.title = label;
      node.textContent = text;
      node.addEventListener("click", action);
      toolbar.append(node);
      return node;
    };
    button(labels.out, "−", () => resize(scale / 1.25));
    toolbar.append(scaleLabel);
    button(labels.in, "+", () => resize(scale * 1.25));
    button(labels.fit, zh ? "适应窗口" : "Fit", fit);
    const close = button(labels.close, "×", () => this.closePreview?.());
    dialog.append(toolbar, viewport);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      window.removeEventListener("resize", fit);
      if (dialog.open) dialog.close();
      dialog.remove();
      URL.revokeObjectURL(url);
      this.closePreview = undefined;
      if (this.element.isConnected) this.element.focus({ preventScroll: true });
    };
    this.closePreview = cleanup;
    dialog.addEventListener("close", cleanup);
    dialog.addEventListener("cancel", event => { event.preventDefault(); cleanup(); });
    dialog.addEventListener("click", event => {
      const bounds = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) cleanup();
    });
    document.body.append(dialog);
    dialog.showModal();
    fit();
    close.focus();
    window.addEventListener("resize", fit);
  };
}
