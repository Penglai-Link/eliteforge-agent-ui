<script setup lang="ts">
import { GripVertical, LockKeyhole, Pencil, Send, Square, X, Plus } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  suggestionQuery as getSuggestionQuery,
  filterSuggestions,
  insertSuggestion,
  composerOverlayParts,
  insertNewlineAtCursor,
  pastedImage,
  startQueuedMessageDrag,
  type ComposerSuggestion as ChatInputSuggestion,
  type ComposerSubmitMode as ChatSubmitMode,
} from "@personai/agent-ui-composer-core";
import type { ComposerVueProps } from "./types";
import PendingAttachmentCard from "./PendingAttachmentCard.vue";
const props = withDefaults(defineProps<ComposerVueProps>(), {
  autoFocusComposer: false,
  disabledInput: false,
  inputSuggestions: () => [],
  inputSuggestionLabels: () => ({
    commands: "Commands",
    skills: "Skills",
    commandsAndSkills: "Commands and skills",
  }),
  inputPlaceholder: "Enter to send, Shift+Enter for newline",
  queuedInputPlaceholder: "Enter to queue · Shift+Enter for newline",
  steeringInputPlaceholder:
    "Enter to queue · ⌘/Ctrl+Enter to steer · Shift+Enter for newline",
  sending: false,
  runningSubmitModes: () => [],
  runningEnterSubmitMode: "queue",
  queueDisabled: false,
  steerDisabled: false,
  sendDisabled: false,
  sendLabel: "Send",
  stopLabel: "Stop",
  showStop: true,
  queuedMessages: () => [],
  queuedLabel: "Queued",
  reorderQueuedLabel: "Drag to reorder; use Up/Down keys to move",
  editQueuedLabel: "Edit queued message",
  removeQueuedLabel: "Remove queued message",
  steerQueuedLabel: "Steer queued message",
  queuedSteerDisabled: false,
  pendingAttachments: () => [],
  showAttachmentControl: false,
  attachmentUploadPending: false,
  attachLabel: "Attach file",
  uploadingLabel: "Uploading attachment",
  removeAttachmentLabel: (name: string) => `Remove ${name}`,
});
const emit = defineEmits<{
  "draft-change": [value: string];
  send: [mode?: ChatSubmitMode];
  stop: [];
  "edit-queued-message": [id: string, content: string];
  "remove-queued-message": [id: string];
  "steer-queued-message": [id: string];
  "remove-attachment": [id: string];
}>();
const composerRef = ref<HTMLTextAreaElement | null>(null);
const attachmentFileInput = ref<HTMLInputElement | null>(null);
function handleFileChange(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file && !props.disabledInput && !props.attachmentUploadPending)
    void props.onAttachFile?.(file);
}
function focus() {
  composerRef.value?.focus();
}
defineExpose({ focus, textarea: composerRef });
watch(
  () => props.composerKey,
  async () => {
    if (props.autoFocusComposer) {
      await nextTick();
      focus();
    }
  }
);
onMounted(() => {
  if (props.autoFocusComposer) focus();
});
const activeSuggestion = ref(0);
const suggestionsDismissed = ref(false);
const composerHasSelection = ref(false);
const draggedQueuedId = ref<string | null>(null);
let cancelQueueDrag: (() => void) | undefined;
onBeforeUnmount(() => cancelQueueDrag?.());
// Watch scalar values so a newly rendered callback does not cancel the drag.
// Reordering uses the callback prop directly (also supplied by @reorder-queued-message)
// so Vue tracks callback-only changes instead of treating them as emit listeners.
watch([() => props.composerKey, () => Boolean(props.onReorderQueuedMessage)], () => cancelQueueDrag?.());
function startQueuedPointerDrag(event: PointerEvent) {
  const row = (event.currentTarget as HTMLElement).closest<HTMLElement>(".ef-chat__queued-message");
  if (!row) return;
  cancelQueueDrag?.();
  cancelQueueDrag = startQueuedMessageDrag(event, row,
    (sourceId, targetId) => props.onReorderQueuedMessage?.(sourceId, targetId));
}
function moveQueuedByKey(event: KeyboardEvent, id: string) {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  const index = props.queuedMessages.findIndex(item => item.id === id);
  const target = props.queuedMessages[index + (event.key === "ArrowUp" ? -1 : 1)];
  if (target) props.onReorderQueuedMessage?.(id, target.id);
}
function startQueuedDrag(event: DragEvent, id: string) {
  draggedQueuedId.value = id;
  event.dataTransfer?.setData("text/plain", id);
}
function allowQueuedDrop(event: DragEvent, id: string) {
  if (draggedQueuedId.value && draggedQueuedId.value !== id) event.preventDefault();
}
function dropQueuedMessage(event: DragEvent, id: string) {
  event.preventDefault();
  const sourceId = draggedQueuedId.value;
  draggedQueuedId.value = null;
  if (sourceId && sourceId !== id) props.onReorderQueuedMessage?.(sourceId, id);
}
const suggestionQuery = computed(() => {
  return getSuggestionQuery(props.draft);
});
const visibleSuggestions = computed(() => {
  return filterSuggestions(props.draft, props.inputSuggestions, props.skillSuggestionTriggers);
});
const suggestionGroups = computed(() => {
  const commands = visibleSuggestions.value.filter(
    (item) => item.kind === "command"
  );
  const skills = visibleSuggestions.value.filter(
    (item) => item.kind === "skill"
  );
  return [
    ...(commands.length
      ? [[props.inputSuggestionLabels.commands, commands] as const]
      : []),
    ...(skills.length
      ? [[props.inputSuggestionLabels.skills, skills] as const]
      : []),
  ];
});
const flatSuggestions = computed(() =>
  suggestionGroups.value.flatMap(([, items]) => items)
);
const overlayParts = computed(() =>
  composerOverlayParts(props.draft, props.inputSuggestions)
);
const hasTokens = computed(() => overlayParts.value.some(part => part.displayName !== null));
watch(
  () => props.draft,
  () => {
    activeSuggestion.value = 0;
    suggestionsDismissed.value = false;
  }
);

