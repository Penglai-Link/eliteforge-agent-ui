export interface CommandExplainPayload {
  command: string;
  output: string;
}

export interface CommandExplainContext {
  onChunk?: (delta: string) => void;
  signal: AbortSignal;
}

export type CommandExplain = (
  payload: CommandExplainPayload,
  context: CommandExplainContext,
) => Promise<string>;
