<script setup lang="ts">
import { CheckCircle2, Copy } from "lucide-vue-next";
import { ref, onBeforeUnmount } from "vue";
import { copyPlainText } from "../utils";

const props = defineProps<{
  ariaLabel: string;
  title: string;
  value: string;
}>();

const copied = ref(false);
let timerId: number | null = null;

onBeforeUnmount(() => {
  if (timerId !== null) window.clearTimeout(timerId);
});

async function handleCopy() {
  if (!props.value.trim()) return;
  await copyPlainText(props.value);
  copied.value = true;
  if (timerId !== null) window.clearTimeout(timerId);
  timerId = window.setTimeout(() => {
    copied.value = false;
  }, 1400);
}
</script>

<template>
  <button
    :aria-label="props.ariaLabel"
    class="ef-chat__icon-button"
    :disabled="!props.value.trim()"
    type="button"
    :title="props.title"
    @click="handleCopy()"
  >
    <CheckCircle2 v-if="copied" :size="14" />
    <Copy v-else :size="14" />
  </button>
</template>
