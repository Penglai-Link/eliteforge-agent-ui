<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ArrowRight, ChevronLeft, ChevronRight, PencilLine } from "lucide-vue-next";
import type { ChatUserInputAnswer, ChatUserInputLabels, ChatUserInputRequest } from "@eliteforge/agent-ui-chat-core";

const defaultLabels: ChatUserInputLabels = {
  ariaLabel: "Assistant questions",
  progress: (current, total) => `Question ${current} of ${total}`,
  back: "Back",
  next: "Next",
  continue: "Continue",
  confirm: "Confirm",
  continuing: "Continuing…",
  otherOptionLabel: "Other",
  otherOptionDescription: "Provide a custom answer.",
  skipOptionLabel: "Skip",
  skipOptionDescription: "Skip this question.",
  otherAnswerPlaceholder: "Type your answer",
  otherAnswerAriaLabel: (index) => `Other answer for question ${index}`,
};

const props = withDefaults(defineProps<{ request: ChatUserInputRequest; disabled?: boolean; labels?: ChatUserInputLabels }>(), { disabled: false, labels: undefined });
const emit = defineEmits<{ submit: [answers: ChatUserInputAnswer[]] }>();
const currentIndex = ref(0);
const selected = reactive<Record<string, string>>({});
const otherText = reactive<Record<string, string>>({});
const currentQuestion = computed(() => props.request.questions[currentIndex.value]);
const labels = computed(() => props.labels ?? defaultLabels);
const selectedCode = computed(() => currentQuestion.value ? selected[currentQuestion.value.questionId] ?? "" : "");
const currentOtherText = computed(() => currentQuestion.value ? otherText[currentQuestion.value.questionId]?.trim() ?? "" : "");
const complete = computed(() => Boolean(selectedCode.value) || Boolean(currentOtherText.value));
const hasAnswer = computed(() => Boolean(currentOtherText.value) || Boolean(selectedCode.value && !selectedCode.value.startsWith("SKIP-")));
const isLastQuestion = computed(() => currentIndex.value === props.request.questions.length - 1);

watch(() => props.request.requestId, () => {
  currentIndex.value = 0;
  Object.keys(selected).forEach((key) => delete selected[key]);
  Object.keys(otherText).forEach((key) => delete otherText[key]);
});

function answerFor(questionId: string): ChatUserInputAnswer {
  const optionId = selected[questionId] ?? "";
  const customText = otherText[questionId]?.trim() ?? "";
  if (customText || optionId.startsWith("OTHER-")) return { questionId, answerKind: "Other", optionId: null, otherText: customText };
  if (optionId.startsWith("SKIP-")) return { questionId, answerKind: "Skipped", optionId: null, otherText: null };
  return { questionId, answerKind: "Option", optionId, otherText: null };
}

function goNext() {
  if (props.disabled || !complete.value) return;
  if (!isLastQuestion.value) {
    currentIndex.value += 1;
    return;
  }
  emit("submit", props.request.questions.map((question) => answerFor(question.questionId)));
}

function goBack() {
  if (props.disabled || currentIndex.value === 0) return;
  currentIndex.value -= 1;
}

function skipQuestion() {
  if (props.disabled || !currentQuestion.value) return;
  const question = currentQuestion.value;
  const skippedAnswer: ChatUserInputAnswer = {
    questionId: question.questionId,
    answerKind: "Skipped",
    optionId: null,
    otherText: null,
  };
  selected[question.questionId] = `SKIP-${question.questionId}`;
  otherText[question.questionId] = "";
  if (!isLastQuestion.value) {
    currentIndex.value += 1;
    return;
  }
  emit("submit", props.request.questions.map((item) => item.questionId === question.questionId ? skippedAnswer : answerFor(item.questionId)));
}

function customOptionCode() {
  return currentQuestion.value?.options.find((option) => option.optionId.startsWith("OTHER-"))?.optionId
    ?? `OTHER-${currentQuestion.value?.questionId ?? "ANSWER"}`;
}

