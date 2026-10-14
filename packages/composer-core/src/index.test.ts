// @vitest-environment jsdom
import { expect, it } from "vitest";
import {
  composerOverlayParts,
  filterSuggestions,
  insertSuggestion,
  insertNewlineAtCursor,
  pastedImage,
  requestedSkillsFromDraft,
} from "./index";
const suggestions = [
  {
    kind: "skill",
    name: "review",
    displayName: "代码审查",
    description: "Review changes",
  },
  { kind: "command", name: "clear", category: "session" },
] as const;
it("filters slash commands and skills, keeps dollar queries skill-only, and preserves whitespace on insertion", () => {
  expect(filterSuggestions("/", [...suggestions])).toHaveLength(2);
  expect(filterSuggestions("$", [...suggestions])).toHaveLength(1);
  expect(filterSuggestions("/session", [...suggestions])[0]?.name).toBe(
    "clear"
  );
  expect(insertSuggestion("hello\n$rev", suggestions[0])).toEqual({
    value: "hello\n$review ",
    caret: 14,
  });
  expect(insertSuggestion("plain text", suggestions[0])).toBeNull();
});
it("only replaces registered skill tokens with labels", () => {
  expect(
    composerOverlayParts("$review $unknown", [...suggestions])
  ).toContainEqual({ text: "$review", displayName: "代码审查" });
  expect(composerOverlayParts("$unknown", [...suggestions])).toContainEqual({
    text: "$unknown",
    displayName: null,
  });
});
it("replaces the selection with a newline and preserves the caret", () => {
  const editor = document.createElement("textarea");
  editor.value = "hello world";
  editor.setSelectionRange(5, 11);
  expect(insertNewlineAtCursor(editor)).toBe("hello\n");
  expect(editor.selectionStart).toBe(6);
});
it("normalizes anonymous pasted images while leaving text paste alone", () => {
  const file = new File(["image"], "", { type: "image/png" });
  const data = {
    items: [{ kind: "file", type: "image/png", getAsFile: () => file }],
  } as unknown as DataTransfer;
  expect(pastedImage(data)?.name).toMatch(/^pasted-image-.*\.png$/);
  expect(pastedImage(null)).toBeNull();
});

it("reserves slash for commands and retains explicit restored identities independently of refreshed grants", () => {
  expect(filterSuggestions("/", [...suggestions], ["$"]).map(item => item.name)).toEqual(["clear"]);
  expect(requestedSkillsFromDraft("$review check $review $unknown", [...suggestions])).toEqual(["review"]);
  expect(requestedSkillsFromDraft("$代码审查 check", [], ["代码审查"])).toEqual(["代码审查"]);
  expect(requestedSkillsFromDraft("removed token", [], ["review"])).toEqual([]);
  expect(composerOverlayParts("$代码审查", [{ kind: "skill", name: "代码审查", displayName: "审查" }])).toContainEqual({ text: "$代码审查", displayName: "审查" });
});
