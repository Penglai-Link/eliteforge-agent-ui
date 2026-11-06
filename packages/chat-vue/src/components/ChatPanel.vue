<script setup lang="ts">
import { chatAnnotationsByMessage, chatAnnotationTooltip, mountChatAnnotationSelection, mountChatAnnotationPreviews, openChatAnnotationEditor, type ChatAnnotation, defaultChatAnnotationLabels } from "@eliteforge/agent-ui-chat-core";
import { Composer } from "@eliteforge/agent-ui-composer-vue";
import { ArrowDown, Bot, X } from "lucide-vue-next";
import {
  buildTranscriptPresentation,
  buildTranscriptWorkTimeline,
  interactionMessages,
  historyWorkGroups,
  historyCoversAguiWork,
  defaultHistoryLabels,
  describeDebugEvent,
  type ChatAttachmentLabels,
  type ChatMessage,
  type ChatInputSuggestionLabels,
  type ChatSubmitMode,
} from "@eliteforge/agent-ui-chat-core";
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { cx } from "../utils";
import ChatBubble from "./ChatBubble.vue";
import HistoryWorkRail from "./HistoryWorkRail.vue";
import StructuredMessageDetails from "./StructuredMessageDetails.vue";
import WaitingRail from "./WaitingRail.vue";
import ChatUserInputGroup from "./ChatUserInputGroup.vue";
import AguiRunWorkRail from "./AguiRunWorkRail.vue";
import ChatAttachments from "./ChatAttachments.vue";
import { ChatPanelProps } from "../types";
import { buildChatHistoryTurns } from "../chatHistory";
import ChatHistoryRail from "./ChatHistoryRail.vue";

const props = withDefaults(defineProps<ChatPanelProps>(), {
  annotationLabels: () => defaultChatAnnotationLabels,
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
  inputSuggestions: () => [],
  inputSuggestionLabels: (): ChatInputSuggestionLabels => ({ commands: "Commands", skills: "Skills", commandsAndSkills: "Commands and skills" }),
  liveAguiAnchorMessageCodes: () => ({}),
  liveAguiEvents: () => [],
  liveAguiPendingAnchorMessageCode: "",
  liveAguiPending: false,
  locale: undefined,
  onCreateSession: undefined,
  onEditMessage: undefined,
  onEditQueuedMessage: undefined,
  onRemoveQueuedMessage: undefined,
  onPasteAttachment: undefined,
  onStop: undefined,
  protocolEvents: () => [],
  queuedInputPlaceholder: "Enter 加入队列 · Shift+Enter 换行",
  steeringInputPlaceholder: "Enter 加入队列 · ⌘/Ctrl+Enter 立即调整当前回复 · Shift+Enter 换行",
  queueDisabled: false,
  queuedLabel: "Queued",
  queuedMessages: () => [],
  runningSubmitModes: () => [],
  runningEnterSubmitMode: "queue",
  sendDisabled: false,
  sendLabel: "Send",
  sending: false,
  session: null,
  showAgui: true,
  showHeader: true,
  showHistoryRail: true,
  showComposer: true,
  showStop: true,
  steerDisabled: false,
  stopLabel: "Stop",
  title: "",
  userInputLabels: undefined,
  workRailLabels: undefined,
  userInputRequests: () => [],
  userInputRequest: null,
  userInputAnswerPending: false,
  userInputAnswerFailed: false,
  onAnswerUserInput: undefined,
});

const emit = defineEmits<{
  "create-session": [];
  "new-session": [];
  "draft-change": [value: string];
  "pending-annotations-change": [annotations: ChatAnnotation[]];
  "edit-message": [value: string, message?: ChatMessage];
  "edit-queued-message": [id: string, content: string];
  "remove-queued-message": [id: string];
  "steer-queued-message": [id: string];
  "reorder-queued-message": [sourceId: string, targetId: string];
  send: [mode?: ChatSubmitMode];
  stop: [];
}>();

