<script setup lang="ts">
import { computed } from "vue";
import { toolResultPreview } from "@eliteforge/agent-ui-chat-core";
import JsonBlock from "./JsonBlock.vue";
const props = defineProps<{ value: string }>();
const preview = computed(() => toolResultPreview(props.value));
const hasPreview = computed(() => preview.value.texts.length + preview.value.images.length + preview.value.links.length + preview.value.facts.length > 0);
</script>
<template>
  <div class="ef-chat__tool-result-preview">
    <p v-for="(text,index) in preview.texts" :key="index" style="white-space:pre-wrap">{{ text }}</p>
    <a v-for="image in preview.images" :key="image.url" :href="image.url" target="_blank" rel="noreferrer"><img :src="image.url" :alt="image.name || 'Tool result image'" loading="lazy" style="max-width:100%;max-height:360px;object-fit:contain" /></a>
    <p v-for="(link,index) in preview.links" :key="`${link.url}-${index}`"><a :href="link.url" target="_blank" rel="noreferrer">{{ link.title }}</a><span v-if="link.snippet" style="display:block">{{ link.snippet }}</span></p>
    <dl v-if="preview.facts.length"><div v-for="fact in preview.facts" :key="fact.label"><dt style="display:inline">{{ fact.label }}: </dt><dd style="display:inline;margin:0">{{ fact.value }}</dd></div></dl>
    <details v-if="hasPreview"><summary>JSON</summary><JsonBlock :value="props.value" /></details>
    <JsonBlock v-else :value="props.value" />
  </div>
</template>
