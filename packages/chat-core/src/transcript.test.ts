import { describe, expect, it } from "vitest";

import {
  aguiReasoningEffort,
  buildAguiRunNotices,
  mergeTranscriptAguiEvents,
  aguiWorkRailsByMessageCode,
  buildAguiUserWorkCards,
  buildTranscriptPresentation,
  isRecentPendingUserTurn,
  openAguiProtocolRunCodes,
} from "./transcript";
import {
  aguiWorkElapsedMilliseconds,
  currentAguiWorkActivity,
  currentAguiWorkSnapshot,
  isAguiRunTerminal,
} from "./aguiWork";
import type {
  ChatAguiStreamEvent,
  ChatMessage,
} from "./types";

function userMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    actor: "User",
    channel: "MAIN_AGENT",
    content: "hello",
    createdAt: "2026-06-10T00:00:00.000Z",
    id: 1,
    messageId: "MSG-USER",
    role: "USER",
    sessionId: "SESSION-1",
    ...overrides,
  };
}

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    actor: "Assistant",
    channel: "MAIN_AGENT",
    content: "reply",
    createdAt: "2026-06-10T00:00:02.000Z",
    id: 2,
    messageId: "MSG-ASSISTANT",
    role: "ASSISTANT",
    runId: "RUN-1",
    sessionId: "SESSION-1",
    ...overrides,
  };
}

function event(overrides: Partial<ChatAguiStreamEvent> & Pick<ChatAguiStreamEvent, "type">): ChatAguiStreamEvent {
  return {
    runId: "RUN-1",
    threadId: "SESSION-1",
    timestamp: 1_000,
    ...overrides,
  };
}

function compaction(name: string, timestamp = 1): ChatAguiStreamEvent {
  return { type: "CUSTOM", name: `agent.memory.${name}`, timestamp, runId: "RUN-1", threadId: "SESSION-1", value: {} };
}

describe("AG-UI run notices", () => {
  it("updates one compaction notice through its lifecycle and uses the latest attempt", () => {
    const events = [compaction("context.compaction_requested"), compaction("compaction.started", 2)];
    expect(buildAguiRunNotices(events)).toEqual([{ kind: "compaction", status: "started", code: "" }]);
    events.push(compaction("compaction.completed", 3));
    expect(buildAguiRunNotices(events)).toEqual([{ kind: "compaction", status: "completed", code: "" }]);
    events.push(compaction("context.compaction_requested", 4));
    expect(buildAguiRunNotices(events)).toEqual([{ kind: "compaction", status: "requested", code: "" }]);
  });

  it("retains failure codes without rendering full custom event payloads", () => {
    expect(buildAguiRunNotices([{ ...compaction("compaction.failed"), value: { errorCode: "MODEL_UNAVAILABLE", privatePayload: "hidden" } }]))
      .toEqual([{ kind: "compaction", status: "failed", code: "MODEL_UNAVAILABLE" }]);
  });

  it.each(["RUN_ERROR", "RUN_FINISHED"])("does not leave a compaction spinner after %s", (type) => {
    expect(buildAguiRunNotices([compaction("compaction.started"), { type }])[0])
      .toEqual({ kind: "compaction", status: "interrupted", code: "" });
  });

  it("ignores routine context assembly, rebasing and unknown custom events", () => {
    expect(buildAguiRunNotices([
      compaction("context.assembled"), compaction("context.rebased"),
      { type: "CUSTOM", name: "unrelated.event", value: { text: "hidden" } },
      { type: "CUSTOM", name: "toString" },
    ])).toEqual([]);
  });

  it("extracts tool budget numbers and leaves other errors intact", () => {
    expect(buildAguiRunNotices([{
      type: "RUN_ERROR", code: "tool_schema_over_budget",
      message: "TOOL_SCHEMA_OVER_BUDGET: estimatedTokens=27294, limitTokens=21597, toolCount=89; tool exposure was not changed",
    }])[0]).toMatchObject({ kind: "runError", toolSchemaBudget: { estimatedTokens: 27294, limitTokens: 21597, toolCount: 89 } });
    expect(buildAguiRunNotices([{ type: "RUN_ERROR", code: "model_unavailable", message: "Model is unavailable" }]))
      .toEqual([{ kind: "runError", code: "model_unavailable", message: "Model is unavailable" }]);
  });

  it("handles missing or malformed budget details without making up numbers", () => {
    for (const message of ["", "estimatedTokens=bad", "estimatedTokens=99999999999999999999999, limitTokens=1, toolCount=1"]) {
      expect(buildAguiRunNotices([{ type: "RUN_ERROR", code: "tool_schema_over_budget", message }])[0])
        .toMatchObject({ kind: "runError", toolSchemaBudget: undefined });
    }
  });

  it("deduplicates live and replay without dropping distinct custom events in the same millisecond", () => {
    const events = [compaction("compaction.started"), compaction("compaction.completed")];
    const merged = mergeTranscriptAguiEvents(events, events);
    expect(merged).toHaveLength(2);
    expect(buildAguiRunNotices(merged)[0]).toMatchObject({ status: "completed" });
    expect(mergeTranscriptAguiEvents(events, [{ ...events[0], value: { sourceStartSeq: 20 } }])).toHaveLength(3);
    expect(mergeTranscriptAguiEvents(events, [{ ...events[0], threadId: "SESSION-2" }])).toHaveLength(3);
  });
});

