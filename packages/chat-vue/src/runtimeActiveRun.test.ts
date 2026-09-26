import type { ChatActiveRun, ChatAguiStreamEvent } from "@eliteforge/agent-ui-chat-core";
import { describe, expect, it } from "vitest";

import {
  resolveSuccessfulActiveRunSnapshot,
  retainActiveRunOnStatusFailure,
  type RuntimeActiveRunTrackingState,
} from "./runtimeActiveRun";

const activeRun: ChatActiveRun = {
  runId: "RUN-1",
  runtimeAdapterKey: "react",
  state: "RUNNING",
  supportsSteer: true,
};

function state(
  overrides: Partial<RuntimeActiveRunTrackingState> = {},
): RuntimeActiveRunTrackingState {
  return {
    activeRun: null,
    pendingProtocolTerminalRun: null,
    statusPending: false,
    ...overrides,
  };
}

function terminal(type: "RUN_ERROR" | "RUN_FINISHED") {
  return {
    runId: activeRun.runId,
    threadId: "SESSION-1",
    type,
  } satisfies ChatAguiStreamEvent;
}

describe("Vue runtime active-run tracking", () => {
  it("retains the last successful snapshot when status lookup fails", () => {
    expect(retainActiveRunOnStatusFailure(state({ activeRun }))).toEqual(
      state({ activeRun, statusPending: true }),
    );
  });

  it("resolves an unknown 409 status without losing its retry signal", () => {
    const pending = retainActiveRunOnStatusFailure(state());
    const recovered = resolveSuccessfulActiveRunSnapshot({
      nextActiveRun: activeRun,
      protocolEvents: [],
      protocolReplayEnabled: true,
      sessionId: "SESSION-1",
      state: pending,
      suppressedRunCodes: new Set(),
    });
    expect(recovered.shouldDrainQueue).toBe(false);
    expect(recovered.state.activeRun).toEqual(activeRun);

    const idle = resolveSuccessfulActiveRunSnapshot({
      nextActiveRun: null,
      protocolEvents: [],
      protocolReplayEnabled: false,
      sessionId: "SESSION-1",
      state: pending,
      suppressedRunCodes: new Set(),
    });
    expect(idle.shouldDrainQueue).toBe(true);
    expect(idle.state.statusPending).toBe(false);
  });

  it("waits for replay terminal before draining a recovered run", () => {
    const waiting = resolveSuccessfulActiveRunSnapshot({
      nextActiveRun: null,
      protocolEvents: [],
      protocolReplayEnabled: true,
      sessionId: "SESSION-1",
      state: state({ activeRun }),
      suppressedRunCodes: new Set(),
    });
    expect(waiting.shouldDrainQueue).toBe(false);
    expect(waiting.state.pendingProtocolTerminalRun).toEqual(activeRun);

    const finished = resolveSuccessfulActiveRunSnapshot({
      nextActiveRun: null,
      protocolEvents: [terminal("RUN_FINISHED")],
      protocolReplayEnabled: true,
      sessionId: "SESSION-1",
      state: waiting.state,
      suppressedRunCodes: new Set(),
    });
    expect(finished.shouldDrainQueue).toBe(true);
    expect(finished.state.pendingProtocolTerminalRun).toBeNull();
  });

  it("keeps retrying status while a replay terminal is still pending", () => {
    const failedRefresh = retainActiveRunOnStatusFailure(
      state({ pendingProtocolTerminalRun: activeRun }),
    );
    const waiting = resolveSuccessfulActiveRunSnapshot({
      nextActiveRun: null,
      protocolEvents: [],
      protocolReplayEnabled: true,
      sessionId: "SESSION-1",
      state: failedRefresh,
      suppressedRunCodes: new Set(),
    });

    expect(waiting.shouldDrainQueue).toBe(false);
    expect(waiting.state.pendingProtocolTerminalRun).toEqual(activeRun);
    expect(waiting.state.statusPending).toBe(true);
  });

  it("uses successful null as terminal when replay is unsupported", () => {
    const resolution = resolveSuccessfulActiveRunSnapshot({
      nextActiveRun: null,
      protocolEvents: [],
      protocolReplayEnabled: false,
      sessionId: "SESSION-1",
      state: state({ activeRun }),
      suppressedRunCodes: new Set(),
    });
    expect(resolution.shouldDrainQueue).toBe(true);
  });

  it("never drains a suppressed Stop transition", () => {
    const resolution = resolveSuccessfulActiveRunSnapshot({
      nextActiveRun: null,
      protocolEvents: [terminal("RUN_ERROR")],
      protocolReplayEnabled: true,
      sessionId: "SESSION-1",
      state: state({ activeRun }),
      suppressedRunCodes: new Set([activeRun.runId]),
    });
    expect(resolution.shouldDrainQueue).toBe(false);
    expect(resolution.consumedSuppressedRunCode).toBe(activeRun.runId);
  });
});
