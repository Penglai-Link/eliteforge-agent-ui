<script setup lang="ts">
import ChatA2UI from "./ChatA2UI.vue";
import type { ChatA2uiActionHandler as ActionHandler, ChatA2uiSession } from "@eliteforge/agent-ui-chat-core";
import { Bot, Pencil, UserRound } from "lucide-vue-next";
import { computed } from "vue";
import { formatTime, messageActorName, messageSenderIsHuman, messageSenderAvatar } from "@eliteforge/agent-ui-chat-core";
import type { ChatMessage } from "@eliteforge/agent-ui-chat-core";
import { cx } from "../utils";
import MarkdownBlock from "./MarkdownBlock.vue";
import CopyValueButton from "./CopyValueButton.vue";

const props = defineProps<{
  currentUserDisplayName?: string;
  emptyAssistantMessage?: string;
  isStreaming?: boolean;
  message: ChatMessage;
  onA2UIAction?: ActionHandler;
  a2uiSession?: ChatA2uiSession;
  a2uiDisabled?: boolean;
}>();

const emit = defineEmits<{
  editMessage: [content: string];
}>();

const isUser = computed(() => props.message.role === "USER");
const actorName = computed(() =>
  messageActorName(props.message, props.currentUserDisplayName)
);
</script>

<template>
  <article
    :class="cx('ef-chat__message', isUser && 'ef-chat__message--user')"
    data-theme-anchor="chat-message" :data-theme-part="isUser ? 'chat-message-user' : 'chat-message-assistant'"
    :data-streaming="isStreaming ? 'true' : undefined"
  >
    <div class="ef-chat__message-header">
      <div class="ef-chat__message-actor">
        <img v-if="messageSenderAvatar(message)" :src="messageSenderAvatar(message)" alt="" width="16" height="16" />
        <UserRound v-else-if="messageSenderIsHuman(message)" :size="16" />
        <Bot v-else :size="16" />
        <span :data-interaction-response-sender="message.interactionResponse ? message.provenance?.sender.kind : undefined">{{ actorName }}</span>
      </div>
      <div class="ef-chat__message-actions">
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
          @click="emit('editMessage', props.message.content)"
        >
          <Pencil :size="14" />
        </button>
        <span v-if="!message.interactionResponse || message.interactionResponse.answeredAt != null" class="ef-chat__message-time">{{ formatTime(props.message.createdAt) }}</span>
      </div>
    </div>
    <div v-if="isUser" class="ef-chat__message-body" :data-history-interaction-id="message.interactionResponse?.requestId">
      <dl v-if="message.interactionResponse" class="ef-chat__interaction-summary"><div v-for="(row, index) in message.interactionResponse.rows" :key="index"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div></dl>
      <template v-else>{{ props.message.content }}</template>
    </div>
    <MarkdownBlock
      v-else
      :content="props.message.content"
      :empty-message="message.a2ui ? '' : props.emptyAssistantMessage"
    />
    <ChatA2UI v-if="message.a2ui" :message="message" :on-action="onA2UIAction" :runtime="a2uiSession" :disabled="a2uiDisabled" />
  </article>
</template>
