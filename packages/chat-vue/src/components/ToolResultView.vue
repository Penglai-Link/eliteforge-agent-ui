<script setup lang="ts">
import { computed } from "vue";
import { toolResultPreview, batchItemLabel, toolSearchPreviewLabel } from "@eliteforge/agent-ui-chat-core";
import JsonBlock from "./JsonBlock.vue";
const props = withDefaults(defineProps<{ value: string; locale?: string; showRaw?: boolean }>(), { showRaw: true });
const preview = computed(() => toolResultPreview(props.value));
const hasPreview = computed(() => !!preview.value.items || !!preview.value.toolSearch || preview.value.texts.length + preview.value.images.length + preview.value.links.length + preview.value.facts.length > 0);
</script>
<template>
  <div class="ef-chat__tool-result-preview">
    <div :class="props.showRaw ? 'ef-chat__tool-result-content' : undefined">
    <template v-if="preview.items">
      <section v-for="entry in preview.items" :key="entry.item.invocationId" :data-batch-index="entry.item.index" :data-batch-status="entry.item.status">
        <p><strong>{{ batchItemLabel(entry.item.index,entry.item.status,props.locale) }}</strong></p>
        <ToolResultView v-if="entry.item.content.length || entry.item.result !== undefined" :value="entry.value" :locale="props.locale" :show-raw="false" />
      </section>
    </template>
    <template v-else>
    <section v-if="preview.toolSearch" :data-tool-search-mode="preview.toolSearch.mode">
      <p>{{ toolSearchPreviewLabel(preview.toolSearch, props.locale) }}</p>
      <ul><li v-for="tool in preview.toolSearch.tools" :key="tool.callName"><strong>{{ tool.callName }}</strong><p>{{ tool.description }}</p></li></ul>
    </section>
    <p v-for="(text,index) in preview.texts" :key="index" style="white-space:pre-wrap">{{ text }}</p>
    <a v-for="image in preview.images" :key="image.url" :href="image.url" target="_blank" rel="noreferrer"><img :src="image.url" :alt="image.name || 'Tool result image'" loading="lazy" style="max-width:100%;max-height:360px;object-fit:contain" /></a>
    <p v-for="(link,index) in preview.links" :key="`${link.url}-${index}`"><a :href="link.url" target="_blank" rel="noreferrer">{{ link.title }}</a><span v-if="link.snippet" style="display:block">{{ link.snippet }}</span></p>
    <dl v-if="preview.facts.length"><div v-for="fact in preview.facts" :key="fact.label"><dt style="display:inline">{{ fact.label }}: </dt><dd style="display:inline;margin:0">{{ fact.value }}</dd></div></dl>
    <JsonBlock v-if="!hasPreview" :value="props.value" />
    </template>
    </div>
    <details v-if="hasPreview && props.showRaw" class="ef-chat__tool-result-raw"><summary>JSON</summary><JsonBlock :value="props.value" /></details>
  </div>
</template>
