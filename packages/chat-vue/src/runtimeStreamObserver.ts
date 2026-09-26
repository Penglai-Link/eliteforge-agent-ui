export type RuntimeStreamAbortReason = "detach" | "none" | "stop";

export interface RuntimeStreamObserverToken {
  abortReason: RuntimeStreamAbortReason;
  sessionId: string;
}

export interface RuntimeStreamSettlement {
  canCommit: boolean;
  restoreSourceSubmission: boolean;
  streamSucceeded: boolean;
}

export function ownsRuntimeStreamObserver<
  TObserver extends RuntimeStreamObserverToken,
>(
  activeObserver: TObserver | null,
  observer: TObserver,
  activeSessionCode: string,
) {
  return (
    activeObserver === observer &&
    observer.abortReason === "none" &&
    observer.sessionId === activeSessionCode
  );
}

export function resolveRuntimeStreamSettlement<
  TObserver extends RuntimeStreamObserverToken,
>(args: {
  activeObserver: TObserver | null;
  activeSessionCode: string;
  observer: TObserver;
}): RuntimeStreamSettlement {
  const canCommit = ownsRuntimeStreamObserver(
    args.activeObserver,
    args.observer,
    args.activeSessionCode,
  );
  if (canCommit) {
    return {
      canCommit: true,
      restoreSourceSubmission: false,
      streamSucceeded: true,
    };
  }

  return {
    canCommit: false,
    restoreSourceSubmission: false,
    streamSucceeded: true,
  };
}
