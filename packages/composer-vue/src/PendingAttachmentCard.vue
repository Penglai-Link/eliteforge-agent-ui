<script setup lang="ts">
import { ref, watch } from "vue";
import { FileText, X } from "lucide-vue-next";
import {
  attachmentLabel,
  attachmentTypeLabel,
  isImageAttachment,
  type ComposerAttachment,
} from "@personai/agent-ui-composer-core";
const props = defineProps<{
  attachment: ComposerAttachment;
  downloadAttachment?: (attachment: ComposerAttachment) => Promise<Blob>;
  removeLabel: (name: string) => string;
}>();
const emit = defineEmits<{ remove: [id: string] }>();
const remoteUrl = ref<string | null>(null);
watch(
  () => [props.attachment, props.downloadAttachment] as const,
  ([attachment, download], _, onCleanup) => {
    remoteUrl.value = null;
    if (attachment.imageUrl || !download || !isImageAttachment(attachment))
      return;
    let active = true,
      objectUrl: string | null = null;
    onCleanup(() => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    });
    void download(attachment)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        remoteUrl.value = url;
      })
      .catch(() => {
        if (active) remoteUrl.value = null;
      });
  },
  { immediate: true }
);
</script>
<template>
  <div
    v-if="isImageAttachment(attachment)"
    class="ef-chat__runtime-attachment-image"
  >
    <img
      v-if="attachment.imageUrl || remoteUrl"
      :src="attachment.imageUrl || remoteUrl || undefined"
      :alt="attachmentLabel(attachment)"
    />
    <button
      :aria-label="removeLabel(attachmentLabel(attachment))"
      class="ef-chat__runtime-attachment-remove ef-chat__runtime-attachment-remove--floating"
      type="button"
      @click="emit('remove', attachment.id)"
    >
      <X
        :size="13"
        :style="{
          width: 'var(--agent-ui-composer-icon-size, 13px)',
          height: 'var(--agent-ui-composer-icon-size, 13px)',
        }"
      />
    </button>
  </div>
  <div v-else class="ef-chat__runtime-attachment-file">
    <span class="ef-chat__runtime-attachment-file-icon" aria-hidden="true"
      ><FileText
        :size="22"
        :style="{
          width: 'var(--agent-ui-composer-icon-size, 22px)',
          height: 'var(--agent-ui-composer-icon-size, 22px)',
        }"
    /></span>
    <span class="ef-chat__runtime-attachment-file-info"
      ><span
        class="ef-chat__runtime-attachment-file-name"
        :title="attachmentLabel(attachment)"
        >{{ attachmentLabel(attachment) }}</span
      ><span class="ef-chat__runtime-attachment-file-type">{{
        attachmentTypeLabel(attachment)
      }}</span></span
    >
    <button
      :aria-label="removeLabel(attachmentLabel(attachment))"
      class="ef-chat__runtime-attachment-remove ef-chat__runtime-attachment-remove--floating"
      type="button"
      @click="emit('remove', attachment.id)"
    >
      <X
        :size="13"
        :style="{
          width: 'var(--agent-ui-composer-icon-size, 13px)',
          height: 'var(--agent-ui-composer-icon-size, 13px)',
        }"
      />
    </button>
  </div>
</template>
