export type GraphErrorCode =
  | "authentication_required"
  | "authorization_denied"
  | "not_found"
  | "validation_error"
  | "rate_limited"
  | "transient_upstream_error";

export class GraphClientError extends Error {
  readonly code: GraphErrorCode;
  readonly status: number;
  readonly retryAfterMs?: number;
  readonly details?: unknown;

  constructor(message: string, options: { code: GraphErrorCode; status: number; retryAfterMs?: number; details?: unknown }) {
    super(message);
    this.name = "GraphClientError";
    this.code = options.code;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
    this.details = options.details;
  }
}

export function mapGraphError(status: number, body: unknown, retryAfterMs?: number): GraphClientError {
  if (status === 401) {
    return new GraphClientError("Microsoft authentication is required.", {
      code: "authentication_required",
      status,
      details: body
    });
  }

  if (status === 403) {
    return new GraphClientError("Microsoft access was denied for the requested operation.", {
      code: "authorization_denied",
      status,
      details: body
    });
  }

  if (status === 404) {
    return new GraphClientError("The Microsoft Graph resource was not found.", {
      code: "not_found",
      status,
      details: body
    });
  }

  if (status === 400 || status === 422) {
    return new GraphClientError("The Microsoft Graph request failed validation.", {
      code: "validation_error",
      status,
      details: body
    });
  }

  if (status === 429) {
    return new GraphClientError("Microsoft Graph rate limited the request.", {
      code: "rate_limited",
      status,
      retryAfterMs,
      details: body
    });
  }

  return new GraphClientError("Microsoft Graph returned a transient upstream error.", {
    code: "transient_upstream_error",
    status,
    retryAfterMs,
    details: body
  });
}