function chooseSuggestion(item: ChatInputSuggestion) {
  const next = insertSuggestion(props.draft, item);
  const textarea = composerRef.value;
  if (!next || !textarea) return;
  emit("draft-change", next.value);
  void nextTick(() => {
    textarea.focus();
    textarea.setSelectionRange(next.caret, next.caret);
    updateComposerSelection(textarea);
  });
}

function syncComposerOverlayScroll(event: Event) {
  const textarea = event.currentTarget as HTMLTextAreaElement;
  const overlay = textarea.previousElementSibling;
  if (overlay instanceof HTMLElement) overlay.scrollTop = textarea.scrollTop;
}

function updateComposerSelection(eventOrTextarea: Event | HTMLTextAreaElement) {
  const textarea =
    eventOrTextarea instanceof HTMLTextAreaElement
      ? eventOrTextarea
      : (eventOrTextarea.currentTarget as HTMLTextAreaElement);
  composerHasSelection.value = textarea.selectionStart !== textarea.selectionEnd;
}

const canQueueWhileRunning = computed(() =>
  props.runningSubmitModes.includes("queue")
);
const canSteerWhileRunning = computed(() =>
  props.runningSubmitModes.includes("steer")
);
const enterSubmitMode = computed<ChatSubmitMode | null>(() => {
  if (!props.sending) return "send";
  if (props.runningSubmitModes.includes(props.runningEnterSubmitMode)) return props.runningEnterSubmitMode;
  return canQueueWhileRunning.value ? "queue" : canSteerWhileRunning.value ? "steer" : null;
});
const shortcutSubmitMode = computed<ChatSubmitMode | null>(() =>
  props.sending ? props.runningSubmitModes.find(mode => mode !== enterSubmitMode.value) ?? null : null
);
function submitDisabled(mode: ChatSubmitMode) {
  return props.disabledInput || (mode === "queue" ? props.queueDisabled : mode === "steer" ? props.steerDisabled : props.sendDisabled);
}
const composerPlaceholder = computed(() => {
  if (!props.sending || !canQueueWhileRunning.value) {
    return props.inputPlaceholder;
  }
  return canSteerWhileRunning.value
    ? props.steeringInputPlaceholder
    : props.queuedInputPlaceholder;
});
const primarySubmitMode = computed<ChatSubmitMode | null>(() => {
  if (!props.sending) return "send";
  if (canQueueWhileRunning.value) return "queue";
  return null;
});
const primarySubmitDisabled = computed(() => {
  if (props.disabledInput) return true;
  if (primarySubmitMode.value === "queue") return props.queueDisabled;
  return props.sendDisabled;
});
function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (
    !suggestionsDismissed.value &&
    flatSuggestions.value.length &&
    event.key === "ArrowDown"
  ) {
    event.preventDefault();
    activeSuggestion.value =
      (activeSuggestion.value + 1) % flatSuggestions.value.length;
    return;
  }
  if (
    !suggestionsDismissed.value &&
    flatSuggestions.value.length &&
    event.key === "ArrowUp"
  ) {
    event.preventDefault();
    activeSuggestion.value =
      (activeSuggestion.value - 1 + flatSuggestions.value.length) %
      flatSuggestions.value.length;
    return;
  }
  if (
    !suggestionsDismissed.value &&
    flatSuggestions.value.length &&
    event.key === "Escape"
  ) {
    suggestionsDismissed.value = true;
    return;
  }
  if (
    !suggestionsDismissed.value &&
    flatSuggestions.value.length &&
    (event.key === "Enter" || (event.key === "Tab" && !event.altKey)) &&
    !event.shiftKey && !event.metaKey && !event.ctrlKey
  ) {
    event.preventDefault();
    chooseSuggestion(flatSuggestions.value[activeSuggestion.value]);
    return;
  }
  if (event.key === "Enter" && event.shiftKey) {
    event.preventDefault();
    emit(
      "draft-change",
      insertNewlineAtCursor(event.currentTarget as HTMLTextAreaElement)
    );
    return;
  }
  const commandShortcut = event.metaKey || event.ctrlKey;
  if (props.sending && commandShortcut && event.key === "Enter") {
    event.preventDefault();
    if (shortcutSubmitMode.value && !submitDisabled(shortcutSubmitMode.value)) emit("send", shortcutSubmitMode.value);
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (enterSubmitMode.value && !submitDisabled(enterSubmitMode.value)) emit("send", enterSubmitMode.value);
}

