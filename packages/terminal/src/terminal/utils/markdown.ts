import MarkdownIt from "markdown-it";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
});

export function renderMarkdown(markdown: string) {
  return unsafeHTML(markdownRenderer.render(markdown));
}
