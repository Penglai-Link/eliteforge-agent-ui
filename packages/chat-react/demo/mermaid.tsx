import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ChatPanel } from "../src";
import { mermaidMarkdown } from "../../chat-core/demo/mermaid-fixture";
import "@eliteforge/agent-ui-chat-theme";
import "../src/styles.css";

function Preview() {
  const [content, setContent] = useState(mermaidMarkdown);
  const [streaming, setStreaming] = useState(false);
  const [dark, setDark] = useState(false);
  return <main style={{height:"100vh",display:"flex",flexDirection:"column"}}>
    <div style={{padding:12,display:"flex",gap:12,alignItems:"center"}}>
      <textarea aria-label="Markdown source" value={content} onChange={event=>setContent(event.target.value)} style={{width:"65%",height:80}} />
      <label><input type="checkbox" checked={streaming} onChange={event=>setStreaming(event.target.checked)}/>Streaming</label>
      <button onClick={()=>{setDark(!dark);document.documentElement.dataset.theme=dark?"light":"matrix-dark";}}>Theme</button>
    </div>
    <ChatPanel messages={[{id:"mermaid-message",messageId:"mermaid-message",sessionId:"mermaid-preview",role:"ASSISTANT",channel:"conversation",content,createdAt:"2026-10-14T00:00:00Z"}]}
      draft="" onDraftChange={()=>{}} onSend={()=>{}} sending={streaming} streamingAssistantMessageCode={streaming?"mermaid-message":null} showHeader={false} showAgui={false}
      session={{id:"mermaid-preview",sessionId:"mermaid-preview",status:"ACTIVE",title:"Mermaid",createdAt:"2026-10-14T00:00:00Z",updatedAt:"2026-10-14T00:00:00Z"}} />
  </main>;
}
createRoot(document.getElementById("root")!).render(<Preview/>);