const annotationRootRef = ref<HTMLElement | null>(null);
watch(annotationRootRef, (root, _, onCleanup) => { if (root) onCleanup(mountChatAnnotationPreviews(root)); }, { flush: 'post' });
const transcriptRef = ref<HTMLElement | null>(null);
let disposeAnnotationEditor: (() => void) | undefined;
onBeforeUnmount(() => disposeAnnotationEditor?.());
watch([() => props.session?.sessionId, () => props.session?.status, () => props.disabledInput], () => disposeAnnotationEditor?.());
function editPendingAnnotation(annotation: ChatAnnotation, event: MouseEvent) {
  disposeAnnotationEditor?.();
  disposeAnnotationEditor = openChatAnnotationEditor(event.currentTarget as HTMLElement, annotation, updated => {
    changeAnnotations(annotations.value.map(item => item.id === updated.id ? updated : item));
  }, props.annotationLabels);
}
const internalAnnotations = ref<ChatAnnotation[]>([]);
const annotations = computed(() => props.pendingAnnotations ?? internalAnnotations.value);
const annotationDraft = computed(() => ({content: props.draft, annotations: annotations.value}));
const annotationMap = computed(() => chatAnnotationsByMessage(props.messages));
function changeAnnotations(next: ChatAnnotation[]) {
  if (props.pendingAnnotations === undefined) internalAnnotations.value = next;
  emit('pending-annotations-change', next);
}
function changeAnnotatedDraft(value: string) { emit('draft-change', value); }
watch(() => props.session?.sessionId, () => { internalAnnotations.value = []; });
watch([transcriptRef, () => props.session?.sessionId, () => props.session?.status, () => props.disabledInput, () => props.annotationLabels], (_, __, onCleanup) => {
  if (!transcriptRef.value || props.disabledInput || props.session?.status === 'ARCHIVED') return;
  onCleanup(mountChatAnnotationSelection(transcriptRef.value, annotation => {
    changeAnnotations([...annotations.value, annotation]);
  }, props.annotationLabels));
}, { flush: 'post' });

const showJumpButton = ref(false);
const autoStickToBottom = ref(true);
const previewImage = ref<{ alt: string; source: string } | null>(null);
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

const streamingAssistantMessageCode = computed(() => {
  if (props.streamingAssistantMessageCode !== undefined) {
    return props.streamingAssistantMessageCode || undefined;
  }
  if (!props.sending) return undefined;
  const latestMessage = props.messages[props.messages.length - 1];
  return latestMessage?.role === "ASSISTANT" ? latestMessage.messageId : undefined;
});
const transcriptMessages = computed(() =>
  interactionMessages(props.messages, props.userInputRequests, props.workRailLabels, props.userInputLabels).filter((message) =>
    message.messageId !== streamingAssistantMessageCode.value || message.content.trim().length > 0 || !!message.a2ui,
  ),
);

const historyWork = computed(() => historyWorkGroups(transcriptMessages.value));

const presentation = computed(() =>
  buildTranscriptPresentation({
    debugOptions: props.debugOptions,
    liveAguiAnchorMessageCodes: props.liveAguiAnchorMessageCodes,
    liveAguiEvents: props.liveAguiEvents,
    liveAguiPendingAnchorMessageCode: props.liveAguiPendingAnchorMessageCode,
    liveAguiPending: props.liveAguiPending,
    messages: transcriptMessages.value,
    protocolEvents: props.protocolEvents,
    sessionId: props.session?.sessionId ?? "",
  }),
);
const workTimeline = computed(() => buildTranscriptWorkTimeline(transcriptMessages.value, presentation.value, props.userInputRequests, { showReasoningCards: props.showReasoningCards }));
const historyTurns = computed(() => buildChatHistoryTurns(transcriptMessages.value, presentation.value));
const messagesById = computed(() => new Map(transcriptMessages.value.map(message => [message.messageId, message])));

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

