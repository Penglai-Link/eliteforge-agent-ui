import { html, render } from "lit-html";
import type { ExplainButtonOptions } from "../types/ui";

export function createExplainButton(options: ExplainButtonOptions) {
  const host = document.createElement("div");
  host.className = "ai-terminal-explain-button-host";

  render(
    html`
      <button
        class="ai-terminal-explain-button"
        style=${`--ai-terminal-explain-button-left:${options.left}px;--ai-terminal-explain-button-top:${options.top}px;--ai-terminal-explain-button-size:${options.size}px;`}
        type="button"
        @click=${options.onClick}
      >
        <svg
          class="ai-terminal-explain-button__icon lucide lucide-lightbulb-icon lucide-lightbulb"
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"
          />
          <path d="M9 18h6" />
          <path d="M10 22h4" />
        </svg>
      </button>
    `,
    host,
  );

  return host;
}
