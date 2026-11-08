import { toolResultPreview, batchItemLabel, toolSearchPreviewLabel } from "@personai/agent-ui-chat-core";
import { formatJsonBlockValue } from "@personai/agent-ui-chat-core";
function JsonBlock({ value }: { value: string }) { return <pre className="ef-chat__result-block">{formatJsonBlockValue(value)}</pre>; }
export function ToolResultView({ value, locale, showRaw = true }: { value: string; locale?: string; showRaw?: boolean }) {
  const preview = toolResultPreview(value);
  const hasPreview = !!preview.items || !!preview.toolSearch || preview.texts.length + preview.images.length + preview.links.length + preview.facts.length > 0;
  return <div className="ef-chat__tool-result-preview">
    <div className={showRaw ? "ef-chat__tool-result-content" : undefined}>
    {preview.items ? preview.items.map(({item,value}) =>
    <section key={item.invocationId} data-batch-index={item.index} data-batch-status={item.status}>
      <p><strong>{batchItemLabel(item.index,item.status,locale)}</strong></p>
      {(item.content.length > 0 || item.result !== undefined) && <ToolResultView value={value} locale={locale} showRaw={false} />}
    </section>) : <>
    {preview.toolSearch && <section data-tool-search-mode={preview.toolSearch.mode}>
      <p>{toolSearchPreviewLabel(preview.toolSearch, locale)}</p>
      <ul>{preview.toolSearch.tools.map(tool => <li key={tool.callName}><strong>{tool.callName}</strong><p>{tool.description}</p></li>)}</ul>
    </section>}
    {preview.texts.map((text, index) => <p key={index} style={{ whiteSpace: "pre-wrap" }}>{text}</p>)}
    {preview.images.map(image => <a key={image.url} href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={image.name || "Tool result image"} loading="lazy" style={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain" }} /></a>)}
    {preview.links.map((link, index) => <p key={`${link.url}-${index}`}><a href={link.url} target="_blank" rel="noreferrer">{link.title}</a>{link.snippet && <span style={{ display: "block" }}>{link.snippet}</span>}</p>)}
    {preview.facts.length > 0 && <dl>{preview.facts.map(fact => <div key={fact.label}><dt style={{ display: "inline" }}>{fact.label}: </dt><dd style={{ display: "inline", margin: 0 }}>{fact.value}</dd></div>)}</dl>}
    {!hasPreview && <JsonBlock value={value} />}
    </>}
    </div>
    {hasPreview && showRaw && <details className="ef-chat__tool-result-raw"><summary>JSON</summary><JsonBlock value={value} /></details>}
  </div>;
}
