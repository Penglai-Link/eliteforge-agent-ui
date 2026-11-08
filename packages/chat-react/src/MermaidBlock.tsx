import { MermaidDiagram, mermaidFenceClosed } from "@personai/agent-ui-chat-core";
import { createContext, useContext, useEffect, useRef } from "react";
import type { Components } from "react-markdown";

export const MarkdownSourceContext = createContext({ content: "", streaming: false });

function MermaidBlock({ source, ready }: { source: string; ready: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const diagram = useRef<MermaidDiagram | null>(null);
  useEffect(() => {
    if (!element.current) return;
    const controller = new MermaidDiagram(element.current);
    diagram.current = controller;
    return () => { controller.dispose(); diagram.current = null; };
  }, []);
  useEffect(() => { diagram.current?.update(source, ready); }, [source, ready]);
  return <div className="ef-chat__mermaid" data-theme-part="chat-mermaid" ref={element} />;
}

export const MermaidPre: Components["pre"] = ({ node, children, ...props }) => {
  const markdown = useContext(MarkdownSourceContext);
  const code = node?.children[0];
  if (code?.type === "element" && code.tagName === "code") {
    const classes = code.properties.className;
    if (Array.isArray(classes) && classes.some(name => String(name).toLowerCase() === "language-mermaid")) {
      const source = code.children.map(child => child.type === "text" ? child.value : "").join("");
      const fence = markdown.content.slice(node?.position?.start.offset ?? 0, node?.position?.end.offset);
      return <MermaidBlock source={source} ready={!markdown.streaming || mermaidFenceClosed(fence)} />;
    }
  }
  return <pre {...props}>{children}</pre>;
};
