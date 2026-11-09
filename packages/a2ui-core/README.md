# @personai/agent-ui-a2ui-core

A2UI 协议解析与交互核心，提供 Catalog、数据模型和交互处理能力，支持自定义组件目录。接入方式见仓库 [接入文档](../../docs/a2ui-client.md)。

当前源码的 `TextField.placeholder` 支持字符串和数据路径绑定，两套 Catalog 与 React/Vue 渲染保持一致。提示不代替 `label`，也不作为提交值。此变更从 `1.0.0-preview.4` 开始提供；服务端需使用匹配的 Catalog。

`client.apply` 接收完整信封，如 `{"version":"v0.9.1","updateComponents":{"surfaceId":"profile","components":[...]}}`，不接收平铺的操作负载。
