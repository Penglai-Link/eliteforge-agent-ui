import type {
  ChatActiveRun,
  ChatAguiStreamEvent,
} from "@personai/agent-ui-chat-core";

export interface RuntimeActiveRunTrackingState {
  activeRun: ChatActiveRun | null;
  pendingProtocolTerminalRun: ChatActiveRun | null;
  statusPending: boolean;
}

export interface RuntimeActiveRunResolution {
  consumedSuppressedRunCode?: string;
  shouldDrainQueue: boolean;
  state: RuntimeActiveRunTrackingState;
}

function eventRunCode(event: ChatAguiStreamEvent) {
  return String(event.runId ?? event.runId ?? "");
}

export function hasProtocolTerminalForRun(
  events: ChatAguiStreamEvent[],
  sessionId: string,
  runId: string,
) {
  return events.some((event) => {
    const type = String(event.type).toUpperCase();
    if (type !== "RUN_FINISHED" && type !== "RUN_ERROR") return false;
    if (eventRunCode(event) !== runId) return false;
    const eventSessionCode = String(event.threadId ?? "");
    return !eventSessionCode || eventSessionCode === sessionId;
  });
}

export function retainActiveRunOnStatusFailure(
  state: RuntimeActiveRunTrackingState,
): RuntimeActiveRunTrackingState {
  return {
    ...state,
    statusPending: true,
  };
}

export function resolveSuccessfulActiveRunSnapshot(args: {
  nextActiveRun: ChatActiveRun | null;
  protocolEvents: ChatAguiStreamEvent[];
  protocolReplayEnabled: boolean;
  sessionId: string;
  state: RuntimeActiveRunTrackingState;
  suppressedRunCodes: ReadonlySet<string>;
}): RuntimeActiveRunResolution {
  const {
    nextActiveRun,
    protocolEvents,
    protocolReplayEnabled,
    sessionId,
    state,
    suppressedRunCodes,
  } = args;

  if (nextActiveRun) {
    return {
      shouldDrainQueue: false,
      state: {
        activeRun: nextActiveRun,
        pendingProtocolTerminalRun: null,
        statusPending: false,
      },
    };
  }

  const previousActiveRun = state.activeRun;
  if (previousActiveRun) {
    if (suppressedRunCodes.has(previousActiveRun.runId)) {
      return {
        consumedSuppressedRunCode: previousActiveRun.runId,
        shouldDrainQueue: false,
        state: {
          activeRun: null,
          pendingProtocolTerminalRun: null,
          statusPending: false,
        },
      };
    }
    if (
      protocolReplayEnabled &&
      !hasProtocolTerminalForRun(
        protocolEvents,
        sessionId,
        previousActiveRun.runId,
      )
    ) {
      return {
        shouldDrainQueue: false,
        state: {
          activeRun: null,
          pendingProtocolTerminalRun: previousActiveRun,
          statusPending: false,
        },
      };
    }
    return {
      shouldDrainQueue: true,
      state: {
        activeRun: null,
        pendingProtocolTerminalRun: null,
        statusPending: false,
      },
    };
  }

  const pendingProtocolTerminalRun = state.pendingProtocolTerminalRun;
  if (pendingProtocolTerminalRun) {
    const terminalObserved =
      !protocolReplayEnabled ||
      hasProtocolTerminalForRun(
        protocolEvents,
        sessionId,
        pendingProtocolTerminalRun.runId,
      );
    return {
      shouldDrainQueue: terminalObserved,
      state: {
        activeRun: null,
        pendingProtocolTerminalRun: terminalObserved
          ? null
          : pendingProtocolTerminalRun,
        statusPending: terminalObserved ? false : state.statusPending,
      },
    };
  }

  return {
    shouldDrainQueue: state.statusPending,
    state: {
      activeRun: null,
      pendingProtocolTerminalRun: null,
      statusPending: false,
    },
  };
}
