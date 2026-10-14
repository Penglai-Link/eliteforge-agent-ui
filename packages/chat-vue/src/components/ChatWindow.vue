<script setup lang="ts">
import { Bot, Grip, Minus, X, Plus } from "lucide-vue-next";
import {
  clampFloatingStateToViewport,
  defaultFloatingState,
  floatingStatesEqual,
  readFloatingState,
  reduceFloatingState,
  resolveFloatingViewportBounds,
  writeFloatingState,
  type ChatFloatingState,
  type ChatMessage,
  type ChatSubmitMode,
} from "@eliteforge/agent-ui-chat-core";
import { computed, onBeforeUnmount, ref, useSlots, watch } from "vue";
import { cx } from "../utils";
import ChatPanel from "./ChatPanel.vue";
import { ChatWindowProps } from "../types";

const props = withDefaults(defineProps<ChatWindowProps>(), {
  createSessionLabel: "Create session",
  currentUserDisplayName: "",
  debugOptions: undefined,
  disabledInput: false,
  emptyDescription: "Create a session to start chatting.",
  emptyTitle: "No session selected",
  inputPlaceholder: "Enter to send, Shift+Enter for newline",
  liveAguiAnchorMessageCodes: () => ({}),
  liveAguiEvents: () => [],
  liveAguiPending: false,
  onEditQueuedMessage: undefined,
  onRemoveQueuedMessage: undefined,
  onStateChange: undefined,
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
  showStop: true,
  showNewSession: true,
  state: undefined,
  steerDisabled: false,
  stopLabel: "Stop",
  storageKey: "eliteforge.agent-ui.chat.window",
  title: "Chat",
  titleSubtitle: "AI assistant",
});

const emit = defineEmits<{
  "create-session": [];
  "new-session": [];
  "draft-change": [value: string];
  "edit-message": [value: string, message?: ChatMessage];
  "edit-queued-message": [id: string, content: string];
  "remove-queued-message": [id: string];
  send: [mode?: ChatSubmitMode];
  stop: [];
  "state-change": [state: ChatFloatingState];
}>();

const forwardedSlotNames: string[] = Object.keys(useSlots());

const localState = ref(
  readFloatingState(props.storageKey, defaultFloatingState),
);
const transientState = ref<ChatFloatingState | null>(null);
const viewportRevision = ref(0);
const normalizedStateRef = ref<string | null>(null);
const dragRef = ref<{
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
} | null>(null);
const resizeRef = ref<{
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
  height: number;
} | null>(null);

const isControlled = computed(() =>
  Boolean(props.state && props.onStateChange),
);
const activeState = computed(() =>
  transientState.value ?? (isControlled.value ? (props.state as ChatFloatingState) : localState.value),
);

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest("button, a, input, textarea, select, [role='button']"),
    )
  );
}

function buildViewportState(next: ChatFloatingState) {
  if (typeof window === "undefined") return next;
  return clampFloatingStateToViewport(next, {
    ...resolveFloatingViewportBounds(window.innerWidth),
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
  });
}

function applyState(next: ChatFloatingState, normalize = true) {
  const resolvedState = normalize ? buildViewportState(next) : next;
  if (isControlled.value) {
    props.onStateChange?.(resolvedState);
    emit("state-change", resolvedState);
    return;
  }
  localState.value = resolvedState;
  emit("state-change", resolvedState);
}

const visibleState = computed(() => {
  void viewportRevision.value;
  return buildViewportState(activeState.value);
});

watch(
  [activeState, visibleState, viewportRevision, transientState],
  () => {
    if (typeof window === "undefined" || !visibleState.value.open || transientState.value !== null) {
      normalizedStateRef.value = null;
      return;
    }

    const normalizationKey = [
      window.innerWidth,
      window.innerHeight,
      activeState.value.collapsed,
      activeState.value.height,
      activeState.value.open,
      activeState.value.width,
      activeState.value.x,
      activeState.value.y,
      visibleState.value.collapsed,
      visibleState.value.height,
      visibleState.value.open,
      visibleState.value.width,
      visibleState.value.x,
      visibleState.value.y,
    ].join(":");

    if (floatingStatesEqual(activeState.value, visibleState.value)) {
      normalizedStateRef.value = null;
      return;
    }

    if (normalizedStateRef.value === normalizationKey) return;
    normalizedStateRef.value = normalizationKey;
    applyState(visibleState.value, false);
  },
  { immediate: true },
);

