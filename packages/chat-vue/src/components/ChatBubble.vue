<script setup lang="ts">
import { Bot, Pencil, UserRound } from "lucide-vue-next";
import { computed } from "vue";
import { formatTime } from "@eliteforge/agent-ui-chat-core";
import type { ChatMessage } from "@eliteforge/agent-ui-chat-core";
import { cx } from "../utils";
import MarkdownBlock from "./MarkdownBlock.vue";
import CopyValueButton from "./CopyValueButton.vue";

const props = defineProps<{
  currentUserDisplayName?: string;
  emptyAssistantMessage?: string;
  isStreaming?: boolean;
  message: ChatMessage;
}>();

const emit = defineEmits<{
  editMessage: [content: string];
}>();

const isUser = computed(() => props.message.role === "USER");
const actorName = computed(() =>
  isUser.value ? (props.currentUserDisplayName || props.message.actor) : props.message.actor
);
</script>

<template>
  <article
    :class="cx('ef-chat__message', isUser && 'ef-chat__message--user')"
    :data-theme-part="isUser ? 'chat-message-user' : 'chat-message-assistant'"
    :data-streaming="isStreaming ? 'true' : undefined"
  >
    <div class="ef-chat__message-header">
      <div class="ef-chat__message-actor">
        <UserRound v-if="isUser" :size="16" />
        <Bot v-else :size="16" />
        <span>{{ actorName }}</span>
      </div>
      <div class="ef-chat__message-actions">
        <CopyValueButton
          ariaLabel="Copy raw markdown"
          title="Copy raw markdown"
          :value="props.message.content"
        />
        <button
          v-if="isUser"
          aria-label="Edit message"
          class="ef-chat__icon-button"
          type="button"
          @click="emit('editMessage', props.message.content)"
        >
          <Pencil :size="14" />
        </button>
        <span class="ef-chat__message-time">{{ formatTime(props.message.createdAt) }}</span>
      </div>
    </div>
    <div v-if="isUser" class="ef-chat__message-body">
      {{ props.message.content }}
    </div>
    <MarkdownBlock
      v-else
      :content="props.message.content"
      :empty-message="props.emptyAssistantMessage"
    />
  </article>
</template>
