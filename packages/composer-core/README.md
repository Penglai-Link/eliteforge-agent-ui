# @personai/agent-ui-composer-core

独立消息输入区的共用类型、建议查询与插入、技能标签解析、换行、粘贴图片和附件显示工具。此包不依赖 chat、React、Vue 或 A2UI。

界面分别使用 `@personai/agent-ui-composer-react` 和 `@personai/agent-ui-composer-vue`。两端共用本包的样式，完整接入说明见仓库的 [docs/composer.md](../../docs/composer.md)。

`ComposerProps` 描述受控草稿、运行模式、队列、建议、待发送附件、禁用状态与文案。`ComposerQueuedMessage` 只要求 `id` 和 `input.content`，允许宿主保留其他队列字段。附件类型保留文件、图片和 inspection 的元数据。

样式入口：`@personai/agent-ui-composer-core/styles.css`。