function workRailsForMessage(message: ChatMessage, before = false) {
  return (
    (before ? workTimeline.value.before : workTimeline.value.after).get(message.messageId) ?? []
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

  },
);

onMounted(() => {
  scrollToBottom("auto");

});
</script>

<template>
  <div ref="annotationRootRef" class="ef-chat" data-theme-part="chat" data-theme-anchor="chat">
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
      role="dialog" data-theme-anchor="dialog"
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
        <ChatHistoryRail v-if="showHistoryRail && !historyLoading" :turns="historyTurns" :transcript="transcriptRef" />
        <section
          ref="transcriptRef"
          aria-label="Chat transcript"
          class="ef-chat__transcript"
          @scroll="handleScroll"
        >
          <button v-if="!props.historyLoading && props.onLoadOlderHistory" type="button" :disabled="props.historyLoadingOlder" @click="props.onLoadOlderHistory">{{ props.historyLoadingOlder ? (props.historyLabels ?? defaultHistoryLabels).loading : (props.historyLabels ?? defaultHistoryLabels).loadOlder }}</button>
          <div v-if="!props.historyLoading && transcriptMessages.length" class="ef-chat__transcript-inner">
            <section v-for="turn in historyTurns" :key="turn.id" class="ef-chat__turn" :data-chat-turn-id="turn.id">
            <template v-for="message in turn.messageCodes.map(id => messagesById.get(id)).filter((item): item is ChatMessage => !!item)" :key="message.messageId">
              <template v-if="showAgui">
                <AguiRunWorkRail v-for="run in workRailsForMessage(message, true)" :key="run.id"
                  :show-reasoning-cards="props.showReasoningCards"
                  :timeline="run" :events="run.events" :debug-events="run.includeRunMetadata === false ? [] : debugEventsForRun(run.runId)"
                  :labels="props.workRailLabels" :locale="props.locale" :history-labels="props.historyLabels" :user-input-requests="props.userInputRequests">
                  <template #message="{ message: processMessage }">
                    <StructuredMessageDetails :message="processMessage" :labels="props.historyLabels" :locale="props.locale" hide-run-error />
                    <ChatBubble v-if="processMessage.content.trim() || processMessage.a2ui" :annotation-labels="props.annotationLabels" :format-annotation-count="formatAnnotationCount" :annotations="annotationMap.get(processMessage.messageId)" :message="processMessage"
                      :current-user-display-name="currentUserDisplayName" :is-streaming="processMessage.messageId === streamingAssistantMessageCode"
                      :on-delete-turn="props.onDeleteTurn" :delete-turn-label="props.deleteTurnLabel" :on-a2-u-i-action="props.onA2UIAction" :a2ui-session="props.a2uiSession" :a2ui-disabled="props.a2uiDisabled"
                      @edit-message="(content: string, message: ChatMessage) => emit('edit-message', content, message)" />
                  </template>
                </AguiRunWorkRail>
              </template>
              <template v-if="!showAgui || !workTimeline.processMessageIds.has(message.messageId)">
              <HistoryWorkRail v-if="!workTimeline.managedMessageIds.has(message.messageId) && historyWork.has(message.messageId)" :messages="historyWork.get(message.messageId)!" :labels="props.workRailLabels" :locale="props.locale" :history-labels="props.historyLabels" :show-reasoning-cards="props.showReasoningCards" />
              <StructuredMessageDetails :message="message" :labels="props.historyLabels" :locale="props.locale" :hide-run-error="workTimeline.managedMessageIds.has(message.messageId)" />
              <ChatBubble
                v-if="(message.role === 'USER' || !message.history || message.a2ui || message.content.trim())"
                :current-user-display-name="currentUserDisplayName"
                :is-streaming="message.messageId === streamingAssistantMessageCode"
                :annotation-labels="props.annotationLabels" :format-annotation-count="formatAnnotationCount" :annotations="annotationMap.get(message.messageId)"
                :message="message"
                :on-delete-turn="props.onDeleteTurn" :delete-turn-label="props.deleteTurnLabel" :on-a2-u-i-action="props.onA2UIAction" :a2ui-session="props.a2uiSession" :a2ui-disabled="props.a2uiDisabled"
                @edit-message="
                  (content: string, message: ChatMessage) => emit('edit-message', content, message)
                "
              />
              <ChatAttachments
                v-if="message.role === 'USER' && message.provenance?.sender.kind.toUpperCase() !== 'SYSTEM'"
                :attachments="message.attachments"
                :attachment-labels="attachmentLabels"
                :download-attachment="attachmentDownloader"
                :format-annotation-count="formatAnnotationCount"
                @preview-image="openImagePreview"
              />
              </template>
              <WaitingRail
                v-if="
                  showAgui &&
                  message.messageId ===
                    presentation.waitingForModelAnchorMessageCode
                "
              />
              <template v-if="showAgui">
                <AguiRunWorkRail
                  :show-reasoning-cards="props.showReasoningCards"
                  v-for="run in workRailsForMessage(message)"
                  :key="run.id"
                  :debug-events="run.includeRunMetadata === false ? [] : debugEventsForRun(run.runId)"
                  :events="run.events"
                  :timeline="run"
                  :labels="props.workRailLabels"
                  :locale="props.locale"
                  :history-labels="props.historyLabels"
                  :message-id="message.messageId"
                  :user-input-requests="props.userInputRequests"
                >
                  <template #message="{ message: processMessage }">
                    <StructuredMessageDetails :message="processMessage" :labels="props.historyLabels" :locale="props.locale" hide-run-error />
                    <ChatBubble v-if="processMessage.content.trim() || processMessage.a2ui" :annotation-labels="props.annotationLabels" :format-annotation-count="formatAnnotationCount" :annotations="annotationMap.get(processMessage.messageId)" :message="processMessage"
                      :current-user-display-name="currentUserDisplayName" :is-streaming="processMessage.messageId === streamingAssistantMessageCode"
                      :on-delete-turn="props.onDeleteTurn" :delete-turn-label="props.deleteTurnLabel" :on-a2-u-i-action="props.onA2UIAction" :a2ui-session="props.a2uiSession" :a2ui-disabled="props.a2uiDisabled"
                      @edit-message="(content: string, message: ChatMessage) => emit('edit-message', content, message)" />
                  </template>
                </AguiRunWorkRail>
              </template>
            </template>
            </section>
          </div>
          <div v-else class="ef-chat__transcript-empty">
            <Bot :size="40" :strokeWidth="1" class="ef-chat__transcript__bot" />
            <div v-if="props.historyLoading" role="status" aria-live="polite" class="ef-chat__history-loading">
              {{ (props.historyLabels ?? defaultHistoryLabels).loading }}
            </div>
          </div>
        <ChatUserInputGroup
              :requests="props.userInputRequests"
          v-if="props.userInputRequest?.status === 'Pending' && props.onAnswerUserInput"
          :disabled="props.userInputAnswerPending || props.session?.status === 'ARCHIVED'"
          :submit-failed="props.userInputAnswerFailed"
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
        <div v-if="annotationDraft.annotations.length" class="ef-chat__pending-annotations" :aria-label="props.annotationLabels.pendingAnnotations">
          <div v-for="(annotation, index) in annotationDraft.annotations" :key="annotation.id">
            <button type="button" class="ef-chat__pending-annotation-edit ef-chat__annotation-reference" :disabled="props.disabledInput || session?.status === 'ARCHIVED'" @click="editPendingAnnotation(annotation, $event)" :data-annotation-tooltip="chatAnnotationTooltip(annotation, props.annotationLabels)">{{ props.annotationLabels.annotation(index + 1) }}: {{ annotation.comment }}</button>
            <button type="button" :aria-label="props.annotationLabels.removeAnnotation(index + 1)" @click="changeAnnotations(annotations.filter(item => item.id !== annotation.id))">×</button>
          </div>
        </div>
        <slot v-if="showComposer" name="composerTop"><component :is="props.composerTop" /></slot>
        <Composer
          v-if="showComposer"
          :composer-key="session?.sessionId"
          :auto-focus-composer="props.autoFocusComposer"
          :composer-header="props.composerHeader"
          :disabled-input="props.disabledInput"
          :draft="annotationDraft.content"
          :input-placeholder="props.inputPlaceholder"
          :input-suggestions="props.inputSuggestions"
          :skill-suggestion-triggers="props.skillSuggestionTriggers"
          :input-suggestion-labels="props.inputSuggestionLabels"
          :queued-input-placeholder="props.queuedInputPlaceholder"
          :steering-input-placeholder="props.steeringInputPlaceholder"
          :on-paste-attachment="props.onPasteAttachment"
          :onEditQueuedMessage="props.onEditQueuedMessage ? (id, content) => emit('edit-queued-message', id, props.queuedMessages.find(item => item.id === id)?.input.content ?? content) : undefined"
          :onRemoveQueuedMessage="props.onRemoveQueuedMessage ? (id) => emit('remove-queued-message', id) : undefined"
          :onSteerQueuedMessage="props.onSteerQueuedMessage ? (id) => emit('steer-queued-message', id) : undefined"
          :onReorderQueuedMessage="props.onReorderQueuedMessage ? (sourceId, targetId) => emit('reorder-queued-message', sourceId, targetId) : undefined"
          :queue-disabled="props.queueDisabled"
          :queued-label="props.queuedLabel"
          :queued-messages="props.queuedMessages.map(item => ({ ...item, input: { ...item.input, content: item.input.content || (item.input.annotations ?? []).map(annotation => annotation.comment).join('; ') } }))"
          :running-submit-modes="props.runningSubmitModes"
          :running-enter-submit-mode="props.runningEnterSubmitMode"
          :send-disabled="props.sendDisabled"
          :send-label="props.sendLabel"
          :sending="props.sending"
          :show-stop="props.showStop"
          :steer-disabled="props.steerDisabled"
          :queued-steer-disabled="props.queuedSteerDisabled"
          :stop-label="props.stopLabel"
          :pending-attachments="props.pendingAttachments"
          :attachment-downloader="props.attachmentDownloader"
          :show-attachment-control="props.showAttachmentControl"
          :attachment-upload-pending="props.attachmentUploadPending"
          :on-attach-file="props.onAttachFile"
          :onRemoveAttachment="props.onRemoveAttachment"
          :attach-label="props.attachLabel"
          :uploading-label="props.uploadingLabel"
          :remove-attachment-label="props.removeAttachmentLabel"
          :reorder-queued-label="props.reorderQueuedLabel ?? (props.locale?.toLowerCase().startsWith('zh') ? '拖动排序，也可使用上下方向键调整' : 'Drag to reorder; use Up/Down keys to move')"
          :edit-queued-label="props.editQueuedLabel"
          :remove-queued-label="props.removeQueuedLabel"
          @draft-change="changeAnnotatedDraft"
          @send="emit('send', $event)"
          @stop="props.onStop ? props.onStop() : emit('stop')"
        >
          <template v-if="$slots.composerHeader" #composerHeader><slot name="composerHeader" /></template>
          <template #footerAddon><slot name="footerAddon" /></template>
        </Composer>
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
        <ChatUserInputGroup
              :requests="props.userInputRequests"
          v-if="props.userInputRequest?.status === 'Pending' && props.onAnswerUserInput"
          :disabled="props.userInputAnswerPending || props.session?.status === 'ARCHIVED'"
          :submit-failed="props.userInputAnswerFailed"
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