describe("buildAguiUserWorkCards", () => {
  it("keeps structured reasoning summary separate from raw reasoning and groups tools", () => {
    const cards = buildAguiUserWorkCards([
      event({ type: "RUN_STARTED", timestamp: 1_000 }),
      event({ type: "REASONING_START", timestamp: 1_001 }),
      event({ type: "REASONING_TEXT_CONTENT", delta: "Raw reasoning stream segment", timestamp: 1_002 }),
      event({ type: "REASONING_MESSAGE_CONTENT", delta: "Structured summary", timestamp: 1_003 }),
      event({
        type: "TOOL_CALL_START",
        timestamp: 1_004,
        toolCallArgs: { path: "/tmp/demo.txt" },
        toolCallId: "tool-1",
        toolCallName: "fs.read",
      }),
      event({
        type: "TOOL_CALL_RESULT",
        content: "tool result",
        timestamp: 1_005,
        toolCallId: "tool-1",
        toolCallName: "fs.read",
      }),
      event({ type: "TOOL_CALL_END", timestamp: 1_006, toolCallId: "tool-1" }),
      event({ type: "REASONING_END", timestamp: 1_007 }),
    ]);

    expect(cards).toHaveLength(2);
    expect(cards[0]?.kind).toBe("reasoning");
    if (cards[0]?.kind !== "reasoning") throw new Error("expected reasoning card");
    expect(cards[0].value.content).toBe("Raw reasoning stream segment");
    expect(cards[0].value.summary).toBe("Structured summary");
    expect(cards[0].value.toolCards).toHaveLength(1);
    expect(cards[1]?.kind).toBe("toolGroup");
    if (cards[1]?.kind !== "toolGroup") throw new Error("expected tool group card");
    expect(cards[1].value.toolCards[0]?.toolName).toBe("fs.read");
    expect(cards[1].value.toolCards[0]?.result).toBe("tool result");
  });

  it("uses raw reasoning fallback when no structured reasoning message is present", () => {
    const cards = buildAguiUserWorkCards([
      event({ type: "REASONING_START", timestamp: 2_000 }),
      event({ type: "REASONING_TEXT_CONTENT", delta: "fallback reasoning", timestamp: 2_001 }),
      event({ type: "REASONING_END", timestamp: 2_002 }),
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0]?.kind).toBe("reasoning");
    if (cards[0]?.kind !== "reasoning") throw new Error("expected reasoning card");
    expect(cards[0].value.content).toBe("fallback reasoning");
    expect(cards[0].value.summary).toBe("");
  });

  it("keeps the selected tool name when replayed argument and result events omit it", () => {
    const cards = buildAguiUserWorkCards([
      event({
        type: "TOOL_CALL_START",
        timestamp: 3_000,
        toolCallId: "tool-bash",
        toolCallName: "bash_exec",
      }),
      event({
        type: "TOOL_CALL_ARGS",
        delta: '{"command":"date"}',
        timestamp: 3_001,
        toolCallId: "tool-bash",
      }),
      event({
        type: "TOOL_CALL_RESULT",
        content: '{"command":"date","success":true}',
        timestamp: 3_002,
        toolCallId: "tool-bash",
      }),
      event({ type: "TOOL_CALL_END", timestamp: 3_003, toolCallId: "tool-bash" }),
    ]);

    const toolGroup = cards.find((card) => card.kind === "toolGroup");
    if (!toolGroup || toolGroup.kind !== "toolGroup") throw new Error("expected tool group card");
    expect(toolGroup.value.toolCards[0]?.toolName).toBe("bash_exec");
  });
});

