<script setup lang="ts">
import { computed } from "vue";
import { buildAguiRunNotices, chatErrorPresentation, type ChatMessage, type ChatWorkRailLabels, type TranscriptAguiEvent } from "@eliteforge/agent-ui-chat-core";
const props = defineProps<{ events: TranscriptAguiEvent[]; messages?: ChatMessage[]; labels: ChatWorkRailLabels }>();
const notices = computed(() => {
  const notices = buildAguiRunNotices(props.events);
  const error = props.messages?.find(message => message.history?.run?.error)?.history?.run?.error;
  if (error && !notices.some(notice => notice.kind === "runError" && notice.code !== "AGENT_AGUI_REPLAY_INCOMPLETE"))
    notices.push({ kind: "runError", code: "HISTORY_RUN_ERROR", message: error });
  const copy = props.labels.notices;
  return notices.map(notice => {
    let title = "", detail = "", failed = false;
    if (notice.kind === "compaction") {
      title = ({ requested: copy?.compactionRequested ?? "Compacting context…", started: copy?.compactionStarted ?? "Compacting context…",
        completed: copy?.compactionCompleted ?? "Context compacted", failed: copy?.compactionFailed ?? "Context compaction failed",
        interrupted: copy?.compactionInterrupted ?? "Context compaction interrupted" })[notice.status];
      detail = notice.code; failed = notice.status === "failed";
    } else if (notice.kind === "integrationWarning") {
      title = copy?.mcpUnavailable ?? "MCP service unavailable"; detail = notice.message;
    } else if (notice.kind === "runStopped") {
      title = props.labels.stopped ?? "Run stopped"; detail = notice.message;
    } else {
      failed = true; title = props.labels.failed ?? "Run failed"; detail = notice.message || notice.code;
      if (notice.code === "AGENT_AGUI_REPLAY_INCOMPLETE") {
        title = copy?.presentationIncomplete ?? "Presentation replay incomplete";
        detail = copy?.presentationIncompleteDetail ?? "Execution results are reported separately.";
      }
      if (notice.code.toLowerCase() === "tool_schema_over_budget") {
        title = copy?.toolSchemaOverBudget ?? "Tool definitions exceed the context budget";
        const budget = notice.toolSchemaBudget;
        detail = budget && copy?.toolSchemaBudget ? copy.toolSchemaBudget(budget.estimatedTokens, budget.limitTokens, budget.toolCount) : "";
      }
    }
    return { title, failed, error: detail ? chatErrorPresentation(detail, props.labels.failed ?? "Run failed") : { summary: "", details: "" } };
  });
});
</script>
<template>
  <div v-for="(notice, index) in notices" :key="index" class="ef-chat__run-notice" :class="{ 'ef-chat__run-notice--error': notice.failed }" :role="notice.failed ? 'alert' : 'status'">
    <div class="ef-chat__run-notice-content">
      <div class="ef-chat__run-notice-title">{{ notice.title }}</div>
      <template v-if="notice.error.summary">
        <div class="ef-chat__run-notice-detail">{{ notice.error.summary }}</div>
        <details v-if="notice.error.details" class="ef-chat__error-details"><summary>{{ /[\u3400-\u9fff]/.test(labels.thinking) ? '错误详情' : 'Error details' }}</summary><pre>{{ notice.error.details }}</pre></details>
      </template>
    </div>
  </div>
</template>
