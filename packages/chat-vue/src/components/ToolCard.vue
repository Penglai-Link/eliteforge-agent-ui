<script setup lang="ts">
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Terminal,
} from "lucide-vue-next";
import {
  formatJsonBlockValue,
  interactionToolSummary,
  toolSummaryLabel,
  toolCompactLabel,
  toolDisplayName,
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
  nested?: boolean;
  compact?: boolean;
  stepNumber?: number;
}>();

const expanded = ref(false);
const parametersExpanded = ref(false);
const logRef = ref<HTMLDivElement | null>(null);

const interactionInfo = computed(() => interactionToolSummary(props.card.toolName, props.card.args));
const complete = computed(() => props.card.ended || Boolean(props.card.result));
const running = computed(() => props.card.started && !complete.value);
const hasParameters = computed(() => hasToolParameterPayload(props.card.args));
const parametersText = computed(() =>
  hasParameters.value ? formatJsonBlockValue(props.card.args) : "",
);
const resultText = computed(() =>
  props.card.result ? formatJsonBlockValue(props.card.result) : "",
);
const domainExpansion = computed(() => props.card.toolName === "discovery_expand_tool_domain");
const toolLabel = computed(() => {
  if (domainExpansion.value) {
    const name = resolvedName.value;
    return complete.value
      ? (props.labels?.tool?.domainExpanded?.(name) ?? `Expand ${name} tools`)
      : (props.labels?.tool?.domainExpanding?.(name) ?? `Expanding ${name} tools`);
  }
  return toolSummaryLabel(props.card.toolName, props.card.args);
});
const resolvedName = computed(() => props.labels?.tool?.resolveName?.(props.card.toolName, props.card.args) ?? toolDisplayName(props.card.toolName, props.card.args));
const nestedToolLabel = computed(
  () =>
    domainExpansion.value ? toolLabel.value : toolCompactLabel(props.card.toolName, props.card.args, resolvedName.value),
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
                ? 'ef-chat__tool-badge--nested'
                : 'ef-chat__tool-badge--standalone',
            )
          "
        >
          <template v-if="typeof props.stepNumber === 'number'">
            {{ String(props.stepNumber) }}
          </template>
          <CheckCircle2 v-else-if="complete" :size="14" />
          <LoaderCircle v-else-if="running" class="animate-spin" :size="14" />
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
              v-if="!props.nested"
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

        <section v-if="complete">
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
          <div
            v-if="props.card.result"
            style="max-height: 256px; overflow-y: auto"
          >
            <ToolResultView :value="props.card.result" />
          </div>
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