watch(
  () => props.storageKey,
  (nextStorageKey) => {
    if (!isControlled.value)
      localState.value = readFloatingState(
        nextStorageKey,
        defaultFloatingState,
      );
  },
);

function handleViewportResize() {
  viewportRevision.value += 1;
}

watch(
  () => visibleState.value.open,
  (open) => {
    if (typeof window === "undefined") return;
    if (open) window.addEventListener("resize", handleViewportResize);
    else window.removeEventListener("resize", handleViewportResize);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (typeof window === "undefined") return;
  window.removeEventListener("resize", handleViewportResize);
});

watch(
  localState,
  (nextState) => {
    if (!isControlled.value) writeFloatingState(props.storageKey, nextState);
  },
  { deep: true },
);

const panelStyle = computed(() => ({
  height: visibleState.value.collapsed
    ? 72 + "px"
    : visibleState.value.height + "px",
  transform: `translate(${-visibleState.value.x}px, ${-visibleState.value.y}px)`,
  width: visibleState.value.width + "px",
}));

function startDrag(event: PointerEvent) {
  if (visibleState.value.collapsed || isInteractiveTarget(event.target)) return;
  dragRef.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    x: visibleState.value.x,
    y: visibleState.value.y,
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  transientState.value = visibleState.value;
}

function handleDrag(event: PointerEvent) {
  if (!dragRef.value || dragRef.value.pointerId !== event.pointerId) return;
  const next = reduceFloatingState(visibleState.value, {
    type: "move",
    x: dragRef.value.x - (event.clientX - dragRef.value.startX),
    y: dragRef.value.y - (event.clientY - dragRef.value.startY),
  });
  transientState.value = next;
}

