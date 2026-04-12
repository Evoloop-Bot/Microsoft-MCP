import { z } from "zod";

// Only device_code is supported for the pilot.
// All shipped tools use delegated /me/... endpoints that require user context.
// client_credentials (app-only tokens) and authorization_code (hosted bridge,
// not yet implemented) are intentionally excluded from this slice.
const flowSchema = z.enum(["device_code"]);
const capabilitySchema = z.enum(["mail", "calendar", "files", "people"]);

const rawConfigSchema = z.object({
  MICROSOFT_CLIENT_ID: z.string().min(1),
  MICROSOFT_TENANT_ID: z.string().min(1).default("common"),
  MICROSOFT_AUTH_FLOW: flowSchema.default("device_code"),
  MICROSOFT_GRAPH_BASE_URL: z.string().url().default("https://graph.microsoft.com/v1.0"),
  MICROSOFT_GRAPH_SCOPES: z.string().optional(),
  MICROSOFT_ENABLED_CAPABILITIES: z.string().default("mail,calendar,files,people"),
  MICROSOFT_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  MICROSOFT_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(3),
  MICROSOFT_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(500)
});

export type AuthFlow = z.infer<typeof flowSchema>;
export type Capability = z.infer<typeof capabilitySchema>;

export interface MicrosoftGraphConfig {
  clientId: string;
  tenantId: string;
  authFlow: AuthFlow;
  graphBaseUrl: string;
  graphScopes: string[];
  enabledCapabilities: Capability[];
  httpTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
}

function parseCsv(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): MicrosoftGraphConfig {
  const parsed = rawConfigSchema.parse(env);

  const enabledCapabilities = parseCsv(parsed.MICROSOFT_ENABLED_CAPABILITIES).map((capability) =>
    capabilitySchema.parse(capability)
  );
  const configuredScopes = parseCsv(parsed.MICROSOFT_GRAPH_SCOPES);

  return {
    clientId: parsed.MICROSOFT_CLIENT_ID,
    tenantId: parsed.MICROSOFT_TENANT_ID,
    authFlow: parsed.MICROSOFT_AUTH_FLOW,
    graphBaseUrl: parsed.MICROSOFT_GRAPH_BASE_URL.replace(/\/$/, ""),
    graphScopes: configuredScopes.length > 0 ? configuredScopes : getRequiredScopes(enabledCapabilities),
    enabledCapabilities,
    httpTimeoutMs: parsed.MICROSOFT_HTTP_TIMEOUT_MS,
    maxRetries: parsed.MICROSOFT_MAX_RETRIES,
    retryBaseDelayMs: parsed.MICROSOFT_RETRY_BASE_DELAY_MS
  };
}

export function getRequiredScopes(capabilities: Capability[]): string[] {
  const scopes = new Set<string>(["User.Read"]);

  for (const capability of capabilities) {
    if (capability === "mail") {
      scopes.add("Mail.Read");
      scopes.add("Mail.Send");
    }

    if (capability === "calendar") {
      scopes.add("Calendars.Read");
      scopes.add("Calendars.ReadWrite");
    }

    if (capability === "files") {
      scopes.add("Files.Read");
    }

    if (capability === "people") {
      scopes.add("People.Read");
    }
  }

  return [...scopes];
}
