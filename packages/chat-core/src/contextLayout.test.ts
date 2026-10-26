import { expect, it } from "vitest";
import { contextBlockPlacements } from "./contextLayout";
import fixture from "../../../contracts/context-cache-order.json";

it("uses the real Framework request report for live and persisted placement", () => {
  for (const report of [fixture.contextReport, JSON.parse(JSON.stringify(fixture.contextReport))]) {
    expect([...contextBlockPlacements([...report.blocks].reverse())]).toEqual([
      ["dynamic","dynamic"],["framework.history","history"],["framework.instructions","prefix"],
    ]);
    const history = report.blocks.find((block: { id: string }) => block.id === "framework.history")!;
    expect(history.final_message_count).toBe(5);
  }
});

it("does not invent placement when history is absent or positions are ambiguous", () => {
  for (const blocks of [
    [{id:"data",position:0}],
    [{id:"framework.history",position:0},{id:"data",position:0}],
    [{id:"framework.history",position:-1}],
  ]) expect([...contextBlockPlacements(blocks).values()].every(value => value === "unknown")).toBe(true);
});

it("classifies newly registered contributors from positions for live and saved snapshots", () => {
  const blocks = [
    {id:"framework.instructions",position:0},
    {id:"current_session_checkpoint",position:1},
    {id:"framework.history",position:2},
    ...["skills.catalog","dude_wakeup","dude_environment","runtime_identity","agent_directory","tool_domains"].map((id,index) => ({id,position:index+3})),
  ];
  for (const report of [blocks, JSON.parse(JSON.stringify(blocks))]) {
    const placements = contextBlockPlacements(report);
    for (const block of blocks.slice(3)) expect(placements.get(block.id)).toBe("dynamic");
    expect(placements.get("current_session_checkpoint")).toBe("prefix");
  }
});
