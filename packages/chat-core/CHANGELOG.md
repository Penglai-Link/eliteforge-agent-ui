# @personai/agent-ui-chat-core


## 1.0.0-preview.29

- `RUN_ERROR` 事件可携带 `diagnostic`，校验后附加到运行失败通知；新增 `parseChatRunDiagnostic`。
- 新增 `notices.traceId` 与 `notices.viewTrace` 文案项。
- 统一内部依赖版本为 `1.0.0-preview.29`。

## 1.0.0-preview.13

- 修复用户停止运行后，历史失败记录重复显示为运行失败。
- 统一内部依赖版本为 `1.0.0-preview.13`。

## 1.0.0-preview.12

- 提供 React/Vue 共用的微点历史索引样式；构建时合入聊天包样式。
- 统一内部依赖版本为 `1.0.0-preview.12`。

## 0.1.1

### Patch Changes

- Build chat workspace packages into publishable JavaScript, type declaration, and stylesheet artifacts.
