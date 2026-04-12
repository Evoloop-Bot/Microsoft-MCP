import type { MicrosoftGraphConfig } from "../config.js";
import { GraphClientError, mapGraphError } from "../errors.js";
import type { TokenProvider } from "../auth/types.js";

export interface GraphRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  scopes?: string[];
}

export class GraphClient {
  constructor(
    private readonly config: MicrosoftGraphConfig,
    private readonly tokenProvider: TokenProvider
  ) {}

  async request<T>(path: string, options: GraphRequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const scopes = options.scopes ?? this.config.graphScopes;
    const token = await this.tokenProvider.getAccessToken(scopes);
    const url = this.buildUrl(path, options.query);

    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.httpTimeoutMs);

      try {
        const response = await fetch(url, {
          method,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token.token}`,
            "Content-Type": "application/json",
            ...options.headers
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal
        });

        if (response.ok) {
          // 204 No Content and 202 Accepted (e.g. /me/sendMail) carry no body.
          if (response.status === 204 || response.status === 202) {
            return undefined as T;
          }

          return (await response.json()) as T;
        }

        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        const body = await safeReadJson(response);
        const mapped = mapGraphError(response.status, body, retryAfterMs);

        if (this.shouldRetry(response.status, attempt)) {
          await sleep(retryAfterMs ?? backoffDelayMs(this.config.retryBaseDelayMs, attempt));
          continue;
        }

        throw mapped;
      } catch (error) {
        if (error instanceof GraphClientError) {
          throw error;
        }

        if (error instanceof Error && error.name === "AbortError") {
          if (this.shouldRetry(504, attempt)) {
            await sleep(backoffDelayMs(this.config.retryBaseDelayMs, attempt));
            continue;
          }

          throw new GraphClientError("The Microsoft Graph request timed out.", {
            code: "transient_upstream_error",
            status: 504
          });
        }

        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  async *paginate<T>(path: string, options: GraphRequestOptions = {}): AsyncGenerator<T, void, undefined> {
    let nextUrl: string | undefined = this.buildUrl(path, options.query);

    while (nextUrl) {
      const page: GraphCollectionResponse<T> = await this.request<GraphCollectionResponse<T>>(nextUrl, {
        ...options,
        query: undefined
      });

      for (const item of page.value) {
        yield item;
      }

      nextUrl = page["@odata.nextLink"];
    }
  }

  private buildUrl(path: string, query?: GraphRequestOptions["query"]): string {
    const base = this.config.graphBaseUrl.endsWith("/")
      ? this.config.graphBaseUrl
      : `${this.config.graphBaseUrl}/`;
    // new URL('/absolute', 'https://host/v1.0/') drops /v1.0. Strip the
    // leading slash so paths are always resolved relative to the versioned base.
    const relativePath = path.startsWith("/") ? path.slice(1) : path;
    const url = new URL(relativePath, base);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  private shouldRetry(status: number, attempt: number): boolean {
    if (attempt >= this.config.maxRetries) {
      return false;
    }

    return status === 429 || status >= 500;
  }
}

interface GraphCollectionResponse<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

async function safeReadJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { message: await response.text() };
  }

  return response.json();
}

function parseRetryAfterMs(headerValue: string | null): number | undefined {
  if (!headerValue) {
    return undefined;
  }

  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(headerValue);
  if (Number.isNaN(dateMs)) {
    return undefined;
  }

  return Math.max(0, dateMs - Date.now());
}

function backoffDelayMs(baseDelayMs: number, attempt: number): number {
  return baseDelayMs * 2 ** attempt;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
