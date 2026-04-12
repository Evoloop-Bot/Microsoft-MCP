import { z } from "zod";
import { capabilityManifest } from "./capabilities/manifest.js";

// Only device_code is supported for the pilot.
// All shipped tools use delegated /me/... endpoints that require user context.
// client_credentials (app-only tokens) and authorization_code (hosted bridge,
// not yet implemented) are intentionally excluded from this slice.
const flowSchema = z.enum(["device_code"]);
const capabilitySchema = z.enum(["mail", "calendar", "files", "people"]);
const toolNameSchema = z.enum(capabilityManifest.map((tool) => tool.name) as [string, ...string[]]);

const rawConfigSchema = z.object({
  MICROSOFT_CLIENT_ID: z.string().min(1),
  MICROSOFT_TENANT_ID: z.string().min(1).default("common"),
  MICROSOFT_AUTH_FLOW: flowSchema.default("device_code"),
  MICROSOFT_GRAPH_BASE_URL: z.string().url().default("https://graph.microsoft.com/v1.0"),
  MICROSOFT_GRAPH_SCOPES: z.string().optional(),
  MICROSOFT_ENABLED_CAPABILITIES: z.string().default("mail,calendar,files,people"),
  MICROSOFT_ENABLED_TOOLS: z.string().optional(),
  MICROSOFT_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  MICROSOFT_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(3),
  MICROSOFT_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(500),
  MICROSOFT_TOKEN_CACHE_PATH: z.string().optional(),
  MICROSOFT_TOKEN_CACHE_USE_PLAINTEXT_FALLBACK: z.string().optional()
});

export type AuthFlow = z.infer<typeof flowSchema>;
export type Capability = z.infer<typeof capabilitySchema>;
export type ToolName = z.infer<typeof toolNameSchema>;

export interface MicrosoftGraphConfig {
  clientId: string;
  tenantId: string;
  authFlow: AuthFlow;
  graphBaseUrl: string;
  graphScopes: string[];
  enabledCapabilities: Capability[];
  enabledTools: ToolName[];
  httpTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  tokenCachePath?: string;
  tokenCacheUsePlaintextFallback: boolean;
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

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(`Expected a boolean string ("true" or "false"), got "${value}".`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): MicrosoftGraphConfig {
  const parsed = rawConfigSchema.parse(env);

  const enabledCapabilities = parseCsv(parsed.MICROSOFT_ENABLED_CAPABILITIES).map((capability) =>
    capabilitySchema.parse(capability)
  );
  const enabledTools = parsed.MICROSOFT_ENABLED_TOOLS
    ? parseCsv(parsed.MICROSOFT_ENABLED_TOOLS).map((toolName) => toolNameSchema.parse(toolName))
    : getDefaultToolsForCapabilities(enabledCapabilities);
  const configuredScopes = parseCsv(parsed.MICROSOFT_GRAPH_SCOPES);

  return {
    clientId: parsed.MICROSOFT_CLIENT_ID,
    tenantId: parsed.MICROSOFT_TENANT_ID,
    authFlow: parsed.MICROSOFT_AUTH_FLOW,
    graphBaseUrl: parsed.MICROSOFT_GRAPH_BASE_URL.replace(/\/$/, ""),
    graphScopes: configuredScopes.length > 0 ? configuredScopes : getRequiredScopes(enabledTools),
    enabledCapabilities: [...new Set(enabledTools.map((toolName) => getCapabilityForTool(toolName)))],
    enabledTools,
    httpTimeoutMs: parsed.MICROSOFT_HTTP_TIMEOUT_MS,
    maxRetries: parsed.MICROSOFT_MAX_RETRIES,
    retryBaseDelayMs: parsed.MICROSOFT_RETRY_BASE_DELAY_MS,
    tokenCachePath: parsed.MICROSOFT_TOKEN_CACHE_PATH,
    tokenCacheUsePlaintextFallback: parseBoolean(parsed.MICROSOFT_TOKEN_CACHE_USE_PLAINTEXT_FALLBACK, false)
  };
}

export function getRequiredScopes(enabledTools: ToolName[]): string[] {
  const scopes = new Set<string>(["User.Read"]);

  for (const toolName of enabledTools) {
    for (const scope of getScopesForTool(toolName)) {
      scopes.add(scope);
    }
  }

  return [...scopes];
}

export function getDefaultToolsForCapabilities(capabilities: Capability[]): ToolName[] {
  const enabledCapabilitySet = new Set(capabilities);

  return capabilityManifest
    .filter((tool) => enabledCapabilitySet.has(tool.domain))
    .map((tool) => tool.name as ToolName);
}

function getScopesForTool(toolName: ToolName): string[] {
  const tool = capabilityManifest.find((capability) => capability.name === toolName);
  if (!tool) {
    throw new Error(`Unknown tool "${toolName}".`);
  }

  return tool.requiredScopes;
}

function getCapabilityForTool(toolName: ToolName): Capability {
  const tool = capabilityManifest.find((capability) => capability.name === toolName);
  if (!tool) {
    throw new Error(`Unknown tool "${toolName}".`);
  }

  return capabilitySchema.parse(tool.domain);
}