function endDrag(event: PointerEvent) {
  if (!dragRef.value || dragRef.value.pointerId !== event.pointerId) return;
  dragRef.value = null;
  (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  if (transientState.value) {
    applyState(transientState.value);
    transientState.value = null;
  }
}

function startResize(event: PointerEvent) {
  resizeRef.value = {
    height: visibleState.value.height,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    width: visibleState.value.width,
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  transientState.value = visibleState.value;
}

function handleResize(event: PointerEvent) {
  if (!resizeRef.value || resizeRef.value.pointerId !== event.pointerId) return;
  const next = reduceFloatingState(visibleState.value, {
    type: "resize",
    height: resizeRef.value.height - (event.clientY - resizeRef.value.startY),
    width: resizeRef.value.width - (event.clientX - resizeRef.value.startX),
  });
  transientState.value = next;
}

function endResize(event: PointerEvent) {
  if (!resizeRef.value || resizeRef.value.pointerId !== event.pointerId) return;
  resizeRef.value = null;
  (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  if (transientState.value) {
    applyState(transientState.value);
    transientState.value = null;
  }
}
</script>

<template>
  <div v-if="!visibleState.open" class="ef-chat-window">
    <button
      class="ef-chat__button ef-chat-window__fab"
      type="button"
      @click="
        applyState(
          reduceFloatingState(visibleState, {
            type: 'toggle-open',
            open: true,
          }),
        )
      "
    >
      <Bot :size="16" />
      <span>{{ title }}</span>
    </button>
  </div>
  <div v-else class="ef-chat-window">
    <div
      :class="
        cx(
          'ef-chat-window__panel',
          visibleState.collapsed && 'ef-chat-window__panel--collapsed',
        )
      "
      :style="panelStyle"
    >
      <div
        class="ef-chat-window__header"
        @pointerdown="startDrag"
        @pointermove="handleDrag"
        @pointerup="endDrag"
        @pointercancel="endDrag"
      >
        <div class="ef-chat-window__title">
          <Bot :size="18" />
          <div class="ef-chat-window__title-text">
            <span class="ef-chat-window__title-main">{{ title }}</span>
          </div>
        </div>
        <div class="ef-chat-window__actions">
          <button
            v-if="showNewSession"
            aria-label="New chat"
            title="New chat"
            class="ef-chat-window__control"
            type="button"
            @click="emit('new-session')"
          >
            <Plus :size="16" />
          </button>
          <button
            aria-label="Close chat"
            class="ef-chat-window__control"
            type="button"
            @click="
              applyState(
                reduceFloatingState(visibleState, {
                  type: 'toggle-open',
                  open: false,
                }),
              )
            "
          >
            <X :size="16" />
          </button>
        </div>
      </div>

      <div v-if="!visibleState.collapsed" class="ef-chat-window__body">
        <ChatPanel
          :on-a2-u-i-action="props.onA2UIAction" :a2ui-session="props.a2uiSession" :a2ui-disabled="props.a2uiDisabled"
          :attachment-downloader="attachmentDownloader"
          :attachment-labels="attachmentLabels"
          :auto-focus-composer="autoFocusComposer"
          :composer-header="composerHeader"
          :create-session-label="createSessionLabel"
          :current-user-display-name="currentUserDisplayName"
          :debug-options="debugOptions"
          :disabled-input="disabledInput"
          :draft="draft"
          :empty-description="emptyDescription"
          :empty-title="emptyTitle"
          :format-annotation-count="formatAnnotationCount"
          :annotation-labels="annotationLabels"
          :pending-annotations="pendingAnnotations"
          :on-pending-annotations-change="onPendingAnnotationsChange"
          :input-placeholder="inputPlaceholder"
          :input-suggestions="props.inputSuggestions"
          :skill-suggestion-triggers="props.skillSuggestionTriggers"
          :input-suggestion-labels="props.inputSuggestionLabels"
          :queued-input-placeholder="props.queuedInputPlaceholder"
          :steering-input-placeholder="props.steeringInputPlaceholder"
          :pending-attachments="props.pendingAttachments"
          :show-attachment-control="props.showAttachmentControl"
          :attachment-upload-pending="props.attachmentUploadPending"
          :on-attach-file="props.onAttachFile"
          :onRemoveAttachment="props.onRemoveAttachment"
          :attach-label="props.attachLabel"
          :uploading-label="props.uploadingLabel"
          :remove-attachment-label="props.removeAttachmentLabel"
          :edit-queued-label="props.editQueuedLabel"
          :remove-queued-label="props.removeQueuedLabel"
          :live-agui-anchor-message-codes="liveAguiAnchorMessageCodes"
          :live-agui-events="liveAguiEvents"
          :live-agui-pending-anchor-message-code="liveAguiPendingAnchorMessageCode"
          :live-agui-pending="liveAguiPending"
          :messages="messages"
          :on-answer-user-input="onAnswerUserInput"
          :on-paste-attachment="onPasteAttachment"
          :protocol-events="protocolEvents"
          :queue-disabled="queueDisabled"
          :queued-label="queuedLabel"
          :queued-messages="queuedMessages"
          :running-submit-modes="runningSubmitModes"
          :send-disabled="sendDisabled"
          :send-label="sendLabel"
          :sending="sending"
          :session="session"
          :show-agui="showAgui"
          :show-header="false"
          :show-stop="showStop"
          :steer-disabled="steerDisabled"
          :stop-label="stopLabel"
          :title="title"
          :user-input-labels="userInputLabels"
          :user-input-requests="userInputRequests"
          :user-input-request="userInputRequest"
          :user-input-answer-pending="userInputAnswerPending"
          :work-rail-labels="workRailLabels"
          @create-session="emit('create-session')"
          @new-session="emit('new-session')"
          @draft-change="(v: string) => emit('draft-change', v)"
          @edit-message="(v: string, message?: ChatMessage) => emit('edit-message', v, message)"
          :onEditQueuedMessage="props.onEditQueuedMessage ? (id: string, content: string) => emit('edit-queued-message', id, content) : undefined"
          :onRemoveQueuedMessage="props.onRemoveQueuedMessage ? (id: string) => emit('remove-queued-message', id) : undefined"
          @send="(mode?: ChatSubmitMode) => emit('send', mode)"
          @stop="emit('stop')"
        >
          <template v-for="name in forwardedSlotNames" #[name]="slotProps">
            <slot :name="name" v-bind="slotProps || {}" />
          </template>
        </ChatPanel>
      </div>

      <button
        v-if="!visibleState.collapsed"
        aria-label="Resize chat window"
        class="ef-chat-window__control ef-chat-window__resize"
        type="button"
        @pointerdown="startResize"
        @pointermove="handleResize"
        @pointerup="endResize"
        @pointercancel="endResize"
      ></button>
    </div>
  </div>
</template>
