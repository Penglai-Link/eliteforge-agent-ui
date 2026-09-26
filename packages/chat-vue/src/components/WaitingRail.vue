<script setup lang="ts">
import { LoaderCircle } from "lucide-vue-next";
</script>

<template>
  <section aria-label="Waiting for model" class="ef-chat__rail">
    <div class="ef-chat__waiting">
      <span class="ef-chat__waiting-line" />
      <span class="ef-chat__rail-toggle-label">
        <LoaderCircle class="animate-spin" :size="14" />
        <span>Waiting for model...</span>
      </span>
      <span class="ef-chat__waiting-line" />
    </div>
  </section>
</template>
