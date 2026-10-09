<script setup lang="ts">
import "@eliteforge/agent-ui-a2ui-vue/styles.css";
import { computed } from "vue";
import { A2UIClient, type ActionMessage, type ActionMetadata } from "@eliteforge/agent-ui-a2ui-core";
import { A2UISurface } from "@eliteforge/agent-ui-a2ui-vue";
import type { ChatMessage, ChatA2uiSession, ChatA2uiActionHandler } from "@eliteforge/agent-ui-chat-core";
const props = defineProps<{ message: ChatMessage; runtime?: ChatA2uiSession; disabled?: boolean; onAction?: ChatA2uiActionHandler }>();
const result = computed(() => {
  const client = (props.message.a2ui?.messages.length === 0 ? props.runtime?.client : undefined) ?? new A2UIClient();
  try { for (const envelope of props.message.a2ui?.messages ?? []) client.apply(envelope); return { client, error: false }; }
  catch { return { client, error: true }; }
});
const surfaceIds = computed(() => props.message.a2ui?.surfaceIds ?? Object.keys(result.value.client.getSnapshot().surfaces));
function action(id: string, message: ActionMessage, metadata: ActionMetadata) {
  const surface = props.runtime?.getSurface(id);
  props.onAction?.(message, surface ? props.runtime!.metadata(surface.ownerAgentId) : metadata, surface ? {sessionId: props.message.sessionId, messageId: props.message.messageId, surface} : undefined);
}
</script>
<template>
  <div v-if="result.error" role="alert">Invalid A2UI message</div>
  <div v-else class="ef-chat__a2ui"><fieldset v-for="id in surfaceIds" :key="id" :disabled="disabled || message.channel === 'history' || runtime?.getSurface(id)?.mode === 'Display'" style="border:0;padding:0;margin:0;min-width:0"><A2UISurface :client="result.client" :surface-id="id" :on-action="(m, meta) => action(id, m, meta)" /></fieldset></div>
</template>
