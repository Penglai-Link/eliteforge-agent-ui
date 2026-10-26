import { expect, it } from "vitest";
import { buildAguiUserWorkCards } from "./transcript";
import { executingTools, finishedTools, nextThought, nextTools } from "../../../contracts/tool-group-phases";

it("tracks the current tool phase by reasoning boundaries, not tool completion or timestamps", () => {
  const phases = (events: typeof executingTools) => buildAguiUserWorkCards(events)
    .flatMap(card => card.kind === "toolGroup" ? [card.value.isCurrentPhase] : []);
  expect(phases(executingTools)).toEqual([true]);
  expect(phases(finishedTools)).toEqual([true]);
  expect(phases(nextThought)).toEqual([false]);
  expect(phases(nextTools)).toEqual([false, true]);
  expect(phases([...finishedTools, { type: "REASONING_START", runId: "another-run", timestamp: 1000 }])).toEqual([true]);
  const withoutReasoning = finishedTools.filter(event => !event.type.startsWith("REASONING"));
  expect(phases(withoutReasoning)).toEqual([true]);
  expect(phases([...withoutReasoning, { type: "REASONING_MESSAGE_START", runId: "RUN-1", timestamp: 1000 }])).toEqual([false]);
});
