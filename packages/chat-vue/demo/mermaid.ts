import { createApp, h, ref } from "vue";
import { ChatPanel } from "../src";
import { mermaidMarkdown } from "../../chat-core/demo/mermaid-fixture";
import "@personai/agent-ui-chat-theme";
import "../src/styles.css";

createApp({setup(){
  const content=ref(mermaidMarkdown), streaming=ref(false), dark=ref(false);
  return ()=>h("main",{style:{height:"100vh",display:"flex",flexDirection:"column"}},[
    h("div",{style:{padding:"12px",display:"flex",gap:"12px",alignItems:"center"}},[
      h("textarea",{"aria-label":"Markdown source",value:content.value,onInput:(event:Event)=>{content.value=(event.target as HTMLTextAreaElement).value;},style:{width:"65%",height:"80px"}}),
      h("label",[h("input",{type:"checkbox",checked:streaming.value,onChange:(event:Event)=>{streaming.value=(event.target as HTMLInputElement).checked;}}),"Streaming"]),
      h("button",{onClick:()=>{dark.value=!dark.value;document.documentElement.dataset.theme=dark.value?"matrix-dark":"light";}},"Theme"),
    ]),
    h(ChatPanel,{messages:[{id:"mermaid-message",messageId:"mermaid-message",sessionId:"mermaid-preview",role:"ASSISTANT",channel:"conversation",content:content.value,createdAt:"2026-10-14T00:00:00Z"}],
      draft:"",onDraftChange:()=>{},onSend:()=>{},sending:streaming.value,streamingAssistantMessageCode:streaming.value?"mermaid-message":null,showHeader:false,showAgui:false,
      session:{id:"mermaid-preview",sessionId:"mermaid-preview",status:"ACTIVE",title:"Mermaid",createdAt:"2026-10-14T00:00:00Z",updatedAt:"2026-10-14T00:00:00Z"}}),
  ]);
}}).mount("#root");
