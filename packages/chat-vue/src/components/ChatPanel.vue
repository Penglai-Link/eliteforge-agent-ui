<script setup lang="ts">
import { ArrowDown, Bot, Pencil, Send, Square, X } from "lucide-vue-next";
import {
  buildTranscriptPresentation,
  describeDebugEvent,
  type ChatAttachmentLabels,
  type ChatMessage,
  type ChatSubmitMode,
  type ChatUserInputRequest,
} from "@eliteforge/agent-ui-chat-core";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { cx, insertNewlineAtCursor } from "../utils";
import ChatBubble from "./ChatBubble.vue";
import WaitingRail from "./WaitingRail.vue";
import ChatUserInputCard from "./ChatUserInputCard.vue";
import AguiRunWorkRail from "./AguiRunWorkRail.vue";
import ChatAttachments from "./ChatAttachments.vue";
import { ChatPanelProps } from "../types";

const props = withDefaults(defineProps<ChatPanelProps>(), {
  attachmentDownloader: undefined,
  attachmentLabels: (): ChatAttachmentLabels => ({
    annotationPreview: "Annotation preview",
    attachments: "Attachments",
  }),
  autoFocusComposer: false,
  composerHeader: undefined,
  createSessionLabel: "Create session",
  currentUserDisplayName: "",
  debugOptions: undefined,
  disabledInput: false,
  emptyDescription: "Create a session to start chatting.",
  emptyTitle: "No session selected",
  formatAnnotationCount: (count: number) => `${count} annotation${count === 1 ? "" : "s"}`,
  inputPlaceholder: "Enter to send, Shift+Enter for newline",
  liveAguiAnchorMessageCodes: () => ({}),
  liveAguiEvents: () => [],
  liveAguiPendingAnchorMessageCode: "",
  liveAguiPending: false,
  onCreateSession: undefined,
  onEditMessage: undefined,
  onEditQueuedMessage: undefined,
  onRemoveQueuedMessage: undefined,
  onPasteAttachment: undefined,
  onStop: undefined,
  protocolEvents: () => [],
  queueDisabled: false,
  queuedLabel: "Queued",
  queuedMessages: () => [],
  runningSubmitModes: () => [],
  sendDisabled: false,
  sendLabel: "Send",
  sending: false,
  session: null,
  showAgui: true,
  showHeader: true,
  showStop: true,
  steerDisabled: false,
  stopLabel: "Stop",
  title: "",
  userInputLabels: undefined,
  workRailLabels: undefined,
  userInputRequests: () => [],
  userInputRequest: null,
  userInputAnswerPending: false,
  onAnswerUserInput: undefined,
});

const emit = defineEmits<{
  "create-session": [];
  "new-session": [];
  "draft-change": [value: string];
  "edit-message": [value: string];
  "edit-queued-message": [id: string, content: string];
  "remove-queued-message": [id: string];
  send: [mode?: ChatSubmitMode];
  stop: [];
}>();

const transcriptRef = ref<HTMLElement | null>(null);
const composerRef = ref<HTMLTextAreaElement | null>(null);
const showJumpButton = ref(false);
const autoStickToBottom = ref(true);
const previewImage = ref<{ alt: string; source: string } | null>(null);

function isUserInputAnswerSummary(message: ChatMessage) {
  if (message.role !== "USER") return false;
  const content = message.content.trimStart();
  return content.startsWith("The user answered the questions you asked:")
    || content.startsWith("用户回答了你提出的问题：");
}

function openImagePreview(source: string, alt: string) {
  previewImage.value = { alt, source };
}

function closeImagePreview() {
  previewImage.value = null;
}

watch(previewImage, (image, _, onCleanup) => {
  if (!image) return;
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") closeImagePreview();
  };
  document.addEventListener("keydown", handleKeyDown);
  onCleanup(() => document.removeEventListener("keydown", handleKeyDown));
});

