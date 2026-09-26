<script setup lang="ts">
import { computed } from "vue";
import { formatJsonBlockValue } from "@eliteforge/agent-ui-chat-core";

const props = defineProps<{
  value: unknown;
}>();

const preview = computed(() => formatJsonBlockValue(props.value));
</script>

<template>
  <pre v-if="preview" class="ef-chat__result-block">{{ preview }}</pre>
</template>