describe("aguiReasoningEffort", () => {
  it("reads the effective effort from protocol and canonical replay events", () => {
    expect(aguiReasoningEffort([
      event({ type: "RUN_STARTED", reasoningEffort: "High" }),
    ])).toBe("High");
    expect(aguiReasoningEffort([{
      eventName: "agent.run.started",
      id: "1",
      metadata: { reasoningEffort: "Medium" },
      occurredAt: "2026-06-10T00:00:00.000Z",
      outcome: "STARTED",
      runId: "RUN-1",
      streamKey: "SESSION-1",
      type: "agent.run.started",
    }])).toBe("Medium");
  });

  it("does not invent an effort for legacy runs", () => {
    expect(aguiReasoningEffort([event({ type: "RUN_STARTED" })])).toBeNull();
  });
});

describe("AG-UI current work activity", () => {
  it("uses a structured activity snapshot when one is available", () => {
    const events = [
      event({ type: "RUN_STARTED", timestamp: 1_000 }),
      event({ activity: "PREPARING", type: "ACTIVITY_SNAPSHOT", timestamp: 1_001 }),
      event({ type: "REASONING_MESSAGE_START", messageId: "reasoning-1", timestamp: 1_002 }),
      event({ type: "REASONING_MESSAGE_CONTENT", delta: "Reviewing the repository.", messageId: "reasoning-1", timestamp: 1_003 }),
      event({ type: "REASONING_MESSAGE_CONTENT", delta: "Preparing the implementation plan.", messageId: "reasoning-1", timestamp: 1_004 }),
      event({ activity: "THINKING", summary: "Preparing the implementation plan.", type: "ACTIVITY_SNAPSHOT", timestamp: 1_005 }),
    ];

    expect(currentAguiWorkActivity(events)).toBe("THINKING");
    expect(currentAguiWorkSnapshot(events)).toEqual({
      activity: "THINKING",
      summary: "Reviewing the repository. Preparing the implementation plan.",
    });
    expect(
      buildAguiUserWorkCards(events)
        .filter((card) => card.kind === "reasoning")
        .map((card) => card.value.summary),
    ).toEqual([
      "Reviewing the repository. Preparing the implementation plan.",
    ]);
    expect(aguiWorkElapsedMilliseconds(events, 3_005)).toBe(2_005);
    expect(isAguiRunTerminal(events)).toBe(false);

    const finished = [...events, event({ type: "RUN_FINISHED", timestamp: 3_500 })];
    expect(aguiWorkElapsedMilliseconds(finished, 9_000)).toBe(2_500);
    expect(isAguiRunTerminal(finished)).toBe(true);
  });

  it("does not derive a summary from raw reasoning", () => {
    const events = [
      event({ type: "RUN_STARTED", timestamp: 1_000 }),
      event({ activity: "THINKING", type: "ACTIVITY_SNAPSHOT", timestamp: 1_001 }),
      event({ type: "REASONING_START", timestamp: 1_002 }),
      event({ type: "REASONING_TEXT_CONTENT", delta: "Inspecting the source code.", timestamp: 1_003 }),
      event({ type: "REASONING_TEXT_CONTENT", delta: " The next sentence is still streaming", timestamp: 1_004 }),
    ];

    expect(currentAguiWorkSnapshot(events)).toEqual({
      activity: "THINKING",
      summary: null,
    });
  });

  it("does not expose a raw user-request restatement as a summary", () => {
    const events = [
      event({ type: "REASONING_START", timestamp: 1_000 }),
      event({
        type: "REASONING_TEXT_CONTENT",
        delta: "The user is saying the task needs to continue. Reviewing the incomplete files.",
        timestamp: 1_001,
      }),
    ];

    expect(currentAguiWorkSnapshot(events)).toBeNull();
  });

  it("does not create checkpoints for raw reasoning turns", () => {
    const firstTurn = [
      event({ type: "REASONING_START", timestamp: 1_000 }),
      event({ type: "REASONING_TEXT_CONTENT", delta: "Inspecting the source code.", timestamp: 1_001 }),
      event({ type: "REASONING_END", timestamp: 1_002 }),
    ];
    const secondTurn = [
      ...firstTurn,
      event({ type: "REASONING_START", timestamp: 1_003 }),
      event({ type: "REASONING_TEXT_CONTENT", delta: "Planning", timestamp: 1_004 }),
    ];

    expect(currentAguiWorkSnapshot(firstTurn)).toBeNull();
    expect(currentAguiWorkSnapshot(secondTurn)).toBeNull();
  });
});

