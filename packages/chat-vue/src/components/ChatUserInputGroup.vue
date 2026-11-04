<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { pendingApprovalRequests, type ChatUserInputAnswer, type ChatUserInputLabels, type ChatUserInputRequest } from "@eliteforge/agent-ui-chat-core";
import ChatUserInputCard from "./ChatUserInputCard.vue";
const props = defineProps<{ request: ChatUserInputRequest; requests: ChatUserInputRequest[]; labels?: ChatUserInputLabels; disabled?: boolean }>();
const emit = defineEmits<{ submit: [answers: ChatUserInputAnswer[]] }>();
const requests = computed(() => pendingApprovalRequests(props.request, props.requests));
const decisions = ref<Record<string, ChatUserInputAnswer[]>>({});
watch(() => JSON.stringify(requests.value.map(r => [r.sessionId, r.runId, r.requestId])), () => { decisions.value = {}; });
const count = computed(() => requests.value.filter(r => decisions.value[r.requestId]).length);
function submit() { if (!props.disabled) emit("submit", requests.value.flatMap(r => decisions.value[r.requestId])); }
function decide(request: ChatUserInputRequest, answers: ChatUserInputAnswer[]) {
  if (props.disabled) return;
  decisions.value = {...decisions.value, [request.requestId]:answers};
  if (requests.value.every(r => decisions.value[r.requestId])) submit();
}
function change(id: string) { const next = {...decisions.value}; delete next[id]; decisions.value = next; }
</script>
<template>
  <ChatUserInputCard v-if="requests.length === 1" :request="request" :disabled="disabled" :labels="labels" @submit="emit('submit', $event)" />
  <section v-else class="ef-chat__approval-batch" :aria-label="labels?.approvalBatch ?? 'Tool approvals'">
    <header class="ef-chat__approval-batch-header"><strong>{{ labels?.approvalBatch ?? 'Tool approvals' }}</strong><span aria-live="polite">{{ count }} / {{ requests.length }}</span><p>{{ labels?.approvalBatchHint ?? 'Decide on every call. Execution resumes only after all decisions are submitted.' }}</p></header>
    <div v-for="item in requests" :key="item.requestId" class="ef-chat__approval-batch-item">
      <ChatUserInputCard :disabled="disabled" :labels="labels" :request="decisions[item.requestId] ? {...item, answers:decisions[item.requestId], status:'Answered'} : item" @submit="decide(item, $event)" />
      <button v-if="decisions[item.requestId] && !disabled" type="button" class="ef-chat__approval-batch-change" @click="change(item.requestId)">{{ labels?.approvalWaiting ?? 'Waiting for batch' }} · {{ labels?.approvalChange ?? 'Change' }}</button>
    </div>
    <button v-if="count === requests.length && !disabled" type="button" class="ef-chat__approval-batch-retry" @click="submit">{{ labels?.approvalRetry ?? 'Submit decisions' }}</button>
  </section>
</template>
