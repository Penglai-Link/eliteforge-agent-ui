import { fetchEventSource } from "@microsoft/fetch-event-source";

import { parseAIStreamEvent, parseTerminalMessage } from "./protocol";
import type {
  AIRequestOptions,
  AIStreamOptions,
  AIStreamResult,
  AITransport,
} from "./types";

type MaybePromise<T> = T | Promise<T>;

export interface AITransportOptions {
  body?: (context: {
    content: string;
    stream: boolean;
    resume?: AIStreamOptions["resume"];
  }) => unknown;
  fetch?: typeof globalThis.fetch;
  headers?: HeadersInit | (() => MaybePromise<HeadersInit>);
  openWhenHidden?: boolean;
  url: string;
}

export class SseAITransport implements AITransport {
  private readonly activeRequests = new Set<AbortController>();
  private readonly fetchImplementation: typeof globalThis.fetch;
  private disposed = false;

  constructor(private readonly options: AITransportOptions) {
    this.fetchImplementation =
      options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async stream(
    content: string,
    options: AIStreamOptions,
  ): Promise<AIStreamResult> {
    const request = this.createRequest(options.signal);

    try {
      const headers = await this.createHeaders(true);
      let requestId = "";

      return await new Promise<AIStreamResult>((resolve, reject) => {
        let settled = false;
        const resolveOnce = () => {
          if (settled) return;
          settled = true;
          resolve({ requestId: requestId || "default" });
        };
        const rejectOnce = (error: unknown) => {
          if (settled) return;
          settled = true;
          reject(toError(error, "AI 流式请求失败"));
        };

        // 当 signal 被 abort 时，立即 reject Promise
        const handleAbort = () => {
          console.log("[SSE] Stream aborted, rejecting promise");
          rejectOnce(
            request.controller.signal.reason ||
              new DOMException("请求已取消", "AbortError"),
          );
        };
        if (request.controller.signal.aborted) {
          handleAbort();
          return;
        }
        request.controller.signal.addEventListener("abort", handleAbort, {
          once: true,
        });

        void fetchEventSource(this.options.url, {
          body: JSON.stringify(this.createBody(content, true, options.resume)),
          fetch: this.fetchImplementation,
          headers: Object.fromEntries([...headers]),
          method: "POST",
          onclose: resolveOnce,
          onerror: (error) => {
            rejectOnce(getRequestError(request.controller.signal, error));
            throw error;
          },
          onmessage: ({ data }) => {
            if (!data || data === "[DONE]") return;

            let payload: unknown;
            try {
              payload = JSON.parse(data);
            } catch (error) {
              rejectOnce(error);
              return;
            }

            const event = parseAIStreamEvent(payload);
            if (!event) {
              rejectOnce(new Error("AI 流式响应格式错误"));
              return;
            }

            options.onEvent?.(event);
            const message = parseTerminalMessage(payload);
            if (!message) {
              if (event.type === "RUN_ERROR") {
                rejectOnce(new Error(event.message || "AI 流式请求失败"));
              } else if (event.type === "RUN_FINISHED") {
                resolveOnce();
              }
              return;
            }

            requestId = message.messageId;
            if (message.type === "TEXT_MESSAGE_CONTENT") {
              options.onChunk({ delta: message.delta, requestId });
            } else if (message.type === "TEXT_MESSAGE_END") {
              resolveOnce();
            } else if (message.type === "TEXT_MESSAGE_ERROR") {
              rejectOnce(new Error(message.delta || "AI 流式请求失败"));
            }
          },
          openWhenHidden: this.options.openWhenHidden ?? true,
          signal: request.controller.signal,
        }).catch((error) => {
          rejectOnce(getRequestError(request.controller.signal, error));
        });
      });
    } finally {
      request.dispose();
    }
  }

  async request(content: string, options: AIRequestOptions = {}) {
    const request = this.createRequest(options.signal);

    try {
      const response = await this.fetchImplementation(this.options.url, {
        body: JSON.stringify(this.createBody(content, false)),
        headers: await this.createHeaders(false),
        method: "POST",
        signal: request.controller.signal,
      });
      const payload: unknown = await response.json();
      const message = parseTerminalMessage(payload);

      if (message?.type === "TEXT_MESSAGE_ERROR") {
        throw new Error(message.delta || "AI 请求失败");
      }
      if (!response.ok || !message) {
        throw new Error(`AI 请求失败（${response.status}）`);
      }

      return message.delta;
    } finally {
      request.dispose();
    }
  }

  dispose() {
    this.disposed = true;
    for (const controller of this.activeRequests) {
      controller.abort(new DOMException("AI transport 已销毁", "AbortError"));
    }
    this.activeRequests.clear();
  }

  private createBody(
    content: string,
    stream: boolean,
    resume?: AIStreamOptions["resume"],
  ) {
    const configuredBody = this.options.body?.({ content, stream, resume });
    if (configuredBody !== undefined) {
      if (resume?.length && isRecord(configuredBody)) {
        return { ...configuredBody, resume };
      }
      return configuredBody;
    }

    return {
      ...(content ? { messages: [{ content, role: "user" }] } : {}),
      ...(resume?.length ? { resume } : {}),
      stream,
    };
  }

  private async createHeaders(stream: boolean) {
    const configuredHeaders =
      typeof this.options.headers === "function"
        ? await this.options.headers()
        : this.options.headers;
    const headers = new Headers(configuredHeaders);

    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (!headers.has("Accept")) {
      headers.set("Accept", stream ? "text/event-stream" : "application/json");
    }

    return headers;
  }

  private createRequest(signal?: AbortSignal) {
    if (this.disposed) {
      throw new Error("AI transport 已销毁");
    }

    const controller = new AbortController();
    const handleAbort = () => {
      controller.abort(signal?.reason);
    };

    if (signal?.aborted) {
      handleAbort();
    } else {
      signal?.addEventListener("abort", handleAbort, { once: true });
    }
    this.activeRequests.add(controller);

    return {
      controller,
      dispose: () => {
        signal?.removeEventListener("abort", handleAbort);
        this.activeRequests.delete(controller);
      },
    };
  }
}

export function createAITransport(options: AITransportOptions) {
  return new SseAITransport(options);
}

function toError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    const normalizedError = new Error(error.message);
    normalizedError.name = error.name;
    return normalizedError;
  }

  return new Error(fallback);
}

function getRequestError(signal: AbortSignal, error: unknown) {
  if (!signal.aborted) {
    return error;
  }

  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("请求已取消", "AbortError");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
