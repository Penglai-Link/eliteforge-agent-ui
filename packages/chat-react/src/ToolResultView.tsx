import { toolResultPreview } from "@eliteforge/agent-ui-chat-core";
import { formatJsonBlockValue } from "@eliteforge/agent-ui-chat-core";
function JsonBlock({ value }: { value: string }) { return <pre className="ef-chat__result-block">{formatJsonBlockValue(value)}</pre>; }
export function ToolResultView({ value }: { value: string }) {
  const preview = toolResultPreview(value);
  const hasPreview = preview.texts.length + preview.images.length + preview.links.length + preview.facts.length > 0;
  return <div className="ef-chat__tool-result-preview">
    {preview.texts.map((text, index) => <p key={index} style={{ whiteSpace: "pre-wrap" }}>{text}</p>)}
    {preview.images.map(image => <a key={image.url} href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={image.name || "Tool result image"} loading="lazy" style={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain" }} /></a>)}
    {preview.links.map((link, index) => <p key={`${link.url}-${index}`}><a href={link.url} target="_blank" rel="noreferrer">{link.title}</a>{link.snippet && <span style={{ display: "block" }}>{link.snippet}</span>}</p>)}
    {preview.facts.length > 0 && <dl>{preview.facts.map(fact => <div key={fact.label}><dt style={{ display: "inline" }}>{fact.label}: </dt><dd style={{ display: "inline", margin: 0 }}>{fact.value}</dd></div>)}</dl>}
    {hasPreview ? <details><summary>JSON</summary><JsonBlock value={value} /></details> : <JsonBlock value={value} />}
  </div>;
}