describe("aguiWorkRailsByMessageCode", () => {
  it("anchors replay runs to the preceding user message", () => {
    const messages = [
      userMessage(),
      assistantMessage(),
    ];
    const rails = aguiWorkRailsByMessageCode(messages, [
      event({ type: "RUN_STARTED", timestamp: 3_000 }),
      event({ type: "REASONING_START", timestamp: 3_001 }),
      event({ type: "REASONING_TEXT_CONTENT", delta: "reasoning", timestamp: 3_002 }),
      event({ type: "REASONING_END", timestamp: 3_003 }),
      event({ type: "RUN_FINISHED", timestamp: 3_004 }),
    ], {}, 5);

    expect(rails.get("MSG-USER")).toHaveLength(1);
    expect(rails.get("MSG-USER")?.[0]?.runId).toBe("RUN-1");
  });

  it("anchors continuation runs after the interrupted assistant message", () => {
    const messages = [
      userMessage(),
      assistantMessage({ messageId: "MSG-ASK", runId: "RUN-1" }),
      assistantMessage({
        content: "continued reply",
        messageId: "MSG-CONTINUATION",
        runId: "RUN-2",
      }),
    ];
    const rails = aguiWorkRailsByMessageCode(messages, [
      event({ runId: "RUN-2", type: "RUN_STARTED", timestamp: 4_000 }),
      event({ runId: "RUN-2", type: "REASONING_START", timestamp: 4_001 }),
      event({ runId: "RUN-2", type: "REASONING_TEXT_CONTENT", delta: "continuing", timestamp: 4_002 }),
      event({ runId: "RUN-2", type: "REASONING_END", timestamp: 4_003 }),
      event({ runId: "RUN-2", type: "RUN_FINISHED", timestamp: 4_004 }),
    ], {}, 5);

    expect(rails.get("MSG-ASK")).toHaveLength(1);
    expect(rails.get("MSG-ASK")?.[0]?.runId).toBe("RUN-2");
    expect(rails.get("MSG-USER")).toBeUndefined();
  });
});

