import { expect, it } from "vitest";
import fixture from "../../../contracts/tool-search.json";
import { historyToolResult, type HistoryToolInvocation } from "./history";
import { toolResultPreview, toolSearchPreviewLabel } from "./toolResults";

it.each(["summaries", "definitions"] as const)("projects the framework %s contract identically from live and history", key => {
  const value=fixture[key];
  const live=toolResultPreview(JSON.stringify(value.live));
  expect(toolResultPreview(historyToolResult(value.history as unknown as HistoryToolInvocation))).toEqual(live);
  const searches=live.items!.map(item=>toolResultPreview(item.value).toolSearch).filter(Boolean);
  expect(searches).toHaveLength(2);
  expect(searches[0]!.mode).toBe(key==="summaries" ? "summary" : "definition");
  expect(toolSearchPreviewLabel(searches[0]!,"zh-CN")).toContain(key==="summaries" ? "找到" : "已获取");
  expect(toolSearchPreviewLabel(searches[0]!,"en-US")).toContain(key==="summaries" ? "found" : "loaded");
  if(key==="summaries") {
    expect(searches[0]!.tools.map(tool=>tool.callName)).toEqual(["sample_edit","sample_read"]);
    expect(searches[1]!.tools).toEqual([]);
    expect(JSON.stringify(value.live)).not.toContain("input_schema");
  } else expect(live.items!.filter(item=>item.item.isError)).toHaveLength(2);
});

it("labels truncated and empty discovery and refuses malformed result records",()=>{
  const result={kind:"toolSearch",mode:"summary",tools:[],matched:4,truncated:true};
  const search=toolResultPreview(JSON.stringify(result)).toolSearch!;
  expect(toolSearchPreviewLabel(search,"zh-CN")).toContain("请缩小搜索范围");
  for (const invalid of [{...result,mode:"other"},{...result,tools:[{call_name:3}]},{...result,matched:-1}]) {
    expect(toolResultPreview(JSON.stringify(invalid)).toolSearch).toBeUndefined();
  }
});
