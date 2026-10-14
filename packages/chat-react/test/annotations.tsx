import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ChatPanel } from "../src";
import { zhChatAnnotationLabels, type ChatMessage, type ChatAnnotation } from "@eliteforge/agent-ui-chat-core";
import "@eliteforge/agent-ui-chat-theme";
import "../src/styles.css";
const session = {id: "annotations", sessionId: "annotations", title: "对话选区评论", status: "ACTIVE" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()};
const message = (role: ChatMessage['role'], content: string): ChatMessage => ({id: crypto.randomUUID(), messageId: crypto.randomUUID(), role, content, actor: role === 'USER' ? 'User' : 'Agent', channel: 'conversation', sessionId: session.sessionId, createdAt: new Date().toISOString()});
function Preview() {
  const [draft, setDraft] = useState('');
  const [annotations, setAnnotations] = useState<ChatAnnotation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>(() => JSON.parse(localStorage.getItem('annotation-preview-native-history') || 'null') ?? [message('ASSISTANT', '每次 agent_spawn 都要新建一个子会话。\n\n当前这段函数同时用于新建子代理和继续已有线程。可以选中这段文字，添加评论，再发送消息。')]);
  const send = () => {
    if (!draft.trim() && !annotations.length) return;
    const reply = annotations.map((item, index) => `[Annotation ${index + 1}](#chat-annotation-${item.id}) 已收到对这段文字的评论：${item.comment}`).join('\n\n') || '已收到消息。';
    const next = [...messages, {...message('USER', draft), annotations}, message('ASSISTANT', reply)];
    setMessages(next); localStorage.setItem('annotation-preview-native-history', JSON.stringify(next)); setDraft(''); setAnnotations([]);
  };
  return <ChatPanel session={session} messages={messages} draft={draft} onDraftChange={setDraft} pendingAnnotations={annotations} onPendingAnnotationsChange={setAnnotations} onSend={send} annotationLabels={zhChatAnnotationLabels} formatAnnotationCount={count => `${count} 条评论`} inputPlaceholder="输入消息" showAgui={false} showHistoryRail={false} showHeader={false} />;
}
createRoot(document.getElementById('root')!).render(<Preview />);
