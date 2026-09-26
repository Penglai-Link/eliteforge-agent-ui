<script setup lang="ts">
import { FileText, MessageSquareText } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import type { ChatAttachmentLabels, ChatMessageAttachment } from "@eliteforge/agent-ui-chat-core";

const props = defineProps<{
  attachments?: ChatMessageAttachment[];
  attachmentLabels: ChatAttachmentLabels;
  downloadAttachment?: (attachment: ChatMessageAttachment) => Promise<Blob>;
  formatAnnotationCount: (count: number) => string;
}>();

const emit = defineEmits<{
  previewImage: [source: string, alt: string];
}>();

const imageSources = ref<Record<string, string>>({});
const objectUrls = new Map<string, string>();

const imageAttachments = computed(() => (props.attachments ?? []).filter((attachment) => {
  const contentType = attachment.contentType?.toLowerCase();
  return attachment.kind === "image"
    || Boolean(attachment.imageUrl)
    || Boolean(contentType?.startsWith("image/"));
}));
const inspectionAttachments = computed(() => (props.attachments ?? []).filter(
  (attachment) => attachment.kind === "inspection",
));
const annotationPreviewOpen = ref(false);
const annotationPreviewId = useId();
const annotationCountLabel = computed(() => props.formatAnnotationCount(inspectionAttachments.value.length));

function revokeSources() {
  objectUrls.forEach((source) => URL.revokeObjectURL(source));
  objectUrls.clear();
  imageSources.value = {};
}

function closeAnnotationPreview(event: FocusEvent) {
  const currentTarget = event.currentTarget as HTMLElement | null;
  if (!currentTarget?.contains(event.relatedTarget as Node | null)) {
    annotationPreviewOpen.value = false;
  }
}

async function loadSources(attachments: ChatMessageAttachment[]) {
  revokeSources();
  const nextSources: Record<string, string> = {};
  await Promise.all(attachments.map(async (attachment) => {
    if (attachment.imageUrl) {
      nextSources[attachment.id] = attachment.imageUrl;
      return;
    }
    if (!props.downloadAttachment) return;
    try {
      const blob = await props.downloadAttachment(attachment);
      const source = URL.createObjectURL(blob);
      objectUrls.set(attachment.id, source);
      nextSources[attachment.id] = source;
    } catch {
      // The resource can have been deleted together with its chat session.
    }
  }));
  imageSources.value = nextSources;
}

watch(
  [imageAttachments, () => props.downloadAttachment],
  ([attachments]) => { void loadSources(attachments); },
  { immediate: true },
);

onBeforeUnmount(revokeSources);
</script>

<template>
  <section
    v-if="imageAttachments.length || inspectionAttachments.length"
    :aria-label="inspectionAttachments.length ? annotationCountLabel : attachmentLabels.attachments"
    class="ef-chat__inspection-attachments"
  >
    <div class="ef-chat__inspection-previews">
      <figure
        v-for="attachment in imageAttachments"
        v-show="imageSources[attachment.id]"
        :key="attachment.id"
        class="ef-chat__inspection-preview"
      >
        <button
          :aria-label="`Preview ${attachment.summary}`"
          class="ef-chat__inspection-preview-button"
          type="button"
          @click="emit('previewImage', imageSources[attachment.id], attachment.summary)"
        >
          <img :alt="attachment.summary" :src="imageSources[attachment.id]" />
        </button>
      </figure>
    </div>
    <div
      v-if="inspectionAttachments.length"
      class="ef-chat__inspection-count-wrap"
      @blur="closeAnnotationPreview"
      @focus="annotationPreviewOpen = true"
      @mouseenter="annotationPreviewOpen = true"
      @mouseleave="annotationPreviewOpen = false"
    >
      <button
        :aria-controls="annotationPreviewId"
        :aria-expanded="annotationPreviewOpen"
        :aria-label="`${attachmentLabels.annotationPreview}: ${annotationCountLabel}`"
        class="ef-chat__inspection-count"
        type="button"
      >
        <MessageSquareText :size="16" />
        <span>{{ annotationCountLabel }}</span>
      </button>
      <div
        v-if="annotationPreviewOpen"
        :aria-label="attachmentLabels.annotationPreview"
        :id="annotationPreviewId"
        class="ef-chat__annotation-preview"
        role="tooltip"
      >
        <strong>{{ attachmentLabels.annotationPreview }}</strong>
        <div class="ef-chat__annotation-preview-list">
          <div
            v-for="attachment in inspectionAttachments"
            :key="attachment.id"
            class="ef-chat__annotation-preview-item"
          >
            <button
              v-if="imageSources[attachment.id]"
              :aria-label="`Preview ${attachment.summary}`"
              class="ef-chat__annotation-preview-image-button"
              type="button"
              @click="emit('previewImage', imageSources[attachment.id], attachment.summary)"
            >
              <img :alt="attachment.summary" :src="imageSources[attachment.id]" />
            </button>
            <div v-else class="ef-chat__annotation-preview-placeholder">
              <FileText :size="16" />
            </div>
            <span :title="attachment.summary">{{ attachment.summary }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