function handleStopSubmit() { emit("stop"); }

function handleComposerPaste(event: ClipboardEvent) {
  if (props.disabledInput || !props.onPasteAttachment) return;
  const file = pastedImage(event.clipboardData);
  if (!file) return;
  event.preventDefault();
  void props.onPasteAttachment(file);
}
</script>
<template>
  <div
    class="ef-composer"
    data-theme-part="composer"
    data-theme-anchor="composer"
  >
    <section
      v-if="queuedMessages.length"
      :aria-label="queuedLabel"
      class="ef-chat__queued-messages"
    >
      <div class="ef-chat__queued-messages-header">
        <span>{{ queuedLabel }}</span>
        <span class="ef-chat__queued-messages-count">{{
          queuedMessages.length
        }}</span>
      </div>
      <ol class="ef-chat__queued-messages-list">
        <li
          v-for="queuedMessage in queuedMessages"
          :key="queuedMessage.id"
          class="ef-chat__queued-message"
          :data-queued-id="queuedMessage.id"
          :draggable="Boolean(onReorderQueuedMessage)"
          @dragstart="startQueuedDrag($event, queuedMessage.id)"
          @dragover="allowQueuedDrop($event, queuedMessage.id)"
          @drop="dropQueuedMessage($event, queuedMessage.id)"
          @dragend="draggedQueuedId = null"
        >
          <button v-if="onReorderQueuedMessage && queuedMessages.length > 1"
            type="button" class="ef-chat__icon-button ef-chat__queue-drag-handle"
            :aria-label="reorderQueuedLabel" :title="reorderQueuedLabel"
            @pointerdown="startQueuedPointerDrag" @keydown="moveQueuedByKey($event, queuedMessage.id)">
            <GripVertical :size="14" aria-hidden="true" />
          </button>
          <span class="ef-chat__queued-message-content">{{
            queuedMessage.input.content
          }}</span>
          <span class="ef-chat__queued-message-actions">
            <button v-if="onSteerQueuedMessage && canSteerWhileRunning"
              :aria-label="steerQueuedLabel" class="ef-chat__icon-button" :title="steerQueuedLabel"
              type="button" :disabled="queuedSteerDisabled"
              @click="emit('steer-queued-message', queuedMessage.id)">
              <Send :size="14" />
            </button>
            <button
              v-if="onEditQueuedMessage"
              :aria-label="editQueuedLabel"
              class="ef-chat__icon-button"
              :title="editQueuedLabel"
              type="button"
              @click="
                emit(
                  'edit-queued-message',
                  queuedMessage.id,
                  queuedMessage.input.content
                )
              "
            >
              <Pencil
                :size="14"
                :style="{
                  width: 'var(--agent-ui-composer-icon-size, 14px)',
                  height: 'var(--agent-ui-composer-icon-size, 14px)',
                }"
              />
            </button>
            <button
              v-if="onRemoveQueuedMessage"
              :aria-label="removeQueuedLabel"
              class="ef-chat__icon-button"
              :title="removeQueuedLabel"
              type="button"
              @click="emit('remove-queued-message', queuedMessage.id)"
            >
              <X
                :size="15"
                :style="{
                  width: 'var(--agent-ui-composer-icon-size, 15px)',
                  height: 'var(--agent-ui-composer-icon-size, 15px)',
                }"
              />
            </button>
          </span>
        </li>
      </ol>
    </section>
    <div class="ef-chat__composer" :data-input-disabled="disabledInput ? 'true' : undefined">
      <div
        v-if="
          suggestionQuery && !suggestionsDismissed && flatSuggestions.length
        "
        class="ef-chat__suggestions"
        role="listbox"
        :aria-label="
          flatSuggestions.every(item => item.kind === 'command')
            ? inputSuggestionLabels.commands
            : flatSuggestions.every(item => item.kind === 'skill')
              ? inputSuggestionLabels.skills
              : inputSuggestionLabels.commandsAndSkills
        "
      >
        <section
          v-for="[group, items] in suggestionGroups"
          :key="group"
          class="ef-chat__suggestion-group"
        >
          <div class="ef-chat__suggestion-heading">{{ group }}</div>
          <button
            v-for="item in items"
            :key="`${item.kind}:${item.name}`"
            class="ef-chat__suggestion"
            :data-active="flatSuggestions.indexOf(item) === activeSuggestion"
            role="option"
            :aria-selected="flatSuggestions.indexOf(item) === activeSuggestion"
            type="button"
            @mousedown.prevent
            @click="chooseSuggestion(item)"
          >
            <span class="ef-chat__suggestion-name"
              >{{ item.kind === "command" ? "/" : "$" }}{{ item.name }}</span
            >
            <span
              v-if="item.description"
              class="ef-chat__suggestion-description"
              >{{ item.description }}</span
            >
          </button>
        </section>
      </div>
      <div v-if="pendingAttachments.length" class="ef-chat__composer-header">
        <div
          class="ef-chat__runtime-attachments ef-chat__runtime-attachments--pending"
        >
          <PendingAttachmentCard
            v-for="attachment in pendingAttachments"
            :key="attachment.id"
            :attachment="attachment"
            :download-attachment="attachmentDownloader"
            :remove-label="removeAttachmentLabel"
            @remove="emit('remove-attachment', $event)"
          />
        </div>
      </div>
      <div
        v-if="$slots.composerHeader || composerHeader"
        class="ef-chat__composer-header"
      >
        <slot name="composerHeader"><component :is="composerHeader" /></slot>
      </div>
      <div
        class="ef-chat__composer-editor"
        :data-input-locked="disabledInput && disabledInputReason ? 'true' : undefined"
        :data-has-tokens="hasTokens && !composerHasSelection ? 'true' : undefined"
      >
      <div v-if="disabledInput && disabledInputReason" class="ef-chat__composer-disabled-reason" role="status">
        <LockKeyhole :size="14" aria-hidden="true" />
        <span>{{ disabledInputReason }}</span>
      </div>
        <div class="ef-chat__composer-overlay" aria-hidden="true">
          <span
            v-for="(part, index) in overlayParts"
            :key="index"
            :class="{ 'ef-chat__skill-token': part.displayName !== null }"
            ><template v-if="part.displayName"
              ><span class="ef-chat__skill-token-label">{{
                part.displayName
              }}</span></template
            ><template v-else>{{ part.text }}</template></span
          >
        </div>
        <textarea
          ref="composerRef"
          class="ef-chat__textarea"
          data-theme-part="chat-input"
          data-theme-anchor="chat-input"
          :autofocus="autoFocusComposer"
          :disabled="disabledInput"
          :aria-description="disabledInput ? disabledInputReason : undefined"
          :placeholder="composerPlaceholder"
          :value="draft"
          :aria-keyshortcuts="
            shortcutSubmitMode
              ? 'Meta+Enter Control+Enter'
              : undefined
          "
          @input="
                (e: Event) => {
                  updateComposerSelection(e);
                  emit('draft-change', (e.target as HTMLTextAreaElement).value);
                }
              "
          @click="updateComposerSelection"
          @focus="updateComposerSelection"
          @blur="composerHasSelection = false"
          @keyup="updateComposerSelection"
          @select="updateComposerSelection"
          @scroll="syncComposerOverlayScroll"
          @paste="handleComposerPaste"
          @keydown="handleKeydown"
        />
      </div>
      <div class="ef-chat__composer-row">
        <div class="ef-chat__composer-addon">
          <template v-if="showAttachmentControl && onAttachFile">
            <input
              ref="attachmentFileInput"
              class="ef-chat__runtime-attachment-input"
              type="file"
              @change="handleFileChange"
            />
            <button
              :aria-label="attachLabel"
              class="ef-chat__icon-button"
              :disabled="disabledInput || attachmentUploadPending"
              :title="attachmentUploadPending ? uploadingLabel : attachLabel"
              type="button"
              @click="attachmentFileInput?.click()"
            >
              <Plus
                :size="16"
                :style="{
                  width: 'var(--agent-ui-composer-icon-size, 16px)',
                  height: 'var(--agent-ui-composer-icon-size, 16px)',
                }"
              />
            </button>
          </template>
          <slot name="footerAddon" :disabled="disabledInput" />
        </div>
        <div class="ef-chat__composer-actions">
          <button
            v-if="sending && showStop"
            :aria-label="stopLabel"
            class="ef-chat__button ef-chat__button_send ef-chat__button--danger"
            :title="stopLabel"
            type="button"
            @click="handleStopSubmit"
          >
            <Square
              :size="14"
              :style="{
                width: 'var(--agent-ui-composer-icon-size, 14px)',
                height: 'var(--agent-ui-composer-icon-size, 14px)',
              }"
            />
          </button>
          <button
            v-if="!sending"
            :aria-label="sendLabel"
            class="ef-chat__button ef-chat__button_send"
            :disabled="disabledInput || sendDisabled"
            :title="sendLabel"
            type="button"
            @click="emit('send', 'send')"
          >
            <Send
              :size="15"
              :style="{
                width: 'var(--agent-ui-composer-icon-size, 15px)',
                height: 'var(--agent-ui-composer-icon-size, 15px)',
              }"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
