<script setup lang="ts">
import {
  CheckCircle2,
  CircleX,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Terminal,
} from "lucide-vue-next";
import {
  toolOperationDetails,
  toolCommandCountLabel,
  hasPendingBatchItems,
  interactionToolSummary,
  toolCompactLabel,
  toolDisplayName,
  detectToolPresentationLocale,
  type ChatWorkRailLabels,
  type ToolWorkCard,
} from "@eliteforge/agent-ui-chat-core";
import { computed, ref, watch } from "vue";
import { cx } from "../utils";
import CopyValueButton from "./CopyValueButton.vue";

const props = defineProps<{
  card: ToolWorkCard;
  labels?: ChatWorkRailLabels;
  statusLabel?: string;
  statusFailed?: boolean;
  nested?: boolean;
  compact?: boolean;
  /** Host language ('zh-CN' | 'en-US' | anything); falls back to label heuristics. */
  locale?: string;
}>();

const expanded = ref(false);

const interactionInfo = computed(() => interactionToolSummary(props.card.toolName, props.card.args));
const partial = computed(() => hasPendingBatchItems(props.card.result));
const complete = computed(() => props.card.ended || (!partial.value && Boolean(props.card.result)));
const failed = computed(() => {
  if (partial.value) return false;
  if (props.statusFailed) return true;
  if (!props.card.result) return false;
  try {
    const parsed = JSON.parse(props.card.result) as { isError?: unknown } | null;
    return parsed?.isError === true;
  } catch {
    return false;
  }
});
const running = computed(() => props.card.started && !complete.value);
const subagentDispatch = computed(() => props.card.toolName.toLowerCase() === "agent_spawn");
const presentationLocale = computed(() => detectToolPresentationLocale(props.locale, [
  props.labels?.ariaLabel,
  props.labels?.thinking,
  props.labels?.preparing,
  props.labels?.responding,
]));
const operations = computed(() => toolOperationDetails(props.card.toolName, props.card.args, presentationLocale.value));
const commandCountLabel = computed(() => toolCommandCountLabel(props.card.toolName, props.card.args, presentationLocale.value));
// A host-provided name still wins unless it only echoes the raw tool id; the
// presenter parses and appends the subject.
const hostToolName = computed(() => props.labels?.tool?.resolveName?.(props.card.toolName, props.card.args));
const toolName = computed(() => hostToolName.value
  ? toolCompactLabel(props.card.toolName, props.card.args, hostToolName.value, presentationLocale.value)
  : toolDisplayName(props.card.toolName, props.card.args, undefined, presentationLocale.value));
const toolLabel = computed(() => {
  if (props.card.subagentName !== undefined || subagentDispatch.value && props.card.toolCallId.startsWith("subagent:")) {
    const name = props.card.subagentName ?? "";
    return subagentDispatchedLabel(name);
  }
  return toolName.value;
});
const nestedToolLabel = computed(
  () => props.card.subagentName !== undefined
    ? toolLabel.value
    : toolCompactLabel(props.card.toolName, props.card.args, toolName.value, presentationLocale.value),
);

watch(
  [running, complete],
  () => {
    if (complete.value) expanded.value = false;
  },
  { immediate: true },
);

function subagentDispatchedLabel(name: string) {
  if (props.labels?.tool?.subagentDispatched) return props.labels.tool.subagentDispatched(name);
  const labels = props.labels;
  const chinese = labels && /[\u3400-\u9fff]/.test([labels.ariaLabel, labels.thinking, labels.preparing, labels.responding].join(" "));
  return chinese ? (name ? `已派发 ${name} 子代理` : "已派发子代理") : (name ? `Dispatched ${name} subagent` : "Subagent dispatched");
}
</script>

<template>
  <div
    :class="
      cx(
        'ef-chat__tool-row',
        !props.nested && 'ef-chat__tool-row--standalone',
      )
    "
  >
    <button
      :aria-expanded="expanded"
      :class="
        cx(
          'ef-chat__tool-toggle',
          props.nested && 'ef-chat__tool-toggle--nested',
        )
      "
      type="button"
      @click="expanded = !expanded"
    >
      <span class="ef-chat__tool-toggle-main">
        <span
          :class="
            cx(
              'ef-chat__tool-badge',
              props.nested
                ? cx(
                    'ef-chat__tool-badge--nested',
                    failed && 'ef-chat__tool-badge--failed',
                    complete && !failed && 'ef-chat__tool-badge--done',
                  )
                : 'ef-chat__tool-badge--standalone',
            )
          "
        >
          <template v-if="failed">
            <CircleX :size="14" />
          </template>
          <CheckCircle2 v-else-if="complete" :size="14" />
          <LoaderCircle v-else-if="running" class="animate-spin" :size="14" />
          <span v-else-if="props.nested" class="ef-chat__tool-timeline-dot" aria-hidden="true" />
          <Terminal v-else :size="14" />
        </span>
        <span class="ef-chat__tool-toggle-text">
          <span class="ef-chat__tool-title-row">
            <span
              :class="
                cx(
                  'ef-chat__tool-title',
                  props.nested && 'ef-chat__tool-title--nested',
                )
              "
            >
              {{ commandCountLabel ?? (props.nested || props.compact ? nestedToolLabel : toolLabel) }}
            </span>
            <span
              v-if="complete && !props.nested && !subagentDispatch"
              :class="
                cx(
                  'ef-chat__tool-status',
                  complete
                    ? 'ef-chat__tool-status--done'
                    : 'ef-chat__tool-status--running',
                )
              "
            >
              {{ props.statusLabel ?? (complete ? "done" : "running") }}
            </span>
          </span>
        </span>
      </span>
      <span class="ef-chat__tool-chevron">
        <ChevronDown v-if="expanded" :size="14" />
        <ChevronRight v-else :size="14" />
      </span>
    </button>

    <div
      v-if="expanded"
      :class="
        cx(
          'ef-chat__tool-body',
          props.nested
            ? 'ef-chat__tool-body--nested'
            : 'ef-chat__tool-body--standalone',
        )
      "
    >
      <div class="ef-chat__tool-sections">
        <p v-if="interactionInfo !== null">{{ interactionInfo.join(" · ") || toolLabel }}</p>
        <div v-else class="ef-chat__tool-operations">
          <section v-for="(operation, index) in operations" :key="index" class="ef-chat__tool-operation" :data-tool-operation-index="index">
            <p v-if="operations.length > 1" class="ef-chat__tool-operation-title">{{ index + 1 }}. {{ toolName }}</p>
            <dl v-if="operation.fields.length" class="ef-chat__tool-operation-fields">
              <div v-for="(field, fieldIndex) in operation.fields" :key="fieldIndex">
                <dt>{{ field.label }}</dt>
                <dd>
                  <div v-if="field.code" class="ef-chat__tool-operation-code">
                    <pre>{{ field.value }}</pre>
                    <CopyValueButton :ariaLabel="field.copyLabel" :title="field.copyLabel" :value="field.value" />
                  </div>
                  <p v-else>{{ field.value }}</p>
                </dd>
              </div>
            </dl>
            <p v-else-if="operations.length === 1" class="ef-chat__tool-operation-summary">{{ toolLabel }}</p>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
