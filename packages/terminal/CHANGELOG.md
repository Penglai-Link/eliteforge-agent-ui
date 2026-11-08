# @personai/agent-ui-terminal

## 0.1.2

### Patch Changes

- 交互样式优化

## Unreleased

### Minor Changes

- Stream command explanations through `AsyncIterable<string>` with cancellation,
  throttled Markdown rendering, and partial-result error handling. The
  `commandExplain` callback now receives an `AbortSignal`; callers returning a
  `Promise<string>` must migrate to an async generator.

## 0.1.1

### Patch Changes

- Build chat workspace packages into publishable JavaScript, type declaration, and stylesheet artifacts.
- Updated dependencies
  - @personai/agent-ui-chat-core@0.1.1
