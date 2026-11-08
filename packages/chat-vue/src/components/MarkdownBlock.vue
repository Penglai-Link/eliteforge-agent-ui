<script setup lang="ts">
import { chatAnnotationForHref, chatAnnotationTooltip, type ChatAnnotationLabels, type ChatAnnotation } from "@personai/agent-ui-chat-core";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { MermaidDiagram, mermaidFenceClosed } from "@personai/agent-ui-chat-core";
import "github-markdown-css/github-markdown.css";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
const defaultLink = md.renderer.rules.link_open ?? ((tokens, index, options, env, renderer) => renderer.renderToken(tokens, index, options));
md.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  const annotation = chatAnnotationForHref(tokens[index].attrGet('href') ?? undefined, env.annotations ?? []);
  if (annotation) {
    tokens[index].attrSet('class', 'ef-chat__annotation-reference');
    tokens[index].attrSet('data-annotation-source-id', annotation.messageId);
    tokens[index].attrSet('data-annotation-tooltip', chatAnnotationTooltip(annotation, env.annotationLabels));
  }
  return defaultLink(tokens, index, options, env, renderer);
};
const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  if (token.info.trim().split(/\s/)[0].toLowerCase() !== "mermaid") {
    return defaultFence(tokens, index, options, env, renderer);
  }
  const id = env.blocks.length;
  const fence = env.lines.slice(token.map?.[0] ?? 0, token.map?.[1] ?? 0).join("\n");
  env.blocks.push({ source: token.content, ready: !env.streaming || mermaidFenceClosed(fence) });
  return `<div class="ef-chat__mermaid" data-theme-part="chat-mermaid" data-mermaid-block="${id}"></div>`;
};

const props = withDefaults(defineProps<{
  content?: string;
  emptyMessage?: string;
  streaming?: boolean;
  annotations?: ChatAnnotation[];
  annotationLabels?: ChatAnnotationLabels;
}>(), { content: "", emptyMessage: "No assistant response was produced.", streaming: false });

const element = ref<HTMLDivElement>();
const diagrams = new Map<number, MermaidDiagram>();
const compiled = computed(() => {
  const content = props.content || props.emptyMessage;
  const env = { annotations: props.annotations, annotationLabels: props.annotationLabels, blocks: [] as Array<{ source: string; ready: boolean }>, lines: content.split(/\r?\n/), streaming: props.streaming };
  return { html: md.render(content, env), blocks: env.blocks };
});
watch(compiled, async ({ blocks }) => {
  await nextTick();
  if (!element.value) return;
  const used = new Set<number>();
  blocks.forEach((block, index) => {
    const target = element.value!.querySelector<HTMLElement>(`[data-mermaid-block="${index}"]`);
    if (!target) return;
    used.add(index);
    let diagram = diagrams.get(index);
    if (diagram) diagram.moveTo(target);
    else { diagram = new MermaidDiagram(target); diagrams.set(index, diagram); }
    diagram.update(block.source, block.ready);
  });
  for (const [index, diagram] of diagrams) {
    if (!used.has(index)) { diagram.dispose(); diagrams.delete(index); }
  }
}, { immediate: true, flush: "post" });
onBeforeUnmount(() => { for (const diagram of diagrams.values()) diagram.dispose(); });
</script>

<template>
  <div ref="element" class="markdown-body" v-html="compiled.html" />
</template>
