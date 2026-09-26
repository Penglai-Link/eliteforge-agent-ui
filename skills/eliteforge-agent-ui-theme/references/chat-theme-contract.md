# 聊天主题契约

## 令牌

`packages/chat-theme/src/theme.scss` 是主题变量的公共入口。基础主题色来自 `--color-*` 变量，再映射到 `--agent-ui-chat-*`；聊天 Markdown 和代码高亮支持 `--agent-ui-markdown-*`、`--agent-ui-syntax-*` 覆盖。添加变量时应保留合理回退值，并检查浅色、深色和 Matrix 深色主题。

## 结构挂点

| 挂点 | 用途 |
| --- | --- |
| `data-theme-part="chat"` | 聊天面板整体 |
| `data-theme-part="chat-message-user"` | 用户消息 |
| `data-theme-part="chat-message-assistant"` | 助手消息 |
| `data-theme-part="chat-input"` | 消息输入框 |
| `data-theme-effect-layer="chat"` | 宿主主题引擎可选放置聊天背景效果的区域 |

React 和 Vue 对应节点必须保持一致的挂点值。主题只应依赖这些公开标记和 CSS 变量，不应依赖内部 DOM 层级或 `ef-chat__*` 私有类名；除非用户明确要求调整结构契约。

## 效果层限制

效果层覆盖聊天容器、使用 `pointer-events: none`，聊天内容位于其上方。它仅预留宿主集成位置；包自身不接收主题 CSS、执行脚本或读取皮肤文件。任何由宿主加载的样式都应限制在该区域，并由宿主负责安全校验与生命周期。
