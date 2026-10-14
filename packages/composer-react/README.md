# @eliteforge/agent-ui-composer-react

可独立使用的 React 消息输入区。无需创建聊天会话或安装 chat 包。

```tsx
import { useState } from "react";
import { Composer } from "@eliteforge/agent-ui-composer-react";
import "@eliteforge/agent-ui-composer-react/styles.css";

export function MessageInput() {
  const [draft, setDraft] = useState("");
  return (
    <Composer
      draft={draft}
      onDraftChange={setDraft}
      onSend={(mode = "send") => console.log(mode, draft)}
    />
  );
}
```

`composerHeader` 和 `footerAddon` 接收 ReactNode；`composerRef` 可取得 textarea。`composerKey` 标识输入上下文，配合 `autoFocusComposer` 在切换时聚焦。

支持发送/停止、排队/即时调整、IME、Shift+Enter 换行、命令/技能建议、技能标签、图片粘贴、附件选择/预览/移除、队列编辑/移除、禁用状态和主题覆盖。上传、发送及队列存储由宿主回调处理。

仓库开发预览：`npm run dev --workspace=@eliteforge/agent-ui-composer-react`。完整参数与主题说明见 [docs/composer.md](../../docs/composer.md)。