describe("pending run helpers", () => {
  it("keeps an error-only run visible in live events and after replay", () => {
    const messages = [userMessage()];
    const events = [
      event({ type: "RUN_STARTED", timestamp: Date.parse(messages[0].createdAt) + 1 }),
      event({ type: "RUN_ERROR", message: "Tool budget exceeded", timestamp: Date.parse(messages[0].createdAt) + 2 }),
    ];
    for (const source of [{ liveAguiEvents: events }, { protocolEvents: events }]) {
      const presentation = buildTranscriptPresentation({ messages, sessionId: "SESSION-1", ...source });
      expect(presentation.workRailsByMessageCode.get("MSG-USER")?.[0]?.runId).toBe("RUN-1");
    }
  });

  it("keeps historical failed runs attached to their original turn after a later successful reply", () => {
    const messages = [
      userMessage(),
      userMessage({ id: 3, messageId: "MSG-RETRY", createdAt: "2026-06-10T00:00:10.000Z" }),
      assistantMessage({ messageId: "MSG-RETRY-REPLY", runId: "RUN-2", createdAt: "2026-06-10T00:00:12.000Z" }),
    ];
    const presentation = buildTranscriptPresentation({
      messages, sessionId: "SESSION-1",
      liveAguiAnchorMessageCodes: { "RUN-1": "MSG-OPTIMISTIC-REPLACED" },
      protocolEvents: [
        event({ type: "RUN_STARTED", timestamp: Date.parse("2026-06-10T00:00:00.001Z") }),
        event({ type: "RUN_ERROR", message: "Model unavailable", timestamp: Date.parse("2026-06-10T00:00:01.000Z") }),
        event({ type: "RUN_ERROR", runId: "RUN-FOREIGN", threadId: "SESSION-2", timestamp: Date.parse("2026-06-10T00:00:01.000Z") }),
        event({ type: "RUN_ERROR", runId: "RUN-OLD", timestamp: Date.parse("2026-06-09T00:00:01.000Z") }),
      ],
    });
    expect(Array.from(presentation.workRailsByMessageCode.keys())).toEqual(["MSG-USER"]);
    expect(presentation.workRailsByMessageCode.get("MSG-USER")).toHaveLength(1);
  });

  it("preserves completed compaction-only runs, applies the replay limit and prefers explicit live anchors", () => {
    const messages = [userMessage(), assistantMessage({ runId: "RUN-OTHER" })];
    const events = ["RUN-1", "RUN-2"].flatMap((runId, index) => [
      event({ type: "CUSTOM", name: "agent.memory.compaction.completed", runId, timestamp: Date.parse(messages[0].createdAt) + index }),
      event({ type: "RUN_FINISHED", runId, timestamp: Date.parse(messages[0].createdAt) + index }),
    ]);
    const presentation = buildTranscriptPresentation({
      messages, sessionId: "SESSION-1", protocolEvents: events,
      debugOptions: { recentTurnLimit: 1 },
      liveAguiAnchorMessageCodes: { "RUN-2": "MSG-ASSISTANT" },
    });
    expect(Array.from(presentation.workRailsByMessageCode.keys())).toEqual(["MSG-ASSISTANT"]);
    expect(presentation.workRailsByMessageCode.get("MSG-ASSISTANT")?.[0]?.runId).toBe("RUN-2");
  });

  it("anchors answer continuations to the interrupted assistant while events are pending", () => {
    const messages = [
      userMessage(),
      assistantMessage({ messageId: "MSG-ASK" }),
    ];

    const presentation = buildTranscriptPresentation({
      liveAguiPending: true,
      liveAguiPendingAnchorMessageCode: "MSG-ASK",
      messages,
      protocolEvents: [
        event({ type: "RUN_STARTED", timestamp: 1_000 }),
        event({ type: "RUN_FINISHED", timestamp: 1_001 }),
      ],
      sessionId: "SESSION-1",
    });

    expect(presentation.waitingForModelAnchorMessageCode).toBe("MSG-ASK");
  });

  it("detects recent pending user turns and ignores stale ones", () => {
    expect(isRecentPendingUserTurn([
      userMessage({ createdAt: "2026-06-10T00:29:59.000Z" }),
    ], Date.parse("2026-06-10T00:30:00.000Z"))).toBe(true);

    expect(isRecentPendingUserTurn([
      userMessage({ createdAt: "2026-06-09T23:00:00.000Z" }),
    ], Date.parse("2026-06-10T00:30:01.000Z"))).toBe(false);
  });

  it("tracks only replay runs that have not reached a terminal event", () => {
    const openRuns = openAguiProtocolRunCodes([
      event({ runId: "RUN-OPEN", type: "RUN_STARTED", timestamp: 4_000 }),
      event({ runId: "RUN-OPEN", type: "REASONING_START", timestamp: 4_001 }),
      event({ runId: "RUN-CLOSED", type: "RUN_STARTED", timestamp: 4_002 }),
      event({ runId: "RUN-CLOSED", type: "RUN_FINISHED", timestamp: 4_003 }),
    ], "SESSION-1");

    expect(openRuns.has("RUN-OPEN")).toBe(true);
    expect(openRuns.has("RUN-CLOSED")).toBe(false);
  });
});