function updateOtherText(value: string) {
  if (!currentQuestion.value) return;
  const questionId = currentQuestion.value.questionId;
  otherText[questionId] = value;
  selected[questionId] = value.trim() ? customOptionCode() : selected[questionId] ?? "";
}

function handleOtherInput(event: Event) {
  updateOtherText((event.target as HTMLTextAreaElement).value);
}

function selectOption(optionId: string) {
  if (!currentQuestion.value) return;
  selected[currentQuestion.value.questionId] = optionId;
  otherText[currentQuestion.value.questionId] = "";
}

function handleOtherKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  goNext();
}

function submitOtherOrSkip() {
  if (hasAnswer.value) {
    goNext();
    return;
  }
  skipQuestion();
}

function isOtherOption(optionId: string) {
  return optionId.startsWith("OTHER-");
}

function isSkipOption(optionId: string) {
  return optionId.startsWith("SKIP-");
}
</script>

<template>
  <section v-if="currentQuestion" class="ef-chat__user-input-card" :aria-label="labels.ariaLabel">
    <div class="ef-chat__user-input-body">
      <div class="ef-chat__user-input-header">
        <p class="ef-chat__user-input-title">{{ currentQuestion.question }}</p>
        <div class="ef-chat__user-input-navigation" :aria-label="labels.progress(currentIndex + 1, request.questions.length)">
          <button class="ef-chat__user-input-nav-button" :aria-label="labels.back" :disabled="disabled || currentIndex === 0" type="button" @click="goBack">
            <ChevronLeft :size="15" aria-hidden="true" />
          </button>
          <span aria-live="polite">{{ labels.progress(currentIndex + 1, request.questions.length) }}</span>
          <button class="ef-chat__user-input-nav-button" :aria-label="isLastQuestion ? labels.continue : labels.next" :disabled="disabled || !complete" type="button" @click="goNext">
            <ChevronRight :size="15" aria-hidden="true" />
          </button>
        </div>
      </div>
      <fieldset :key="currentQuestion.questionId" class="ef-chat__user-input-question">
        <legend>{{ currentQuestion.question }}</legend>
        <div class="ef-chat__user-input-options">
          <label v-for="(option, optionIndex) in currentQuestion.options.filter((item) => !isOtherOption(item.optionId) && !isSkipOption(item.optionId))" :key="option.optionId" :class="['ef-chat__user-input-option', { 'is-selected': selectedCode === option.optionId }]">
            <span class="ef-chat__user-input-option-index" aria-hidden="true">{{ optionIndex + 1 }}</span>
            <input class="ef-chat__user-input-option-radio" :checked="selectedCode === option.optionId" :disabled="disabled" :name="currentQuestion.questionId" type="radio" :value="option.optionId" @change="selectOption(option.optionId)" />
            <span class="ef-chat__user-input-option-content">
              <strong>{{ option.label }}</strong>
              <small v-if="option.description">{{ option.description }}</small>
            </span>
            <ArrowRight v-if="selectedCode === option.optionId" class="ef-chat__user-input-option-arrow" :size="15" aria-hidden="true" />
          </label>
        </div>
      </fieldset>
    </div>
    <div class="ef-chat__user-input-actions">
      <label class="ef-chat__user-input-other">
        <PencilLine :size="15" aria-hidden="true" />
        <textarea class="ef-chat__user-input-other-answer" :disabled="disabled" :aria-label="labels.otherAnswerAriaLabel(currentIndex + 1)" maxlength="2000" :placeholder="labels.otherAnswerPlaceholder" rows="1" :value="otherText[currentQuestion.questionId] ?? ''" @input="handleOtherInput" @keydown="handleOtherKeydown" />
      </label>
      <button :class="['ef-chat__user-input-skip', { 'is-confirm': hasAnswer }]" :disabled="disabled" type="button" @click="submitOtherOrSkip">{{ hasAnswer ? labels.confirm ?? labels.continue : labels.skipOptionLabel }}</button>
    </div>
  </section>
</template>
