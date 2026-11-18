import { createRoot } from "react-dom/client";
import { useState } from "react";
import {
  Composer,
  requestedSkillsFromDraft,
  type ComposerAttachment,
  type ComposerQueuedMessage,
  type ComposerSuggestion,
  type ComposerSubmitMode,
} from "./src";
import "./demo.css";
const suggestions: ComposerSuggestion[] = [
  { kind: "command", name: "clear", description: "清空当前上下文" },
  { kind: "command", name: "compact", description: "整理对话上下文" },
  {
    kind: "skill",
    name: "review",
    displayName: "代码审查",
    description: "检查改动与潜在问题",
  },
  {
    kind: "skill",
    name: "explain",
    displayName: "解释代码",
    description: "说明逻辑与调用关系",
  },
];
const imageUrl =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><rect width="180" height="120" fill="#81a18e"/><circle cx="130" cy="35" r="16" fill="#f8e1a2"/><path d="M0 120L65 40L130 120Z" fill="#2c5744"/></svg>'
  );
async function previewImage(file: File): Promise<string | undefined> {
  if (!file.type.startsWith("image/")) return undefined;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
const initialAttachments: ComposerAttachment[] = [
  {
    id: "image",
    kind: "image",
    imageUrl,
    fileName: "landscape.svg",
    summary: "风景",
    metadata: {},
  },
  {
    id: "file",
    kind: "file",
    fileName: "requirements.md",
    summary: "输入区能力清单",
    metadata: {},
  },
];
function Demo() {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [theme, setTheme] = useState("light");
  const [narrow, setNarrow] = useState(false);
  const [attachments, setAttachments] = useState(initialAttachments);
  const [queue, setQueue] = useState<ComposerQueuedMessage[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  function log(value: string) {
    setEvents((current) => [value, ...current].slice(0, 10));
  }
  function submit(mode: ComposerSubmitMode = "send") {
    if (!draft.trim() && !attachments.length) return;
    if (mode === "queue")
      setQueue((current) => [
        ...current,
        { id: crypto.randomUUID(), input: { content: draft || "附件消息" } },
      ]);
    else setSending(true);
    log(`${mode}: ${draft || "附件消息"} · requestedSkills=${JSON.stringify(requestedSkillsFromDraft(draft, suggestions))}`);
    setDraft("");
    if (mode !== "queue") setAttachments([]);
  }
  async function attach(file: File) {
    const imageUrl = await previewImage(file);
    setAttachments((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        kind: file.type.startsWith("image/") ? "image" : "file",
        imageUrl,
        fileName: file.name,
        contentType: file.type,
        summary: file.name,
        metadata: {},
      },
    ]);
    log(`attachment: ${file.name}`);
  }
  return (
    <main>
      <span className="eyebrow">ELITEFORGE / COMPOSER</span>
      <h1>独立消息输入区 · React</h1>
      <p>
        输入 / 或 $ 选择命令与技能。Enter 发送，Shift+Enter 换行；运行中 Enter
        排队，⌘/Ctrl+Enter 即时调整。可直接粘贴剪贴板中的图片或文件。
      </p>
      <div className="toolbar">
        <button
          onClick={() =>
            setTheme(
              theme === "light" ? "dark" : theme === "dark" ? "brand" : "light"
            )
          }
        >
          主题：{theme}
        </button>
        <button onClick={() => setSending(!sending)}>
          {sending ? "结束运行" : "模拟运行"}
        </button>
        <button onClick={() => setDisabled(!disabled)}>
          {disabled ? "启用输入" : "禁用输入"}
        </button>
        <button onClick={() => setNarrow(!narrow)}>切换窄屏</button>
        <button onClick={() => setAttachments(initialAttachments)}>
          恢复附件
        </button>
      </div>
      <section className="stage" data-theme={theme} data-narrow={narrow}>
        <Composer
          draft={draft}
          onDraftChange={setDraft}
          onSend={submit}
          onStop={() => {
            setSending(false);
            log("stop");
          }}
          sending={sending}
          disabledInput={disabled}
          runningSubmitModes={["queue", "steer"]}
          inputSuggestions={suggestions}
          autoFocusComposer
          composerKey="demo"
          inputPlaceholder="输入消息，或用 / 和 $ 选择能力"
          pendingAttachments={attachments}
          showAttachmentControl
          onAttachFile={attach}
          onPasteAttachment={attach}
          onRemoveAttachment={(id) => {
            setAttachments((current) =>
              current.filter((item) => item.id !== id)
            );
            log(`remove attachment: ${id}`);
          }}
          queuedMessages={queue}
          reorderQueuedLabel="拖动排序，也可使用上下方向键调整"
          onReorderQueuedMessage={(sourceId, targetId) => {
            setQueue(current => {
              const next = [...current];
              const sourceIndex = next.findIndex(item => item.id === sourceId);
              const targetIndex = next.findIndex(item => item.id === targetId);
              if (sourceIndex < 0 || targetIndex < 0) return current;
              const [item] = next.splice(sourceIndex, 1);
              next.splice(targetIndex, 0, item);
              return next;
            });
            log(`reorder queue: ${sourceId} → ${targetId}`);
          }}
          onRemoveQueuedMessage={(id) => {
            setQueue((current) => current.filter((item) => item.id !== id));
            log("remove queue");
          }}
          onEditQueuedMessage={(id, content) => {
            setDraft(content);
            setQueue((current) => current.filter((item) => item.id !== id));
            log("edit queue");
          }}
          composerHeader={
            <span className="header-note">
              附件预览与自定义头部可以同时显示
            </span>
          }
          footerAddon={
            <label className="addon">
              模型{" "}
              <select aria-label="Model">
                <option>Default</option>
                <option>Fast</option>
              </select>
              <span>扩展区</span>
            </label>
          }
        />
      </section>
      <div className="events" role="log">
        {events.join("\n") || "等待操作…"}
      </div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Demo />);