const canQueueWhileRunning = computed(() =>
  props.runningSubmitModes.includes("queue"),
);
const canSteerWhileRunning = computed(() =>
  props.runningSubmitModes.includes("steer"),
);
const composerPlaceholder = computed(() => {
  if (!props.sending || !canQueueWhileRunning.value) {
    return props.inputPlaceholder;
  }
  return canSteerWhileRunning.value
    ? "Enter 加入队列 · ⌘/Ctrl+Enter 立即调整当前回复 · Shift+Enter 换行"
    : "Enter 加入队列 · Shift+Enter 换行";
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
const streamingAssistantMessageCode = computed(() => {
  if (props.streamingAssistantMessageCode !== undefined) {
    return props.streamingAssistantMessageCode || undefined;
  }
  if (!props.sending) return undefined;
  const latestMessage = props.messages[props.messages.length - 1];
  return latestMessage?.role === "ASSISTANT" ? latestMessage.messageId : undefined;
});
const transcriptMessages = computed(() =>
  props.messages.filter((message) =>
    message.messageId !== streamingAssistantMessageCode.value || message.content.trim().length > 0,
  ),
);

const presentation = computed(() =>
  buildTranscriptPresentation({
    debugOptions: props.debugOptions,
    liveAguiAnchorMessageCodes: props.liveAguiAnchorMessageCodes,
    liveAguiEvents: props.liveAguiEvents,
    liveAguiPendingAnchorMessageCode: props.liveAguiPendingAnchorMessageCode,
    liveAguiPending: props.liveAguiPending,
    messages: props.messages,
    protocolEvents: props.protocolEvents,
    sessionId: props.session?.sessionId ?? "",
  }),
);

function scrollToBottom(behavior: ScrollBehavior = "auto") {
  const element = transcriptRef.value;
  if (!element) return;
  element.scrollTo({ behavior, top: element.scrollHeight });
  autoStickToBottom.value = true;
  showJumpButton.value = false;
}

function handleScroll() {
  const element = transcriptRef.value;
  if (!element) return;
  const distanceFromBottom =
    element.scrollHeight - element.scrollTop - element.clientHeight;
  autoStickToBottom.value = distanceFromBottom <= 96;
  showJumpButton.value = distanceFromBottom > 160;
}

function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === "Enter" && event.shiftKey) {
    event.preventDefault();
    emit(
      "draft-change",
      insertNewlineAtCursor(event.currentTarget as HTMLTextAreaElement),
    );
    return;
  }
  const commandShortcut = event.metaKey || event.ctrlKey;
  if (
    props.sending &&
    commandShortcut &&
    event.key === "Enter"
  ) {
    event.preventDefault();
    if (
      canSteerWhileRunning.value &&
      !props.disabledInput &&
      !props.steerDisabled
    ) {
      emit("send", "steer");
    }
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (primarySubmitMode.value && !primarySubmitDisabled.value) {
    emit("send", primarySubmitMode.value);
  }
}

function handleStopSubmit() {
  if (props.onStop) {
    props.onStop();
    return;
  }
  emit("stop");
}

function handleComposerPaste(event: ClipboardEvent) {
  if (props.disabledInput || !props.onPasteAttachment) return;
  const imageItem = Array.from(event.clipboardData?.items ?? []).find(
    (item) => item.kind === "file" && item.type.startsWith("image/"),
  );
  const file = imageItem?.getAsFile();
  if (!file) return;
  event.preventDefault();
  const fileName = file.name.trim() || `pasted-image-${Date.now()}.${file.type.split("/")[1] || "png"}`;
  const normalizedFile = file.name.trim()
    ? file
    : new File([file], fileName, { type: file.type || "image/png" });
  void props.onPasteAttachment(normalizedFile);
}

function workRailsForMessage(message: ChatMessage) {
  return (
    presentation.value.workRailsByMessageCode.get(message.messageId) ?? []
  );
}

function debugEventsForRun(runId: string) {
  return (presentation.value.debugEventsByRunCode.get(runId) ?? []).map(
    (event) => describeDebugEvent(event),
  );
}

watch([() => props.messages, presentation], async () => {
  if (autoStickToBottom.value) {
    await nextTick();
    scrollToBottom("auto");
  } else {
    handleScroll();
  }
});

watch(
  () => props.session?.sessionId,
  async () => {
    autoStickToBottom.value = true;
    showJumpButton.value = false;
    if (props.autoFocusComposer) {
      await nextTick();
      composerRef.value?.focus();
    }
  },
);

onMounted(() => {
  scrollToBottom("auto");
  if (props.autoFocusComposer) composerRef.value?.focus();
});
</script>

<template>
  <div class="ef-chat" data-theme-part="chat">
    <span
      aria-hidden="true"
      class="ef-chat__theme-effect-layer"
      data-theme-effect-layer="chat"
    />
    <div
      v-if="previewImage"
      aria-label="Image preview"
      aria-modal="true"
      class="ef-chat__image-preview-dialog"
      role="dialog"
      @click.self="closeImagePreview"
    >
      <div class="ef-chat__image-preview-content">
        <button
          aria-label="Close image preview"
          class="ef-chat__image-preview-close"
          title="Close image preview"
          type="button"
          @click="closeImagePreview"
        >
          <X :size="18" />
        </button>
        <img :alt="previewImage.alt" :src="previewImage.source" />
      </div>
    </div>
    <header v-if="showHeader" class="ef-chat__header">
      <div class="ef-chat__header-content">
        <slot name="header">
          <span class="ef-chat__title">{{
            title || session?.title || "Chat"
          }}</span>
          <span v-if="session" class="ef-chat__subtitle">
            {{ session.sessionId }} ·
            {{ session.displayName || "Assistant" }}
          </span>
        </slot>
      </div>
    </header>

    <template v-if="session">
      <div
        :class="
          cx(
            'ef-chat__content',
            $slots.sidebar && 'ef-chat__content--with-sidebar',
          )
        "
      >
        <section
          ref="transcriptRef"
          aria-label="Chat transcript"
          class="ef-chat__transcript"
          @scroll="handleScroll"
        >
          <div v-if="transcriptMessages.length" class="ef-chat__transcript-inner">
            <template v-for="message in transcriptMessages" :key="message.messageId">
              <ChatBubble
                v-if="!isUserInputAnswerSummary(message)"
                :current-user-display-name="currentUserDisplayName"
                :is-streaming="message.messageId === streamingAssistantMessageCode"
                :message="message"
                @edit-message="
                  (content: string) => emit('edit-message', content)
                "
              />
              <ChatAttachments
                v-if="message.role === 'USER'"
                :attachments="message.attachments"
                :attachment-labels="attachmentLabels"
                :download-attachment="attachmentDownloader"
                :format-annotation-count="formatAnnotationCount"
                @preview-image="openImagePreview"
              />
              <WaitingRail
                v-if="
                  showAgui &&
                  message.messageId ===
                    presentation.waitingForModelAnchorMessageCode
                "
              />
              <template v-if="showAgui">
                <AguiRunWorkRail
                  v-for="run in workRailsForMessage(message)"
                  :key="run.runId"
                  :debug-events="debugEventsForRun(run.runId)"
                  :events="run.events"
                  :labels="props.workRailLabels"
                  :message-code="message.messageId"
                  :user-input-requests="props.userInputRequests"
                />
              </template>
            </template>
          </div>
          <Bot
            :size="40"
            :strokeWidth="1"
            class="ef-chat__transcript__bot"
            v-else
          />
        <ChatUserInputCard
          v-if="props.userInputRequest?.status === 'Pending' && props.onAnswerUserInput"
          :disabled="props.userInputAnswerPending"
          :labels="props.userInputLabels"
          :request="props.userInputRequest"
          @submit="props.onAnswerUserInput"
        />
        </section>
        <aside v-if="$slots.sidebar" class="ef-chat__sidebar">
          <slot name="sidebar" />
        </aside>
      </div>

      <footer class="ef-chat__footer">

        <button
          v-if="showJumpButton"
          aria-label="Jump to latest message"
          class="ef-chat__button ef-chat__jump"
          type="button"
          @click="scrollToBottom('smooth')"
        >
          <ArrowDown :size="16" />
        </button>
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
            >
              <span class="ef-chat__queued-message-content">{{
                queuedMessage.input.content
              }}</span>
              <span class="ef-chat__queued-message-actions">
                <button
                  v-if="onEditQueuedMessage"
                  aria-label="Edit queued message"
                  class="ef-chat__icon-button"
                  title="Edit queued message"
                  type="button"
                  @click="
                    emit(
                      'edit-queued-message',
                      queuedMessage.id,
                      queuedMessage.input.content,
                    )
                  "
                >
                  <Pencil :size="14" />
                </button>
                <button
                  v-if="onRemoveQueuedMessage"
                  aria-label="Remove queued message"
                  class="ef-chat__icon-button"
                  title="Remove queued message"
                  type="button"
                  @click="emit('remove-queued-message', queuedMessage.id)"
                >
                  <X :size="15" />
                </button>
              </span>
            </li>
          </ol>
        </section>
        <div class="ef-chat__composer">
          <div v-if="composerHeader" class="ef-chat__composer-header">
            <component :is="composerHeader" />
          </div>
          <textarea
            ref="composerRef"
            class="ef-chat__textarea"
            data-theme-part="chat-input"
            :autofocus="autoFocusComposer"
            :disabled="disabledInput"
            :placeholder="composerPlaceholder"
            :value="draft"
            :aria-keyshortcuts="
              sending && canSteerWhileRunning
                ? 'Meta+Enter Control+Enter'
                : undefined
            "
            @input="
              (e: Event) =>
                emit('draft-change', (e.target as HTMLTextAreaElement).value)
            "
            @paste="handleComposerPaste"
            @keydown="handleKeydown"
          />
          <div class="ef-chat__composer-row">
            <div class="ef-chat__composer-addon">
              <slot name="footerAddon" />
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
                <Square :size="14" />
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
                <Send :size="15" />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </template>

    <template v-else>
      <div
        :class="
          cx(
            'ef-chat__content',
            $slots.sidebar && 'ef-chat__content--with-sidebar',
          )
        "
      >
        <section class="ef-chat__transcript">
          <div class="ef-chat__empty">
            <div class="ef-chat__empty-inner">
              <div class="ef-chat__empty-title">{{ emptyTitle }}</div>
              <div class="ef-chat__empty-description">
                {{ emptyDescription }}
              </div>
              <div style="margin-top: 16px">
                <button
                  class="ef-chat__button"
                  type="button"
                  @click="emit('create-session')"
                >
                  {{ createSessionLabel }}
                </button>
              </div>
            </div>
          </div>
        <ChatUserInputCard
          v-if="props.userInputRequest?.status === 'Pending' && props.onAnswerUserInput"
          :disabled="props.userInputAnswerPending"
          :labels="props.userInputLabels"
          :request="props.userInputRequest"
          @submit="props.onAnswerUserInput"
        />
        </section>
        <aside v-if="$slots.sidebar" class="ef-chat__sidebar">
          <slot name="sidebar" />
        </aside>
      </div>
    </template>
  </div>
</template>
