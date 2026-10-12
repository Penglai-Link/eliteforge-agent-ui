import { describe, expect, it } from "vitest";
import { applyMessageProvenance, messageActorName, messageSenderIsHuman } from "./messageProvenance";
import { historyMessages, type SessionHistory } from "./history";
import type { ChatMessage } from "./types";
const message: ChatMessage = { id: "m", messageId: "m", sessionId: "s", role: "USER", actor: "User", channel: "main", content: "Build it", createdAt: "2026-10-11T00:00:00Z" };
const provenance = { sender: { kind: "dude", id: "d", displayName: "Main Dude" }, source: "thread_create", correlation: { taskId: "t" } };
describe("host message provenance", () => {
  it("retains an agent sender on a USER message without changing layout role", () => {
    const attributed = { ...message, provenance };
    expect(messageActorName(attributed, "Human")).toBe("Main Dude");
    expect(messageSenderIsHuman(attributed)).toBe(false);
    expect(attributed.role).toBe("USER");
  });
  it("uses the signed-in user's name instead of a generic human attribution label", () => {
    const attributed = { ...message, provenance: { sender: { kind: "user", displayName: "你" }, source: "chat" } };
    expect(messageActorName(attributed, "17725021454")).toBe("17725021454");
    expect(messageActorName(attributed)).toBe("你");
  });
  it("projects framework attribution events only into their own session", () => {
    const events = [{ type: "CUSTOM", name: "framework.message.provenance", threadId: "s", value: {messageId: "m", provenance} }];
    const result = applyMessageProvenance([message, {...message, sessionId: "other"}], events);
    expect(result[0].provenance).toEqual(provenance);
    expect(result[1].provenance).toBeUndefined();
  });
  it("keeps source and identity after authoritative history reload", () => {
    const page: SessionHistory = {sessionId:"s", version:"1", nextCursor:null, runs:[], activeRuns:[], pendingInteractions:[], records:{steps:[], toolInvocations:[], interactions:[], messages:[{id:"m",runId:"r",stepId:null,role:"User",content:[{type:"Text",text:"Build it"}],structured:null,status:"Completed",createdAtMs:0,provenance}]}};
    const result = historyMessages(page)[0];
    expect(result.provenance).toEqual(provenance);
    expect(result.actor).toBe("Main Dude");
  });
});
