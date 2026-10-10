<script setup lang="ts">
import { shallowRef, watch } from "vue";
import { A2UIClient, type ActionMessage } from "@eliteforge/agent-ui-a2ui-core";
import { A2UISurface } from "@eliteforge/agent-ui-a2ui-vue";
import { interactionEnvelopes, type ChatUserInputAnswer, type ChatUserInputLabels, type ChatUserInputRequest } from "@eliteforge/agent-ui-chat-core";
const props = defineProps<{ request: ChatUserInputRequest; disabled?: boolean; labels?: ChatUserInputLabels }>();
const emit = defineEmits<{ submit: [answers: ChatUserInputAnswer[]] }>();
const client = shallowRef(new A2UIClient());
watch(() => JSON.stringify([props.request.requestId, props.request.a2uiInteraction ?? null, props.labels ?? null]), () => { const c = new A2UIClient(); for (const envelope of props.request.a2uiInteraction?.messages ?? interactionEnvelopes(props.request, props.labels)) c.apply(envelope); client.value = c; }, { immediate: true });
watch(() => [props.disabled, props.request.status], () => {if(props.request.a2uiInteraction) return; client.value.apply({ version: "v0.9.1", updateDataModel: { surfaceId: `interaction:${props.request.requestId}`, path: "/status", value: props.disabled ? "Submitting" : props.request.status } }); }, { immediate: true });
function submit(message: ActionMessage) {
  if(props.request.a2uiInteraction) {emit("submit", [{questionId:props.request.requestId,answerKind:"Other",optionId:null,otherText:JSON.stringify(message.action.context.response)}]);return;}
  const value = message.action.context.answer;
  if (typeof value === "boolean") { const option = Object.entries(props.request.nativeInteraction?.optionPayloads ?? {}).find(([, payload]) => payload === value); if (option) emit("submit", [{ questionId: props.request.requestId, answerKind: "Option", optionId: option[0], otherText: null }]); }
  else emit("submit", Object.values(value ?? {}));
}
</script>
<template><fieldset class="ef-chat__a2ui" :disabled="disabled || request.status !== 'Pending' || Boolean(request.expiresAtMs && request.expiresAtMs <= Date.now())" style="border:0;margin:0;padding:0;min-width:0"><A2UISurface :client="client" :surface-id="request.a2uiInteraction?.surfaceId ?? `interaction:${request.requestId}`" :on-action="submit" /></fieldset></template>
