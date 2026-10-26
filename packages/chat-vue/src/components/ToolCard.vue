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
  formatJsonBlockValue,
  hasPendingBatchItems,
  interactionToolSummary,
  toolCompactLabel,
  toolDisplayName,
  detectToolPresentationLocale,
  type ChatWorkRailLabels,
  type ToolWorkCard,
} from "@eliteforge/agent-ui-chat-core";
import { computed, nextTick, ref, watch } from "vue";
import { cx } from "../utils";
import ToolResultView from "./ToolResultView.vue";
import JsonBlock from "./JsonBlock.vue";
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
const parametersExpanded = ref(false);
const logRef = ref<HTMLDivElement | null>(null);

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
const hasParameters = computed(() => hasToolParameterPayload(props.card.args));
const parametersText = computed(() =>
  hasParameters.value ? formatJsonBlockValue(props.card.args) : "",
);
const resultText = computed(() =>
  props.card.result ? formatJsonBlockValue(props.card.result) : "",
);
const subagentDispatch = computed(() => props.card.toolName.toLowerCase() === "agent_spawn");
const presentationLocale = computed(() => detectToolPresentationLocale(props.locale, [
  props.labels?.ariaLabel,
  props.labels?.thinking,
  props.labels?.preparing,
  props.labels?.responding,
]));
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

watch([expanded, complete], async () => {
  if (!expanded.value || complete.value || !props.card.logs.length) return;
  await nextTick();
  const element = logRef.value;
  if (!element) return;
  element.scrollTop = element.scrollHeight;
});

function hasToolParameterPayload(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return true;
  return true;
}

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
              {{ props.nested || props.compact ? nestedToolLabel : toolLabel }}
            </span>
            <span
              v-if="!props.nested && !subagentDispatch"
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
        <template v-else>
        <section v-if="hasParameters">
          <div
            class="ef-chat__tool-section-header"
            :style="{ marginBottom: parametersExpanded ? '8px' : '0' }"
          >
            <button
              :aria-expanded="parametersExpanded"
              class="ef-chat__tool-subtoggle"
              type="button"
              @click="parametersExpanded = !parametersExpanded"
            >
              <span class="ef-chat__tool-subtoggle-label">
                <ChevronDown v-if="parametersExpanded" :size="13" />
                <ChevronRight v-else :size="13" />
                <span>{{ props.labels?.tool?.parameters ?? "Parameters" }}</span>
              </span>
            </button>
            <CopyValueButton
              :ariaLabel="props.labels?.tool?.copyParameters ?? 'Copy parameters'"
              :title="props.labels?.tool?.copyParameters ?? 'Copy parameters'"
              :value="parametersText"
            />
          </div>
          <JsonBlock v-if="parametersExpanded" :value="props.card.args" />
        </section>

        <section v-if="complete || partial">
          <div
            class="ef-chat__tool-section-header"
            style="margin-bottom: 8px"
          >
            <h3 class="ef-chat__tool-section-title">{{ props.labels?.tool?.result ?? "Result" }}</h3>
            <CopyValueButton
              :ariaLabel="props.labels?.tool?.copyResult ?? 'Copy result'"
              :title="props.labels?.tool?.copyResult ?? 'Copy result'"
              :value="resultText"
            />
          </div>
          <ToolResultView v-if="props.card.result" :value="props.card.result" :locale="props.locale" />
          <div v-else class="ef-chat__result-block">No result payload.</div>
        </section>

        <section v-else>
          <h3 class="ef-chat__tool-section-title" style="margin-bottom: 8px">
            {{ props.labels?.tool?.log ?? "Log" }}
          </h3>
          <div
            ref="logRef"
            class="ef-chat__code-block"
            style="max-height: 256px; overflow-y: auto"
          >
            <template v-if="props.card.logs.length">
              <p
                v-for="(line, index) in props.card.logs"
                :key="`${props.card.id}-log-${index}`"
                style="margin: 0; white-space: pre-wrap"
              >
                {{ line }}
              </p>
            </template>
            <p v-else style="margin: 0">Waiting for tool activity...</p>
          </div>
        </section>
        </template>
      </div>
    </div>
  </div>
</template>
