<script setup lang="ts">
import InteractionReceipt from "./InteractionReceipt.vue";
import { chatAnnotationTooltip, defaultChatAnnotationLabels, parseArtifacts, type ChatAnnotationLabels, type ChatAnnotation, type ChatArtifactAction, type ChatArtifactItem, type ChatArtifactLabels } from "@personai/agent-ui-chat-core";
import ChatA2UI from "./ChatA2UI.vue";
import ChatArtifacts from "./ChatArtifacts.vue";
import type { ChatA2uiActionHandler as ActionHandler, ChatA2uiSession } from "@personai/agent-ui-chat-core";
import { Bot, Pencil, Trash2, UserRound } from "lucide-vue-next";
import { computed } from "vue";
import { formatTime, messageActorName, messageSenderIsHuman, messageSenderAvatar } from "@personai/agent-ui-chat-core";
import type { ChatMessage } from "@personai/agent-ui-chat-core";
import { cx } from "../utils";
import MarkdownBlock from "./MarkdownBlock.vue";
import CopyValueButton from "./CopyValueButton.vue";

const props = withDefaults(defineProps<{
  currentUserDisplayName?: string;
  hideMessageIdentity?: boolean;
  emptyAssistantMessage?: string;
  isStreaming?: boolean;
  /** Render the copy/time row; work-rail steps opt out so they reserve no space. */
  showActions?: boolean;
  message: ChatMessage;
  annotations?: ChatAnnotation[];
  annotationLabels?: ChatAnnotationLabels;
  formatAnnotationCount?: (count: number) => string;
  onA2UIAction?: ActionHandler;
  a2uiSession?: ChatA2uiSession;
  a2uiDisabled?: boolean;
  artifactLabels?: Partial<ChatArtifactLabels>;
  artifactStates?: Record<string, "pending" | "failed">;
  onArtifactAction?: (message: ChatMessage, item: ChatArtifactItem, action: ChatArtifactAction) => void | Promise<void>;
  onArtifactPreview?: (message: ChatMessage, item: ChatArtifactItem) => void;
  locale?: string;
  onDeleteTurn?: (message: ChatMessage) => void;
  deleteTurnLabel?: string;
}>(), { showActions: true });

const emit = defineEmits<{
  editMessage: [content: string, message: ChatMessage];
}>();

const isSystemNotice = computed(() => props.message.provenance?.sender.kind.toUpperCase() === "SYSTEM");
const isUser = computed(() => props.message.role === "USER" && !isSystemNotice.value);
const actorName = computed(() =>
  messageActorName(props.message, props.currentUserDisplayName)
);
const artifacts = computed(() => parseArtifacts(props.message.artifacts));

function handleArtifactAction(item: ChatArtifactItem, action: ChatArtifactAction) {
  return props.onArtifactAction?.(props.message, item, action);
}

function handleArtifactPreview(item: ChatArtifactItem) {
  props.onArtifactPreview?.(props.message, item);
}
</script>

<template>
  <InteractionReceipt v-if="isUser && message.interactionResponse" :message="message" :actor-name="actorName" :hide-message-identity="hideMessageIdentity" />
  <div v-else :class="cx('ef-chat__message-entry', isUser && 'ef-chat__message-entry--user')">
  <article
    :class="cx('ef-chat__message', isUser && 'ef-chat__message--user', isSystemNotice && 'ef-chat__message--system')"
    :data-message-id="props.message.messageId"
    data-theme-anchor="chat-message" :data-theme-part="isSystemNotice ? 'chat-message-system' : isUser ? 'chat-message-user' : 'chat-message-assistant'"
    :data-streaming="isStreaming ? 'true' : undefined"
  >
    <div v-if="!hideMessageIdentity" class="ef-chat__message-header">
      <div class="ef-chat__message-actor">
        <img v-if="messageSenderAvatar(message)" :src="messageSenderAvatar(message)" alt="" width="16" height="16" />
        <UserRound v-else-if="messageSenderIsHuman(message)" :size="16" />
        <Bot v-else :size="16" />
        <span :data-interaction-response-sender="message.interactionResponse ? message.provenance?.sender.kind : undefined">{{ actorName }}</span>
      </div>
    </div>
    <div v-if="isUser && (message.annotations ?? []).length" class="ef-chat__text-annotations">
      <span class="ef-chat__annotation-reference ef-chat__inspection-count" tabindex="0" role="note" :data-annotation-tooltip="(message.annotations ?? []).map(item => chatAnnotationTooltip(item, annotationLabels)).join('\n\n')">{{ formatAnnotationCount?.((message.annotations ?? []).length) ?? `${(message.annotations ?? []).length} annotations` }}</span>
    </div>
    <div v-if="isUser" :data-chat-annotation-source="message.interactionResponse ? undefined : 'true'" class="ef-chat__message-body" :data-history-interaction-id="message.interactionResponse?.requestId">
      <dl v-if="message.interactionResponse" class="ef-chat__interaction-summary"><div v-for="(row, index) in message.interactionResponse.rows" :key="index"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div></dl>
      <template v-else>{{ props.message.content }}</template>
    </div>
    <MarkdownBlock
      v-else
      :content="props.message.content"
      :annotations="annotations"
      :annotation-labels="annotationLabels ?? defaultChatAnnotationLabels"
      data-chat-annotation-source="true"
      :streaming="isStreaming"
      :empty-message="message.a2ui || artifacts ? '' : props.emptyAssistantMessage"
    />
    <div v-if="!isUser && annotations?.length" class="ef-chat__reply-annotations">
      <template v-for="(annotation, index) in annotations" :key="annotation.id">
        <span v-if="!message.content.includes(`#chat-annotation-${annotation.id}`)" role="button" :data-annotation-source-id="annotation.messageId" tabindex="0" class="ef-chat__annotation-reference" :data-annotation-tooltip="chatAnnotationTooltip(annotation, annotationLabels)">{{ (annotationLabels ?? defaultChatAnnotationLabels).annotation(index + 1) }}</span>
      </template>
    </div>
    <ChatA2UI v-if="message.a2ui" :message="message" :on-action="onA2UIAction" :runtime="a2uiSession" :disabled="a2uiDisabled" />
    <ChatArtifacts
      v-if="artifacts"
      :artifacts="artifacts"
      :labels="artifactLabels"
      :locale="locale"
      :on-action="props.onArtifactAction ? handleArtifactAction : undefined"
      :on-preview="props.onArtifactPreview ? handleArtifactPreview : undefined"
      :states="artifactStates"
    />
  </article>
      <div v-if="props.showActions" class="ef-chat__message-actions ef-chat__message-actions--outside">
        <CopyValueButton
          ariaLabel="Copy raw markdown"
          title="Copy raw markdown"
          :value="props.message.content"
        />
        <button
          v-if="isUser && !message.interactionResponse"
          aria-label="Edit message"
          class="ef-chat__icon-button"
          type="button"
          @click="emit('editMessage', props.message.content, props.message)"
        >
          <Pencil :size="14" />
        </button>
        <button v-if="isUser && !message.interactionResponse && message.history?.run && onDeleteTurn" class="ef-chat__icon-button" type="button"
          :aria-label="deleteTurnLabel ?? 'Delete turn'" :title="deleteTurnLabel ?? 'Delete turn'" @click="onDeleteTurn(message)">
          <Trash2 :size="14" aria-hidden="true" />
        </button>
        <span v-if="!message.interactionResponse || message.interactionResponse.answeredAt != null" class="ef-chat__message-time">{{ formatTime(props.message.createdAt) }}</span>
      </div>
  </div>
</template>
