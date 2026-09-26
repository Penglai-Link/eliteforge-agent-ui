import { describe, expect, it } from "vitest";

import {
  ownsRuntimeStreamObserver,
  resolveRuntimeStreamSettlement,
  type RuntimeStreamObserverToken,
} from "./runtimeStreamObserver";

function observer(
  sessionId: string,
  abortReason: RuntimeStreamObserverToken["abortReason"] = "none",
): RuntimeStreamObserverToken {
  return { abortReason, sessionId };
}

describe("Vue runtime stream observer ownership", () => {
  it("lets only the current observer commit callbacks and a resolved result", () => {
    const current = observer("SESSION-1");

    expect(ownsRuntimeStreamObserver(current, current, "SESSION-1")).toBe(true);
    expect(
      resolveRuntimeStreamSettlement({
        activeObserver: current,
        activeSessionCode: "SESSION-1",
        observer: current,
      }),
    ).toEqual({
      canCommit: true,
      restoreSourceSubmission: false,
      streamSucceeded: true,
    });
  });

  it("treats a detached observer that resolves behind a new owner as stale", () => {
    const stale = observer("SESSION-1", "detach");
    const current = observer("SESSION-2");

    expect(ownsRuntimeStreamObserver(current, stale, "SESSION-2")).toBe(false);
    expect(
      resolveRuntimeStreamSettlement({
        activeObserver: current,
        activeSessionCode: "SESSION-2",
        observer: stale,
      }),
    ).toEqual({
      canCommit: false,
      restoreSourceSubmission: false,
      streamSucceeded: true,
    });
  });

  it("consumes a stopped source that was already submitted to the backend", () => {
    const stopped = observer("SESSION-1", "stop");

    expect(
      resolveRuntimeStreamSettlement({
        activeObserver: null,
        activeSessionCode: "SESSION-1",
        observer: stopped,
      }),
    ).toEqual({
      canCommit: false,
      restoreSourceSubmission: false,
      streamSucceeded: true,
    });
  });

  it("rejects an owner whose session is no longer active", () => {
    const stale = observer("SESSION-1");

    expect(ownsRuntimeStreamObserver(stale, stale, "SESSION-2")).toBe(false);
  });
});
